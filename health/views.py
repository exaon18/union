"""JSON API for the ASTRA HEALTH dashboard (plain Django, no DRF).

GET endpoints are public (public mission dashboard). POST endpoints need
"Authorization: Token <key>" from POST /api/auth/login/ (see health/auth.py).
"""
from datetime import timedelta, timezone as dt_timezone

from django.db import connection, transaction
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .auth import json_body, token_required
from .models import Alert, Astronaut, DailyCheckIn, PVTResult, SensorReading
from .sensor_rules import evaluate_readings

LEVEL_RANK = {"green": 1, "yellow": 2, "red": 3}
VALID_LEVELS = {Alert.GREEN, Alert.YELLOW, Alert.RED}
LATEST_WINDOW_HOURS = 48
HISTORY_DEFAULT_HOURS = 24
HISTORY_DEFAULT_LIMIT = 500
HISTORY_MAX_LIMIT = 2000
ALERTS_DEFAULT_LIMIT = 50
ALERTS_MAX_LIMIT = 200
CHECKINS_DEFAULT_LIMIT = 30
CHECKINS_MAX_LIMIT = 200
PVT_DEFAULT_LIMIT = 30
PVT_MAX_LIMIT = 200
MAX_METRICS = 200                      # safety cap for the per-metric scan
FUTURE_TOLERANCE = timedelta(minutes=5)  # ignore readings dated in the future (bad device clocks)


def _iso(dt):
    """ISO 8601 in mission-control time (EAT, +03:00). Browsers convert it as needed."""
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_default_timezone())
    return timezone.localtime(dt).isoformat()


def _error(message, status):
    return JsonResponse({"error": message}, status=status)


def _parse_int(value, name):
    try:
        return int(value), None
    except (TypeError, ValueError):
        return None, _error(f"{name} must be an integer", 400)


def _parse_optional_int(request, name):
    raw = request.GET.get(name)
    if raw is None or raw == "":
        return None, None
    return _parse_int(raw, name)


def _parse_limit(request, default, maximum, name="limit"):
    raw = request.GET.get(name)
    if raw is None or raw == "":
        return default, None
    value, err = _parse_int(raw, name)
    if err:
        return None, err
    if value < 1:
        return None, _error(f"{name} must be at least 1", 400)
    return min(value, maximum), None


def _get_astronaut_by_id(pk):
    try:
        return Astronaut.objects.select_related("user").get(pk=pk), None
    except Astronaut.DoesNotExist:
        return None, _error(f"unknown astronaut {pk}", 404)


def _astronaut_from_query(request, required=False):
    raw = request.GET.get("astronaut")
    if raw is None or raw == "":
        if required:
            return None, _error("astronaut is required", 400)
        return None, None
    pk, err = _parse_int(raw, "astronaut")
    if err:
        return None, err
    return _get_astronaut_by_id(pk)


def _astronaut_name(astronaut):
    return astronaut.user.get_full_name() or astronaut.user.username


def _reading_json(reading):
    return {
        "metric": reading.metric,
        "value": reading.value,
        "text_value": reading.text_value or "",
        "unit": reading.unit,
        "source": reading.source,
        "timestamp": _iso(reading.timestamp),
    }


def _readings_for(astronaut_id):
    """Base queryset for one astronaut, or cabin data when astronaut_id is None."""
    if astronaut_id is None:
        return SensorReading.objects.filter(astronaut__isnull=True)
    return SensorReading.objects.filter(astronaut_id=astronaut_id)


def _distinct_metrics(astronaut_id):
    """
    Metric names for one astronaut (or cabin), via an index "skip scan":
    each step is one seek on (astronaut, metric, timestamp) instead of scanning every row.
    """
    base = _readings_for(astronaut_id).order_by("metric").values_list("metric", flat=True)
    metrics, last = [], None
    while len(metrics) < MAX_METRICS:
        nxt = (base.filter(metric__gt=last) if last is not None else base).first()
        if nxt is None:
            break
        metrics.append(nxt)
        last = nxt
    return metrics


def _latest_per_metric(astronaut_id, hours=LATEST_WINDOW_HOURS):
    """Newest reading per metric from the last `hours`. One indexed LIMIT 1 query per metric."""
    now = timezone.now()
    since, until = now - timedelta(hours=hours), now + FUTURE_TOLERANCE
    base = _readings_for(astronaut_id).filter(timestamp__gte=since, timestamp__lte=until)
    out = []
    for metric in _distinct_metrics(astronaut_id):
        r = base.filter(metric=metric).order_by("-timestamp", "-id").first()
        if r is not None:
            out.append(_reading_json(r))
    return out


def _last_reading_at(astronaut_id):
    return (
        _readings_for(astronaut_id)
        .filter(timestamp__lte=timezone.now() + FUTURE_TOLERANCE)
        .order_by("-timestamp")
        .values_list("timestamp", flat=True)
        .first()
    )


def _open_alert_levels():
    """{astronaut_id: {level: count}} for unresolved alerts, in one GROUP BY query."""
    out = {}
    rows = (
        Alert.objects.filter(resolved=False)
        .order_by()
        .values("astronaut_id", "level")
        .annotate(n=Count("id"))
    )
    for row in rows:
        out.setdefault(row["astronaut_id"], {})[row["level"]] = row["n"]
    return out


def _crew_payload(astronaut, level_counts, last_reading_at, include_baselines=False):
    """level_counts = {"red": 2, "yellow": 1} for this astronaut's unresolved alerts."""
    worst = "green"
    for level, n in level_counts.items():
        if n and LEVEL_RANK.get(level, 0) > LEVEL_RANK.get(worst, 0):
            worst = level
    open_alerts = sum(level_counts.values())
    data = {
        "id": astronaut.id,
        "name": _astronaut_name(astronaut),
        "mission": astronaut.mission,
        "role": astronaut.role,
        "status": worst,
        "open_alerts": open_alerts,
        "last_reading_at": _iso(last_reading_at),
    }
    if include_baselines:
        data["baselines"] = {
            "heart_rate": astronaut.baseline_heart_rate,
            "systolic_bp": astronaut.baseline_systolic_bp,
            "diastolic_bp": astronaut.baseline_diastolic_bp,
        }
    return data


def _alert_json(alert):
    return {
        "id": alert.id,
        "astronaut_id": alert.astronaut_id,
        "astronaut": _astronaut_name(alert.astronaut) if alert.astronaut_id else None,
        "system": alert.system,
        "level": alert.level,
        "message": alert.message,
        "recommendation": alert.recommendation,
        "acknowledged": alert.acknowledged,
        "acknowledged_at": _iso(alert.acknowledged_at),
        "resolved": alert.resolved,
        "resolved_at": _iso(alert.resolved_at),
        # username of the flight surgeon, "auto" when the system closed it, null while open
        "resolved_by": (alert.resolved_by.username if alert.resolved_by_id else ("auto" if alert.resolved else None)),
        "acknowledged_by": alert.acknowledged_by.username if alert.acknowledged_by_id else None,
        "source": "checkin" if alert.checkin_id else ("sensor" if alert.reading_id else "other"),
        "created_at": _iso(alert.created_at),
    }


def _pvt_json(p):
    return {
        "id": p.id,
        "astronaut_id": p.astronaut_id,
        "created_at": _iso(p.created_at),
        "mean_rt_ms": p.mean_rt_ms,
        "fastest_ms": p.fastest_ms,
        "lapses": p.lapses,
        "false_starts": p.false_starts,
        "trials": p.trials,
    }


def _checkin_json(checkin):
    return {
        "id": checkin.id,
        "astronaut_id": checkin.astronaut_id,
        "created_at": _iso(checkin.created_at),
        "heart_rate": checkin.heart_rate,
        "systolic_bp": checkin.systolic_bp,
        "diastolic_bp": checkin.diastolic_bp,
        "temperature": checkin.temperature,
        "exercise_minutes": checkin.exercise_minutes,
        "sleep_hours": checkin.sleep_hours,
        "mood": checkin.mood,
        "stress": checkin.stress,
        "radiation_msv": checkin.radiation_msv,
        "symptoms": checkin.symptoms,
    }


ENDPOINTS = [
    {"method": "GET", "path": "/api/", "auth": "public", "description": "This index."},
    {"method": "POST", "path": "/api/auth/login/", "auth": "public",
     "description": 'Body {"username","password"} -> {"token", "user": {username, name, role, astronaut_id}}.'},
    {"method": "GET", "path": "/api/auth/me/", "auth": "token", "description": "The logged-in user."},
    {"method": "POST", "path": "/api/auth/logout/", "auth": "token", "description": "Delete the current token."},
    {"method": "GET", "path": "/api/crew/", "auth": "public", "description": "All astronauts with overall status and open alert counts."},
    {"method": "GET", "path": "/api/crew/<id>/", "auth": "public", "description": "One astronaut, including personal baselines."},
    {"method": "GET", "path": "/api/readings/latest/", "auth": "public",
     "description": "Newest reading per metric. Pass ?astronaut=<id> or ?source=cabin. Optional &hours=48."},
    {"method": "GET", "path": "/api/cabin/latest/", "auth": "public", "description": "Newest cabin/environment reading per metric (no astronaut)."},
    {"method": "GET", "path": "/api/readings/history/", "auth": "public",
     "description": "Time series, oldest first. Requires ?astronaut=<id>&metric=<name>. Optional &hours=24&limit=500."},
    {"method": "GET", "path": "/api/alerts/", "auth": "public",
     "description": "Alerts, newest first. Optional ?astronaut=<id>&level=red&resolved=false&acknowledged=false&limit=50."},
    {"method": "POST", "path": "/api/alerts/<id>/acknowledge/", "auth": "token (surgeon)", "description": "Mark an alert as seen by mission support."},
    {"method": "POST", "path": "/api/alerts/<id>/resolve/", "auth": "token (surgeon)", "description": "Close an alert."},
    {"method": "GET", "path": "/api/checkins/", "auth": "public",
     "description": "Recent daily check-ins, newest first. Optional ?astronaut=<id>&limit=30."},
    {"method": "POST", "path": "/api/checkins/", "auth": "token (astronaut: own data)",
     "description": "Submit a daily check-in. Runs the check-in rules and returns the alerts it created."},
    {"method": "GET", "path": "/api/pvt/", "auth": "public", "description": "PVT results, newest first. Optional ?astronaut=<id>&limit=30."},
    {"method": "POST", "path": "/api/pvt/", "auth": "token (astronaut: own data)",
     "description": "Save a PVT run; also stores pvt_reaction_time and pvt_lapses readings so sensor rules fire."},
    {"method": "GET", "path": "/api/sim/scenario/", "auth": "public",
     "description": "Active simulation scenario (what the device simulator sends), resolved per astronaut, and the presets."},
    {"method": "POST", "path": "/api/sim/scenario/", "auth": "token (surgeon)",
     "description": 'Change it. Body {"preset","target","system","custom","cabin","reset","apply_now"}.'},
    {"method": "POST", "path": "/api/sim/reset/", "auth": "token (surgeon)", "description": "Resolve all open alerts."},
    {"method": "POST", "path": "/api/sim/tick/", "auth": "token (surgeon)", "description": "Push one simulated batch now."},
    {"method": "GET", "path": "/api/space-weather/", "auth": "none", "description": "Real NASA DONKI space weather: crew state, latest events, replayable events."},
    {"method": "GET", "path": "/api/nasa/reference/", "auth": "none", "description": "Reference bands derived from NASA OSDR OSD-575, OSD-656 and OSD-53, with provenance."},
    {"method": "POST", "path": "/api/webhook/readings/", "auth": "HMAC (X-Astra-Signature)",
     "description": "Device webhook. HMAC-signed. Not for the frontend."},
]


@require_GET
def api_index(request):
    return JsonResponse({
        "name": "ASTRA HEALTH API",
        "description": "JSON API for live crew, cabin, reading, alert, check-in and PVT data. "
                       "GET is public; POST needs 'Authorization: Token <key>' from /api/auth/login/.",
        "server_time": _iso(timezone.now()),
        "time_zone": "Africa/Addis_Ababa (EAT, UTC+3)",
        "endpoints": ENDPOINTS,
    })


@require_GET
def crew_list(request):
    crew = list(Astronaut.objects.select_related("user").order_by("id"))
    levels = _open_alert_levels()
    return JsonResponse({
        "count": len(crew),
        "astronauts": [
            _crew_payload(a, levels.get(a.id, {}), _last_reading_at(a.id)) for a in crew
        ],
    })


@require_GET
def crew_detail(request, pk):
    parsed, err = _parse_int(pk, "id")
    if err:
        return err
    astronaut, err = _get_astronaut_by_id(parsed)
    if err:
        return err
    level_counts = {
        row["level"]: row["n"]
        for row in astronaut.alerts.filter(resolved=False).order_by()
        .values("level").annotate(n=Count("id"))
    }
    payload = _crew_payload(astronaut, level_counts, _last_reading_at(astronaut.id), include_baselines=True)
    return JsonResponse(payload)


def _window_hours(request):
    hours, err = _parse_optional_int(request, "hours")
    if err:
        return None, err
    if hours is not None and hours < 1:
        return None, _error("hours must be at least 1", 400)
    return hours or LATEST_WINDOW_HOURS, None


@require_GET
def readings_latest(request):
    window, err = _window_hours(request)
    if err:
        return err

    source = (request.GET.get("source") or "").strip()
    raw_astronaut = request.GET.get("astronaut")
    if raw_astronaut not in (None, ""):
        astronaut, err = _astronaut_from_query(request, required=True)
        if err:
            return err
        readings = _latest_per_metric(astronaut.id, hours=window)
        return JsonResponse({
            "astronaut_id": astronaut.id,
            "astronaut": _astronaut_name(astronaut),
            "count": len(readings),
            "readings": readings,
        })

    if source == "cabin":
        readings = _latest_per_metric(None, hours=window)
        return JsonResponse({"source": "cabin", "count": len(readings), "readings": readings})

    if source:
        return _error("source must be cabin when astronaut is not set", 400)
    return _error("Provide ?astronaut=<id> or ?source=cabin", 400)


@require_GET
def cabin_latest(request):
    window, err = _window_hours(request)
    if err:
        return err
    readings = _latest_per_metric(None, hours=window)
    return JsonResponse({"source": "cabin", "count": len(readings), "readings": readings})


@require_GET
def readings_history(request):
    astronaut, err = _astronaut_from_query(request, required=True)
    if err:
        return err
    metric = (request.GET.get("metric") or "").strip()
    if not metric:
        return _error("metric is required", 400)

    hours, err = _parse_optional_int(request, "hours")
    if err:
        return err
    if hours is None:
        hours = HISTORY_DEFAULT_HOURS
    elif hours < 1:
        return _error("hours must be at least 1", 400)

    limit, err = _parse_limit(request, HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT)
    if err:
        return err

    now = timezone.now()
    since, until = now - timedelta(hours=hours), now + FUTURE_TOLERANCE
    qs = SensorReading.objects.filter(
        astronaut=astronaut, metric=metric, timestamp__gte=since, timestamp__lte=until,
    )
    downsample = (request.GET.get("downsample") or "true").strip().lower() not in ("false", "0", "no")
    points, bucket_seconds = None, None
    if downsample and connection.vendor == "sqlite" and qs.count() > limit:
        # Too many points for the window (e.g. 24 h of 3 s readings): average them into
        # <= limit time buckets so the chart still covers the whole window.
        bucket_seconds = max(1, -(-hours * 3600 // limit))
        points = _bucketed_history(astronaut.id, metric, since, until, bucket_seconds)
    if points is None:
        # Newest `limit` points (index scan backwards), returned oldest first for charts.
        rows = list(qs.order_by("-timestamp", "-id")[:limit])
        rows.reverse()
        points = [_reading_json(r) for r in rows]
    payload = {
        "astronaut_id": astronaut.id,
        "astronaut": _astronaut_name(astronaut),
        "metric": metric,
        "hours": hours,
        "count": len(points),
        "readings": points,
    }
    if bucket_seconds:
        payload["bucket_seconds"] = bucket_seconds
    return JsonResponse(payload)


def _bucketed_history(astronaut_id, metric, since, until, bucket_seconds):
    """Average numeric readings per time bucket (SQLite). Returns None for text metrics."""
    table = SensorReading._meta.db_table
    to_db = connection.ops.adapt_datetimefield_value
    sql = f"""
        SELECT CAST((julianday(timestamp) - julianday(%s)) * 86400 / %s AS INTEGER) AS b,
               AVG(value), MAX(timestamp), COUNT(value), MAX(unit), MAX(source)
        FROM {table}
        WHERE astronaut_id = %s AND metric = %s AND timestamp >= %s AND timestamp <= %s
        GROUP BY b ORDER BY b
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [to_db(since), bucket_seconds, astronaut_id, metric, to_db(since), to_db(until)])
        rows = cursor.fetchall()
    if not rows or all(r[3] == 0 for r in rows):
        return None
    out = []
    for _b, avg, last_ts, n, unit, source in rows:
        if not n:
            continue
        ts = parse_datetime(last_ts) if isinstance(last_ts, str) else last_ts
        if ts is not None and timezone.is_naive(ts):
            ts = ts.replace(tzinfo=dt_timezone.utc)
        out.append({
            "metric": metric, "value": round(avg, 2), "text_value": "", "unit": unit or "",
            "source": source or "", "timestamp": _iso(ts), "samples": n,
        })
    return out


def _bool_param(request, name):
    raw = request.GET.get(name)
    if raw in (None, ""):
        return None, None
    value = raw.strip().lower()
    if value in ("true", "1", "yes"):
        return True, None
    if value in ("false", "0", "no"):
        return False, None
    return None, _error(f"{name} must be true or false", 400)


@require_GET
def alerts_list(request):
    qs = Alert.objects.select_related("astronaut__user", "resolved_by", "acknowledged_by")

    raw_astronaut = request.GET.get("astronaut")
    if raw_astronaut not in (None, ""):
        if raw_astronaut.strip().lower() == "cabin":
            qs = qs.filter(astronaut__isnull=True)
        else:
            astronaut, err = _astronaut_from_query(request, required=True)
            if err:
                return err
            qs = qs.filter(astronaut=astronaut)

    level = (request.GET.get("level") or "").strip()
    if level:
        if level not in VALID_LEVELS:
            return _error("level must be green, yellow, or red", 400)
        qs = qs.filter(level=level)

    for name in ("resolved", "acknowledged"):
        value, err = _bool_param(request, name)
        if err:
            return err
        if value is not None:
            qs = qs.filter(**{name: value})

    limit, err = _parse_limit(request, ALERTS_DEFAULT_LIMIT, ALERTS_MAX_LIMIT)
    if err:
        return err

    # Newest first, regardless of the model's default resolved-then-created ordering.
    alerts = list(qs.order_by("-created_at", "-id")[:limit])
    return JsonResponse({
        "count": len(alerts),
        "alerts": [_alert_json(a) for a in alerts],
    })


def _alert_action(request, pk, action):
    parsed, err = _parse_int(pk, "id")
    if err:
        return err
    alert = Alert.objects.select_related("astronaut__user").filter(pk=parsed).first()
    if alert is None:
        return _error(f"unknown alert {pk}", 404)
    now = timezone.now()
    if not alert.acknowledged:
        alert.acknowledged, alert.acknowledged_at, alert.acknowledged_by = True, now, request.api_user
    if action == "resolve" and not alert.resolved:
        alert.resolved, alert.resolved_at, alert.resolved_by = True, now, request.api_user
    alert.save(update_fields=["acknowledged", "acknowledged_at", "acknowledged_by",
                              "resolved", "resolved_at", "resolved_by"])
    return JsonResponse({"alert": _alert_json(alert)})


@csrf_exempt
@require_POST
@token_required(roles=["surgeon"])
def alert_acknowledge(request, pk):
    return _alert_action(request, pk, "acknowledge")


@csrf_exempt
@require_POST
@token_required(roles=["surgeon"])
def alert_resolve(request, pk):
    return _alert_action(request, pk, "resolve")


# ---------- writes for astronauts ----------

def _target_astronaut(request, data):
    """
    Astronauts may only write their own data (astronaut_id is optional or must match).
    Surgeons must name the astronaut_id.
    """
    raw = data.get("astronaut_id")
    if request.api_role == "astronaut":
        own = request.api_astronaut
        if raw not in (None, "") and str(raw) != str(own.id):
            return None, _error("astronauts can only submit their own data", 403)
        return own, None
    if raw in (None, ""):
        return None, _error("astronaut_id is required", 400)
    pk, err = _parse_int(raw, "astronaut_id")
    if err:
        return None, err
    return _get_astronaut_by_id(pk)


def _number(data, name, lo, hi, required=True, integer=False, default=None):
    raw = data.get(name)
    if raw is None or raw == "":
        if required:
            raise ValueError(f"{name} is required")
        return default
    if isinstance(raw, bool):
        raise ValueError(f"{name} must be a number")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number")
    if integer:
        if value != int(value):
            raise ValueError(f"{name} must be a whole number")
        value = int(value)
    if not (lo <= value <= hi):
        raise ValueError(f"{name} must be between {lo} and {hi}")
    return value


CHECKIN_FIELDS = {
    # name: (min, max, required, integer, default)
    "heart_rate": (30, 220, True, True, None),
    "systolic_bp": (70, 250, True, True, None),
    "diastolic_bp": (40, 150, True, True, None),
    "temperature": (34, 43, True, False, None),
    "exercise_minutes": (0, 300, False, True, 0),
    "sleep_hours": (0, 16, True, False, None),
    "mood": (1, 5, True, True, None),
    "stress": (1, 5, True, True, None),
    "radiation_msv": (0, 50, False, False, 0),
}


@csrf_exempt
@require_http_methods(["GET", "HEAD", "POST"])
def checkins_view(request):
    """GET = public list, POST = submit (token)."""
    if request.method == "POST":
        return checkin_create(request)
    return checkins_list(request)


@require_GET
def checkins_list(request):
    qs = DailyCheckIn.objects.select_related("astronaut__user")
    raw_astronaut = request.GET.get("astronaut")
    if raw_astronaut not in (None, ""):
        astronaut, err = _astronaut_from_query(request, required=True)
        if err:
            return err
        qs = qs.filter(astronaut=astronaut)

    limit, err = _parse_limit(request, CHECKINS_DEFAULT_LIMIT, CHECKINS_MAX_LIMIT)
    if err:
        return err

    checkins = list(qs.order_by("-created_at", "-id")[:limit])
    return JsonResponse({
        "count": len(checkins),
        "checkins": [_checkin_json(c) for c in checkins],
    })


@require_POST
@token_required(roles=["astronaut", "surgeon"])
def checkin_create(request):
    data, err = json_body(request)
    if err:
        return err
    astronaut, err = _target_astronaut(request, data)
    if err:
        return err
    try:
        fields = {name: _number(data, name, lo, hi, req, integer, default)
                  for name, (lo, hi, req, integer, default) in CHECKIN_FIELDS.items()}
        if fields["diastolic_bp"] >= fields["systolic_bp"]:
            raise ValueError("diastolic_bp must be lower than systolic_bp")
        urine_calcium = _number(data, "urine_calcium", 0, 1000, required=False)
    except ValueError as e:
        return _error(str(e), 400)
    symptoms = str(data.get("symptoms") or "").strip()
    if len(symptoms) > 500:
        return _error("symptoms must be at most 500 characters", 400)

    with transaction.atomic():
        # post_save signal runs health/rules.py and creates the check-in alerts
        checkin = DailyCheckIn.objects.create(astronaut=astronaut, symptoms=symptoms, **fields)
        alerts = list(checkin.alerts.select_related("astronaut__user").order_by("id"))
        if urine_calcium is not None:
            reading = SensorReading.objects.create(
                astronaut=astronaut, source="lab", metric="urine_calcium",
                value=urine_calcium, unit="mg/day", timestamp=checkin.created_at,
            )
            alerts += evaluate_readings([reading], dedup_minutes=0)

    return JsonResponse({
        "checkin": _checkin_json(checkin),
        "alerts": [_alert_json(a) for a in alerts],
        "status": _worst(a.level for a in alerts),
    }, status=201)


def _worst(levels):
    worst = "green"
    for level in levels:
        if LEVEL_RANK.get(level, 0) > LEVEL_RANK.get(worst, 0):
            worst = level
    return worst


@csrf_exempt
@require_http_methods(["GET", "HEAD", "POST"])
def pvt_view(request):
    """GET = public list, POST = save a run (token)."""
    if request.method == "POST":
        return pvt_create(request)
    return pvt_list(request)


@require_GET
def pvt_list(request):
    qs = PVTResult.objects.all()
    raw_astronaut = request.GET.get("astronaut")
    if raw_astronaut not in (None, ""):
        astronaut, err = _astronaut_from_query(request, required=True)
        if err:
            return err
        qs = qs.filter(astronaut=astronaut)
    limit, err = _parse_limit(request, PVT_DEFAULT_LIMIT, PVT_MAX_LIMIT)
    if err:
        return err
    results = list(qs.order_by("-created_at", "-id")[:limit])
    return JsonResponse({"count": len(results), "results": [_pvt_json(p) for p in results]})


@require_POST
@token_required(roles=["astronaut", "surgeon"])
def pvt_create(request):
    data, err = json_body(request)
    if err:
        return err
    astronaut, err = _target_astronaut(request, data)
    if err:
        return err
    if data.get("mean_rt_ms") in (None, "") and data.get("mean_rt") not in (None, ""):
        data["mean_rt_ms"] = data["mean_rt"]          # the frontend's older field name
    try:
        trials = _number(data, "trials", 1, 100, integer=True)
        mean_rt_ms = _number(data, "mean_rt_ms", 50, 10000, integer=True)
        fastest_ms = _number(data, "fastest_ms", 50, 10000, required=False, integer=True)
        lapses = _number(data, "lapses", 0, 100, required=False, integer=True, default=0)
        false_starts = _number(data, "false_starts", 0, 100, required=False, integer=True, default=0)
        if lapses > trials:
            raise ValueError("lapses cannot be more than trials")
    except ValueError as e:
        return _error(str(e), 400)

    with transaction.atomic():
        pvt = PVTResult.objects.create(
            astronaut=astronaut, mean_rt_ms=mean_rt_ms, fastest_ms=fastest_ms,
            lapses=lapses, false_starts=false_starts, trials=trials,
        )
        readings = SensorReading.objects.bulk_create([
            SensorReading(astronaut=astronaut, source="pvt_test", metric="pvt_reaction_time",
                          value=mean_rt_ms, unit="ms", timestamp=pvt.created_at),
            SensorReading(astronaut=astronaut, source="pvt_test", metric="pvt_lapses",
                          value=lapses, unit="", timestamp=pvt.created_at),
        ])
        alerts = evaluate_readings(readings, dedup_minutes=0)

    for a in alerts:
        a.astronaut = astronaut
    return JsonResponse({
        "pvt": _pvt_json(pvt),
        "alerts": [_alert_json(a) for a in alerts],
        "status": _worst(a.level for a in alerts),
    }, status=201)

"""Read-only JSON API for the ASTRA HEALTH dashboard."""
from datetime import timedelta

from django.db.models import Max, OuterRef, Subquery
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET

from .models import Alert, Astronaut, DailyCheckIn, SensorReading

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


def _iso(dt):
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.utc)
    return dt.isoformat()


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


def _latest_per_metric(qs, hours=LATEST_WINDOW_HOURS):
    """Newest reading per metric, scanning only the last `hours` of rows."""
    since = timezone.now() - timedelta(hours=hours)
    windowed = qs.filter(timestamp__gte=since)
    latest_id = (
        windowed.filter(metric=OuterRef("metric"))
        .order_by("-timestamp", "-id")
        .values("id")[:1]
    )
    rows = windowed.filter(id=Subquery(latest_id)).order_by("metric")
    return [_reading_json(r) for r in rows]


def _crew_payload(astronaut, open_alerts, last_reading_at, unresolved_levels, include_baselines=False):
    worst = "green"
    for level in unresolved_levels:
        if LEVEL_RANK.get(level, 0) > LEVEL_RANK.get(worst, 0):
            worst = level
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
        "resolved": alert.resolved,
        "created_at": _iso(alert.created_at),
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


@require_GET
def api_index(request):
    return JsonResponse({
        "name": "ASTRA HEALTH API",
        "description": "Read-only JSON API for live crew, cabin, reading, alert and check-in data.",
        "endpoints": [
            {"method": "GET", "path": "/api/", "description": "This index."},
            {"method": "GET", "path": "/api/crew/", "description": "All astronauts with overall status and open alert counts."},
            {"method": "GET", "path": "/api/crew/<id>/", "description": "One astronaut, including personal baselines."},
            {
                "method": "GET",
                "path": "/api/readings/latest/",
                "description": "Newest reading per metric. Pass ?astronaut=<id> or ?source=cabin.",
            },
            {"method": "GET", "path": "/api/cabin/latest/", "description": "Newest cabin/environment reading per metric (no astronaut)."},
            {
                "method": "GET",
                "path": "/api/readings/history/",
                "description": "Time series, oldest first. Requires ?astronaut=<id>&metric=<name>. Optional &hours=24&limit=500.",
            },
            {
                "method": "GET",
                "path": "/api/alerts/",
                "description": "Alerts, newest first. Optional ?astronaut=<id>&level=red&resolved=false&limit=50.",
            },
            {
                "method": "GET",
                "path": "/api/checkins/",
                "description": "Recent daily check-ins, newest first. Optional ?astronaut=<id>&limit=30.",
            },
            {
                "method": "POST",
                "path": "/api/webhook/readings/",
                "description": "Device webhook. HMAC-signed. Not for the frontend.",
            },
        ],
    })


@require_GET
def crew_list(request):
    # Annotate only last_reading_at here. Counting alerts in the same query
    # would multiply rows against readings and inflate the count.
    crew = list(
        Astronaut.objects.select_related("user")
        .annotate(last_reading_at=Max("readings__timestamp"))
        .order_by("id")
    )
    levels_by_id = {}
    if crew:
        for astronaut_id, level in Alert.objects.filter(
            resolved=False, astronaut_id__in=[a.id for a in crew]
        ).values_list("astronaut_id", "level"):
            levels_by_id.setdefault(astronaut_id, []).append(level)
    return JsonResponse({
        "count": len(crew),
        "astronauts": [
            _crew_payload(
                a,
                len(levels_by_id.get(a.id, [])),
                a.last_reading_at,
                levels_by_id.get(a.id, []),
            )
            for a in crew
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
    open_alerts = astronaut.alerts.filter(resolved=False)
    last_reading_at = astronaut.readings.aggregate(ts=Max("timestamp"))["ts"]
    payload = _crew_payload(
        astronaut,
        open_alerts.count(),
        last_reading_at,
        open_alerts.values_list("level", flat=True),
        include_baselines=True,
    )
    return JsonResponse(payload)


@require_GET
def readings_latest(request):
    hours, err = _parse_optional_int(request, "hours")
    if err:
        return err
    if hours is not None and hours < 1:
        return _error("hours must be at least 1", 400)
    window = hours or LATEST_WINDOW_HOURS

    source = (request.GET.get("source") or "").strip()
    raw_astronaut = request.GET.get("astronaut")
    if raw_astronaut not in (None, ""):
        astronaut, err = _astronaut_from_query(request, required=True)
        if err:
            return err
        qs = SensorReading.objects.filter(astronaut=astronaut)
        readings = _latest_per_metric(qs, hours=window)
        return JsonResponse({
            "astronaut_id": astronaut.id,
            "astronaut": _astronaut_name(astronaut),
            "count": len(readings),
            "readings": readings,
        })

    if source == "cabin":
        readings = _latest_per_metric(
            SensorReading.objects.filter(astronaut__isnull=True), hours=window
        )
        return JsonResponse({"source": "cabin", "count": len(readings), "readings": readings})

    if source:
        return _error("source must be cabin when astronaut is not set", 400)
    return _error("Provide ?astronaut=<id> or ?source=cabin", 400)


@require_GET
def cabin_latest(request):
    hours, err = _parse_optional_int(request, "hours")
    if err:
        return err
    if hours is not None and hours < 1:
        return _error("hours must be at least 1", 400)
    window = hours or LATEST_WINDOW_HOURS
    readings = _latest_per_metric(
        SensorReading.objects.filter(astronaut__isnull=True), hours=window
    )
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

    since = timezone.now() - timedelta(hours=hours)
    qs = (
        SensorReading.objects.filter(
            astronaut=astronaut, metric=metric, timestamp__gte=since
        )
        .order_by("timestamp", "id")
    )
    # If more than `limit` points exist, keep the most recent ones but still return ascending.
    total = qs.count()
    if total > limit:
        readings = list(qs[total - limit:])
    else:
        readings = list(qs)
    return JsonResponse({
        "astronaut_id": astronaut.id,
        "astronaut": _astronaut_name(astronaut),
        "metric": metric,
        "hours": hours,
        "count": len(readings),
        "readings": [_reading_json(r) for r in readings],
    })


@require_GET
def alerts_list(request):
    qs = Alert.objects.select_related("astronaut__user")

    raw_astronaut = request.GET.get("astronaut")
    if raw_astronaut not in (None, ""):
        astronaut, err = _astronaut_from_query(request, required=True)
        if err:
            return err
        qs = qs.filter(astronaut=astronaut)
    else:
        astronaut = None

    level = (request.GET.get("level") or "").strip()
    if level:
        if level not in VALID_LEVELS:
            return _error("level must be green, yellow, or red", 400)
        qs = qs.filter(level=level)

    raw_resolved = request.GET.get("resolved")
    if raw_resolved not in (None, ""):
        value = raw_resolved.strip().lower()
        if value in ("true", "1", "yes"):
            qs = qs.filter(resolved=True)
        elif value in ("false", "0", "no"):
            qs = qs.filter(resolved=False)
        else:
            return _error("resolved must be true or false", 400)

    limit, err = _parse_limit(request, ALERTS_DEFAULT_LIMIT, ALERTS_MAX_LIMIT)
    if err:
        return err

    # Newest first, regardless of the model's default resolved-then-created ordering.
    alerts = list(qs.order_by("-created_at", "-id")[:limit])
    return JsonResponse({
        "count": len(alerts),
        "alerts": [_alert_json(a) for a in alerts],
    })


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

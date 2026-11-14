"""
Webhook endpoint that receives real-time readings from the device simulator
(or, in the future, from real wearables and cabin sensors).

POST /api/webhook/readings/
Headers:
  Content-Type: application/json
  X-Astra-Signature: sha256=<HMAC-SHA256 of the raw body using WEBHOOK_SECRET>
Body: one reading object, or {"readings": [ ... ]}
  {"timestamp": "2026-11-14T12:30:00+00:00", "astronaut_id": 1, "source": "wearable",
   "metric": "heart_rate", "value": 82, "unit": "bpm"}

Timestamps should carry a UTC offset. A timestamp WITHOUT an offset is read as
settings.TIME_ZONE (Africa/Addis_Ababa, EAT). Readings more than 5 minutes in the
future are clamped to "now" so a wrong device clock can't hide newer data.
"""
import hashlib
import hmac
import json
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import Alert, Astronaut, SensorReading
from .sensor_rules import evaluate_readings, match_reading

MAX_FUTURE = timedelta(minutes=5)


def _signature_ok(request):
    secret = getattr(settings, "WEBHOOK_SECRET", "")
    if not secret:          # no secret configured -> accept (dev only)
        return True
    expected = "sha256=" + hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, request.headers.get("X-Astra-Signature", ""))


def parse_timestamp(raw, now=None):
    """ISO string -> aware datetime. Naive = settings.TIME_ZONE. Missing/invalid = now."""
    now = now or timezone.now()
    ts = parse_datetime(raw) if isinstance(raw, str) and raw else None
    if ts is None:
        return now
    if timezone.is_naive(ts):
        ts = timezone.make_aware(ts, timezone.get_default_timezone())
    if ts > now + MAX_FUTURE:
        ts = now
    return ts


def clear_recovered_alerts(readings, new_alerts, now=None):
    """
    Close open sensor alerts whose metric has improved: a reading in this batch for the same
    astronaut + metric is back in range (or now at a lower level, e.g. a red heart-rate alert
    when the heart rate is only yellow), and the alert is older than ALERT_CLEAR_AFTER_SECONDS
    (so a one-off spike stays visible for a moment). Persistent problems never clear this way.
    """
    seconds = getattr(settings, "ALERT_CLEAR_AFTER_SECONDS", 0)
    if seconds <= 0 or not readings:
        return 0
    now = now or timezone.now()
    rank = {None: 0, Alert.YELLOW: 1, Alert.RED: 2}
    current = {}       # (astronaut_id, metric) -> worst level seen in this batch (None = normal)
    for a in new_alerts:
        if a.reading_id:
            key = (a.reading.astronaut_id, a.reading.metric)
            current[key] = max(current.get(key), a.level, key=lambda lv: rank.get(lv, 0))
    for r in readings:
        key = (r.astronaut_id, r.metric)
        hit = match_reading(r)        # a deduplicated abnormal reading is still abnormal
        level = hit.level if hit else None
        current[key] = max(current.get(key), level, key=lambda lv: rank.get(lv, 0)) if key in current else level
    candidates = Alert.objects.filter(
        resolved=False, reading__isnull=False, created_at__lt=now - timedelta(seconds=seconds),
    ).values_list("id", "astronaut_id", "reading__metric", "level")
    ids = [pk for pk, aid, metric, level in candidates
           if (aid, metric) in current and rank[current[(aid, metric)]] < rank.get(level, 0)]
    if ids:
        Alert.objects.filter(id__in=ids).update(resolved=True, resolved_at=now)
    return len(ids)


def auto_resolve_stale_sensor_alerts(now=None):
    """
    Close open SENSOR alerts older than ALERT_AUTO_RESOLVE_MINUTES (check-in/PVT alerts stay
    open for the flight surgeon). A condition that persists keeps raising a fresh alert every
    ALERT_DEDUP_MINUTES, so the dashboard shows what is wrong *now*, not everything since launch.
    """
    minutes = getattr(settings, "ALERT_AUTO_RESOLVE_MINUTES", 0)
    if minutes <= 0:
        return 0
    now = now or timezone.now()
    return Alert.objects.filter(
        resolved=False, reading__isnull=False, created_at__lt=now - timedelta(minutes=minutes),
    ).exclude(reading__source="pvt_test").update(resolved=True, resolved_at=now)


def ingest(items, now=None):
    """
    Save a list of reading dicts and run the alert rules on them (shared by the webhook and
    the simulation "Apply now" endpoint). Returns (saved_readings, new_alerts, errors).
    """
    crew = {a.id: a for a in Astronaut.objects.select_related("user")}
    now = now or timezone.now()
    rows, errors = [], []

    for i, item in enumerate(items):
        try:
            if not isinstance(item, dict):
                raise ValueError("reading must be an object")
            astronaut = None
            if item.get("astronaut_id") is not None:
                astronaut = crew.get(int(item["astronaut_id"]))
                if astronaut is None:
                    raise ValueError(f"unknown astronaut_id {item['astronaut_id']}")
            metric = str(item["metric"]).strip()
            if not metric:
                raise ValueError("metric is empty")
            value = item.get("value")
            numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
            rows.append(SensorReading(
                astronaut=astronaut,
                source=str(item.get("source", "unknown"))[:30],
                metric=metric[:40],
                value=value if numeric else None,
                text_value="" if numeric else str(value)[:50],
                unit=str(item.get("unit", ""))[:20],
                timestamp=parse_timestamp(item.get("timestamp"), now),
            ))
        except (KeyError, ValueError, TypeError) as e:
            errors.append({"index": i, "error": str(e)})

    # One transaction: one fsync and one short write lock per batch, instead of one per row.
    with transaction.atomic():
        saved = SensorReading.objects.bulk_create(rows)
        alerts = evaluate_readings(saved)
        clear_recovered_alerts(saved, alerts, now)
        auto_resolve_stale_sensor_alerts(now)

    return saved, alerts, errors


@csrf_exempt          # devices can't send Django CSRF tokens; we use the HMAC signature instead
@require_POST
def receive_readings(request):
    if not _signature_ok(request):
        return JsonResponse({"error": "invalid signature"}, status=401)
    try:
        payload = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "invalid JSON"}, status=400)

    items = payload.get("readings", [payload]) if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return JsonResponse({"error": "readings must be a list"}, status=400)

    saved, alerts, errors = ingest(items)
    return JsonResponse({
        "saved": len(saved),
        "alerts": [{"level": a.level, "message": a.message, "astronaut": str(a.astronaut or "CABIN")} for a in alerts],
        "errors": errors,
    }, status=201 if saved else 400)

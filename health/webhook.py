"""
Webhook endpoint that receives real-time readings from the device simulator
(or, in the future, from real wearables and cabin sensors).

POST /api/webhook/readings/
Headers:
  Content-Type: application/json
  X-Astra-Signature: sha256=<HMAC-SHA256 of the raw body using WEBHOOK_SECRET>
Body: one reading object, or {"readings": [ ... ]}
  {"timestamp": "2026-11-14T15:30:00", "astronaut_id": 1, "source": "wearable",
   "metric": "heart_rate", "value": 82, "unit": "bpm"}
"""
import hashlib
import hmac
import json

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import Astronaut, SensorReading
from .sensor_rules import evaluate_reading


def _signature_ok(request):
    secret = getattr(settings, "WEBHOOK_SECRET", "")
    if not secret:          # no secret configured -> accept (dev only)
        return True
    expected = "sha256=" + hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, request.headers.get("X-Astra-Signature", ""))


@csrf_exempt          # devices can't send Django CSRF tokens; we use the HMAC signature instead
@require_POST
def receive_readings(request):
    if not _signature_ok(request):
        return JsonResponse({"error": "invalid signature"}, status=401)
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid JSON"}, status=400)

    items = payload.get("readings", [payload]) if isinstance(payload, dict) else payload
    crew = {a.id: a for a in Astronaut.objects.all()}
    saved, alerts, errors = 0, [], []

    for i, item in enumerate(items):
        try:
            astronaut = None
            if item.get("astronaut_id") is not None:
                astronaut = crew.get(int(item["astronaut_id"]))
                if astronaut is None:
                    raise ValueError(f"unknown astronaut_id {item['astronaut_id']}")
            value = item.get("value")
            ts = parse_datetime(item.get("timestamp", "")) or timezone.now()
            if timezone.is_naive(ts):
                ts = timezone.make_aware(ts)
            reading = SensorReading.objects.create(
                astronaut=astronaut,
                source=item.get("source", "unknown"),
                metric=item["metric"],
                value=value if isinstance(value, (int, float)) else None,
                text_value="" if isinstance(value, (int, float)) else str(value),
                unit=item.get("unit", ""),
                timestamp=ts,
            )
            saved += 1
            alert = evaluate_reading(reading)
            if alert:
                alerts.append({"level": alert.level, "message": alert.message,
                               "astronaut": str(alert.astronaut or "CABIN")})
        except (KeyError, ValueError, TypeError) as e:
            errors.append({"index": i, "error": str(e)})

    return JsonResponse({"saved": saved, "alerts": alerts, "errors": errors},
                        status=201 if saved else 400)

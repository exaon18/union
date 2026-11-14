"""
Simulation lab: pick what the device simulator sends (all nominal, one critical, cabin CO2...).

  GET  /api/sim/scenario/   public. Active scenario, resolved per astronaut, plus the preset list.
                            The simulator reads this every tick.
  POST /api/sim/scenario/   flight surgeon. Change it. Body: {"preset", "target", "system",
                            "custom", "cabin", "anomaly_rate", "reset": bool, "apply_now": bool}
  POST /api/sim/reset/      flight surgeon. Resolve every open alert so a scenario starts clean.
  POST /api/sim/tick/       flight surgeon. Generate and save one batch now (same as one simulator tick).

The value bands and presets live in device_simulator/scenarios.py, shared with the simulator.
"""
import sys
from datetime import datetime, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_POST

from .auth import json_body, token_required
from .models import Alert, Astronaut, SimScenario
from .webhook import ingest

sys.path.insert(0, str(Path(settings.BASE_DIR) / "device_simulator"))
import generators  # noqa: E402
import scenarios  # noqa: E402


def crew_ids():
    return sorted(Astronaut.objects.values_list("id", flat=True))


def get_scenario():
    """The singleton row (created with the default "realistic" scenario if missing)."""
    obj, _ = SimScenario.objects.get_or_create(pk=1, defaults={"config": dict(scenarios.DEFAULT_CONFIG)})
    return obj


def _sim_crew():
    """Crew dicts for the generator: simulator baselines, overridden by the database ones."""
    base = {a["id"]: a for a in generators.CREW}
    out = []
    for a in Astronaut.objects.select_related("user").order_by("id"):
        d = dict(base.get(a.id, {"glucose": 90, "pvt_ms": 255}))
        d.update(id=a.id, name=a.user.get_full_name() or a.user.username,
                 hr=a.baseline_heart_rate, sbp=a.baseline_systolic_bp, dbp=a.baseline_diastolic_bp)
        out.append(d)
    return out


def scenario_json(obj):
    ids = crew_ids()
    cfg = {**scenarios.DEFAULT_CONFIG, **(obj.config or {})}
    preset = next((p for p in scenarios.PRESETS if p["key"] == cfg["preset"]), scenarios.PRESETS[0])
    resolved = scenarios.resolve(cfg, ids)
    return {
        "preset": cfg["preset"],
        "label": preset["label"],
        "description": preset["description"],
        "config": cfg,
        "resolved": resolved,
        "expected_status": {str(k): v for k, v in scenarios.expected_status(resolved).items()}
        if resolved["mode"] == "fixed" else None,
        "version": obj.version,
        "updated_at": timezone.localtime(obj.updated_at).isoformat() if obj.updated_at else None,
        "updated_by": obj.updated_by.username if obj.updated_by_id else None,
        "presets": scenarios.PRESETS,
        "levels": scenarios.LEVELS,
        "systems": scenarios.SYSTEMS,
        "cabin_systems": scenarios.CABIN_SYSTEMS,
    }


def reset_alerts(user=None):
    now = timezone.now()
    return Alert.objects.filter(resolved=False).update(resolved=True, resolved_at=now, resolved_by=user)


def push_batch(obj=None):
    """Generate one batch from the active scenario and save it like a webhook call."""
    obj = obj or get_scenario()
    resolved = scenarios.resolve(obj.config, crew_ids())
    batch = scenarios.generate_batch(resolved, _sim_crew(), datetime.now(dt_timezone.utc), daily=True)
    saved, alerts, errors = ingest(batch)
    return {"saved": len(saved), "errors": errors,
            "alerts": [{"level": a.level, "message": a.message,
                        "astronaut": (a.astronaut.user.get_full_name() if a.astronaut_id else "CABIN")} for a in alerts]}


@csrf_exempt
@require_http_methods(["GET", "HEAD", "POST"])
def scenario_view(request):
    if request.method == "POST":
        return scenario_update(request)
    return JsonResponse(scenario_json(get_scenario()))


@token_required(roles=["surgeon"])
def scenario_update(request):
    data, err = json_body(request)
    if err:
        return err
    cfg, errors = scenarios.validate(data, crew_ids())
    if errors:
        return JsonResponse({"error": "; ".join(errors), "errors": errors}, status=400)
    with transaction.atomic():
        obj = get_scenario()
        obj.config = cfg
        obj.version += 1
        obj.updated_by = request.api_user
        obj.save()
    out = {"scenario": scenario_json(obj)}
    if data.get("reset"):
        out["reset"] = reset_alerts(request.api_user)
    if data.get("apply_now"):
        out["batch"] = push_batch(obj)
    return JsonResponse(out)


@csrf_exempt
@require_POST
@token_required(roles=["surgeon"])
def reset_view(request):
    return JsonResponse({"resolved": reset_alerts(request.api_user)})


@csrf_exempt
@require_POST
@token_required(roles=["surgeon"])
def tick_view(request):
    return JsonResponse(push_batch(), status=201)

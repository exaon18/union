"""
Simulation lab: pick what the device simulator sends (all nominal, one critical, cabin CO2...).

  GET  /api/sim/scenario/   public. Active scenario, resolved per astronaut, plus the preset list.
                            The simulator reads this every tick.
  POST /api/sim/scenario/   flight surgeon. Change it. Body: {"preset", "target", "system",
                            "custom", "cabin", "anomaly_rate", "reset": bool, "apply_now": bool}
  POST /api/sim/reset/      flight surgeon. Resolve every open alert so a scenario starts clean.
  POST /api/sim/tick/       flight surgeon. Generate and save one batch now (same as one simulator tick).

  GET  /api/space-weather/  public. Real NASA DONKI events (stored by `manage.py fetch_donki`, or the
                            bundled cached snapshot), the current crew state and the replayable events.

The value bands and presets live in device_simulator/scenarios.py, shared with the simulator.
Preset "space_weather" replays one real DONKI event (body: {"preset": "space_weather", "event_id": ...}).
In the "realistic" preset a real SEP / X-class / recent M-class event from DONKI raises everyone's
radiation automatically (health/donki.py state()).
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

from . import donki
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


def resolved_for(cfg, ids=None):
    """Resolve the scenario; the realistic preset also follows live NASA DONKI space weather."""
    resolved = scenarios.resolve(cfg, crew_ids() if ids is None else ids)
    if resolved["mode"] == "random":
        st = donki.state(donki.stored_events()[0])
        if st["event"]:
            e = st["event"]
            resolved = scenarios.apply_space_weather(resolved, {
                "level": st["level"], "id": e["id"], "type": e["type"], "time": e["time"],
                "label": e["label"], "link": e.get("link", "")})
    return resolved


def scenario_json(obj):
    ids = crew_ids()
    cfg = {**scenarios.DEFAULT_CONFIG, **(obj.config or {})}
    preset = next((p for p in scenarios.PRESETS if p["key"] == cfg["preset"]), scenarios.PRESETS[0])
    resolved = resolved_for(cfg, ids)
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
    resolved = resolved_for(obj.config)
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
    if data.get("preset") == "space_weather":
        eid = data.get("event_id") or (data.get("event") or {}).get("id")
        ev = next((e for e in donki.stored_events()[0] if e.get("id") == eid), None)
        if not ev or ev.get("level") not in ("caution", "critical"):
            return JsonResponse({"error": "pick a real DONKI SEP event or M/X-class flare (event_id)"}, status=400)
        data["event"] = {k: ev.get(k) for k in ("id", "type", "time", "label", "link", "level")}
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


def space_weather_json(limit=12):
    events, source, fetched = donki.stored_events()
    cfg = get_scenario().config or {}
    cfg_event = cfg.get("event")
    st = donki.state(events)
    notable = [e for e in events if donki.is_notable(e)]
    replay = [e for e in events if e["type"] == "SEP" or (e["type"] == "FLR" and e["level"] == "critical")]
    by_id = {e["id"]: e for e in events}
    seen, uniq = set(), []
    for e in replay:          # one SEP per day (DONKI lists one per instrument / energy channel)
        key = (e["type"], e["time"][:10] if e["type"] == "SEP" else e["id"])
        if key in seen:
            continue
        seen.add(key)
        flares = [by_id[i]["class"] for i in e.get("linked", []) if i in by_id and by_id[i].get("class")]
        uniq.append(dict(e, label=e["label"] + (f" after {flares[0]} flare" if e["type"] == "SEP" and flares else "")))
    m_flares = [e for e in events if e["type"] == "FLR" and e["level"] == "caution"][:10]
    return {
        "source": source,                     # live | snapshot
        "fetched_at": fetched,
        "snapshot_fetched_at": donki.load_snapshot().get("fetched_at"),
        "provider": "NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)",
        "provider_url": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
        "state": st,
        "latest": notable[:limit],
        "replay": (uniq[:30] + m_flares),
        "counts": {t: sum(1 for e in events if e["type"] == t) for t in donki.TYPES},
        "mapping": {"SEP": "critical", "X-class flare": "critical", "M-class flare": "caution",
                    "CME >= 1000 km/s": "caution", "GST": "info (near-Earth only)"},
        "note": "DONKI gives event times and classes, not the crew's dose; dose values are simulated.",
        "active_replay": cfg_event if (cfg.get("preset") == "space_weather" and isinstance(cfg_event, dict)) else None,
    }


@require_http_methods(["GET", "HEAD"])
def space_weather_view(request):
    return JsonResponse(space_weather_json())


@require_http_methods(["GET", "HEAD"])
def nasa_reference_view(request):
    from .nasa import reference
    return JsonResponse(reference() or {"error": "health/data/nasa_reference.json missing"},
                        status=200 if reference() else 503)

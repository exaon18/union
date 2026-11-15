"""
NASA DONKI space weather -> crew radiation risk.

DONKI (Space Weather Database Of Notifications, Knowledge, Information) lists real solar flares
(FLR), solar energetic particle events (SEP), coronal mass ejections (CME) and geomagnetic storms
(GST). We use it to decide when the simulated crew radiation should rise and to cite the event.

Mapping (prototype, explained on the Science page):
  SEP event                -> critical: energetic particles reach the crew -> storm shelter
  X-class flare            -> critical: X flares are the usual source of SEP events -> storm shelter
  M-class flare            -> caution: watch for particles, limit time in lightly shielded modules
  CME >= 1000 km/s         -> caution: fast CMEs drive particle events
  GST (Kp)                 -> info only: geomagnetic storms matter near Earth, not in deep space

DONKI gives event times and classes, not a dose for our crew; the dose values themselves are
simulated (scenarios.py radiation bands).
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import timedelta, timezone as dt_timezone
from pathlib import Path

from django.utils import timezone
from django.utils.dateparse import parse_datetime

NASA_API = "https://api.nasa.gov/DONKI/{type}"
CCMC_API = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/{type}"
CCMC_MIRROR = "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/{type}"
TYPES = ("FLR", "SEP", "CME", "GST")
MAX_DAYS = 59                       # DONKI rejects ranges over 60 days
SNAPSHOT_FILE = Path(__file__).resolve().parent / "data" / "donki_snapshot.json"
SHELTER = "Shelter in the storm shelter (the most shielded module) until the particle flux falls."

# How long an event keeps driving the simulated radiation ("live" mode).
WINDOWS = {"SEP": timedelta(hours=48), "X": timedelta(hours=24), "M": timedelta(hours=6), "CME": timedelta(hours=24)}


# --------------------------------------------------------------------------- fetch
def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "astra-health/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw) if raw.strip() else []


def fetch_type(event_type, start, end, api_key=None, log=print):
    """All events of one type between two dates, in <=60-day chunks. Returns (events, host used)."""
    api_key = api_key or os.environ.get("NASA_API_KEY") or "DEMO_KEY"
    out, used, d = [], set(), start
    while d <= end:
        e = min(d + timedelta(days=MAX_DAYS), end)
        q = f"?startDate={d.isoformat()}&endDate={e.isoformat()}"
        urls = [NASA_API.format(type=event_type) + q + f"&api_key={api_key}",
                CCMC_MIRROR.format(type=event_type) + q, CCMC_API.format(type=event_type) + q]
        for url in urls:
            try:
                out += _get(url)
                used.add(url.split("/DONKI")[0])
                break
            except (urllib.error.URLError, ValueError, OSError) as exc:
                log(f"  {event_type} {d}..{e}: {url.split('?')[0]} failed ({getattr(exc, 'code', '') or exc})")
                time.sleep(0.5)
        else:
            raise RuntimeError(f"DONKI {event_type} unavailable for {d}..{e}")
        d = e + timedelta(days=1)
    return out, sorted(used)


# --------------------------------------------------------------------------- normalise / classify
def _cme_speed(raw):
    best = [a for a in raw.get("cmeAnalyses") or [] if a.get("isMostAccurate")] or (raw.get("cmeAnalyses") or [])
    speeds = [a.get("speed") for a in best if a.get("speed")]
    return max(speeds) if speeds else None


def normalize(event_type, raw):
    """One DONKI record -> the small dict we store and show."""
    if event_type == "FLR":
        eid, t = raw.get("flrID"), raw.get("beginTime")
        extra = {"class": raw.get("classType") or "", "peak": raw.get("peakTime"), "location": raw.get("sourceLocation") or "",
                 "region": raw.get("activeRegionNum")}
    elif event_type == "SEP":
        eid, t = raw.get("sepID"), raw.get("eventTime")
        extra = {"instruments": [i.get("displayName") for i in raw.get("instruments") or []][:3]}
    elif event_type == "GST":
        eid, t = raw.get("gstID"), raw.get("startTime")
        kps = [k.get("kpIndex") for k in raw.get("allKpIndex") or [] if k.get("kpIndex") is not None]
        extra = {"kp": max(kps) if kps else None}
    else:
        eid, t = raw.get("activityID"), raw.get("startTime")
        extra = {"speed": _cme_speed(raw), "note": (raw.get("note") or "")[:200]}
    linked = [x.get("activityID") for x in raw.get("linkedEvents") or [] if x.get("activityID")]
    ev = {"id": eid, "type": event_type, "time": t, "link": raw.get("link") or "", "linked": linked[:6], **extra}
    ev.update(classify(ev))
    return ev


def classify(ev):
    t = ev["type"]
    if t == "SEP":
        return {"level": "critical", "label": "Solar energetic particle event",
                "impact": "Energetic protons reach the spacecraft: crew dose rises. " + SHELTER}
    if t == "FLR":
        cls = (ev.get("class") or "?").upper()
        if cls.startswith("X"):
            return {"level": "critical", "label": f"{cls} solar flare",
                    "impact": "X-class flares are the usual source of particle storms. " + SHELTER}
        if cls.startswith("M"):
            return {"level": "caution", "label": f"{cls} solar flare",
                    "impact": "Moderate flare: watch for a particle event; limit time in lightly shielded modules."}
        return {"level": "info", "label": f"{cls} solar flare", "impact": "Minor flare: no action."}
    if t == "CME":
        sp = ev.get("speed")
        if sp and sp >= 1000:
            return {"level": "caution", "label": f"Fast CME ({sp:.0f} km/s)",
                    "impact": "Fast coronal mass ejections can drive particle events: be ready to shelter."}
        return {"level": "info", "label": f"CME{f' ({sp:.0f} km/s)' if sp else ''}", "impact": "No crew action."}
    kp = ev.get("kp")
    return {"level": "info", "label": f"Geomagnetic storm (Kp {kp:g})" if kp else "Geomagnetic storm",
            "impact": "Affects Earth and low orbit (aurora, satellites); little effect on a deep-space crew."}


def is_notable(ev):
    return ev["level"] in ("critical", "caution") or ev["type"] == "GST"


# --------------------------------------------------------------------------- storage
def _dt(s):
    d = parse_datetime(s.replace("Z", "+00:00")) if s else None
    if d and timezone.is_naive(d):
        d = timezone.make_aware(d, dt_timezone.utc)
    return d


def save_events(events, source):
    from .models import SpaceWeatherEvent
    n = 0
    for ev in events:
        if not ev.get("id") or not ev.get("time"):
            continue
        SpaceWeatherEvent.objects.update_or_create(event_id=ev["id"], defaults={
            "event_type": ev["type"], "start_time": _dt(ev["time"]),
            "class_type": str(ev.get("class") or (ev.get("kp") if ev.get("kp") is not None else ""))[:10],
            "speed": ev.get("speed"), "link": ev.get("link", "")[:300], "data": ev, "source": source})
        n += 1
    return n


def load_snapshot():
    try:
        return json.loads(SNAPSHOT_FILE.read_text())
    except (OSError, ValueError):
        return {"events": [], "fetched_at": None}


def stored_events():
    """
    (events newest first, source, fetched_at). Live events from the database (fetch_donki), plus the
    bundled cached snapshot for older history; each event carries "source": "live" | "snapshot".
    """
    from .models import SpaceWeatherEvent
    rows = list(SpaceWeatherEvent.objects.order_by("-start_time")[:3000])
    events = [dict(e.data, source=e.source) for e in rows]
    have = {e["id"] for e in events}
    snap = load_snapshot()
    events += [dict(e, source="snapshot") for e in snap.get("events", []) if e.get("id") not in have]
    events.sort(key=lambda e: e.get("time") or "", reverse=True)
    live = [e for e in rows if e.source == "live"]
    if live:
        return events, "live", max(e.fetched_at for e in live).isoformat()
    return events, "snapshot", snap.get("fetched_at")


# --------------------------------------------------------------------------- state
def state(events, now=None):
    """
    What real space weather means for the crew right now:
    {"level": "critical"|"caution"|"quiet", "event": {...} or None, "reason": str}
    """
    now = now or timezone.now()
    best = None
    for ev in events:
        t = _dt(ev.get("time"))
        if not t or t > now + timedelta(minutes=5):
            continue
        age = now - t
        key = "SEP" if ev["type"] == "SEP" else ("CME" if ev["type"] == "CME" else (ev.get("class") or "?")[:1].upper())
        win = WINDOWS.get(key)
        if win is None or age > win or ev["level"] not in ("critical", "caution"):
            continue
        rank = 2 if ev["level"] == "critical" else 1
        if best is None or rank > best[0] or (rank == best[0] and t > best[1]):
            best = (rank, t, ev)
    if best:
        ev = best[2]
        return {"level": ev["level"], "event": ev,
                "reason": f"NASA DONKI {ev['type']} {ev['id']}: {ev['label']}. {ev['impact']}"}
    return {"level": "quiet", "event": None, "reason": "No solar particle event, X-class or recent M-class flare in DONKI right now."}


def driver_for_alerts(now=None):
    """The real DONKI event behind the current radiation (replay scenario first, then live), or None."""
    from .sim import get_scenario
    cfg = get_scenario().config or {}
    if cfg.get("preset") == "space_weather" and isinstance(cfg.get("event"), dict):
        return cfg["event"]
    if cfg.get("preset", "realistic") == "realistic":
        st = state(stored_events()[0], now)
        if st["event"]:
            e = st["event"]
            return {"id": e["id"], "type": e["type"], "time": e["time"], "label": e["label"], "level": e["level"]}
    return None


def annotate_radiation_alerts(alerts, now=None):
    """Append the DONKI citation + shelter advice to new radiation alerts (in place)."""
    rad = [a for a in alerts if a.system == "radiation"]
    if not rad:
        return
    ev = driver_for_alerts(now)
    if not ev:
        return
    when = (ev.get("time") or "").replace("T", " ").replace("Z", " UTC")
    cause = f" Cause: NASA DONKI {ev.get('label') or ev.get('type')}, {ev.get('id')} ({when})."
    for a in rad:
        shelter = "" if "storm shelter" in a.recommendation else " Shelter in the storm shelter."
        a.recommendation = (a.recommendation + shelter + cause)[:255]

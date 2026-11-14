"""
ASTRA HEALTH - Device Simulator (separate system)
-------------------------------------------------
Acts like the crew's wearables, patches, CGMs and the cabin sensors.
Every few seconds it generates new readings and POSTs them to the
ASTRA HEALTH webhook, signed with a shared secret (HMAC-SHA256).

What it sends follows the ACTIVE SCENARIO on the server (all nominal, one critical,
cabin CO2 problem, radiation storm...). Before every batch it reads
GET /api/sim/scenario/, so a change on the Scenario Control page (or
POST /api/sim/scenario/) takes effect on the next tick. See device_simulator/scenarios.py.

Run (in a second terminal, while Django is running):
  python device_simulator/simulator.py
  python device_simulator/simulator.py --interval 2 --url http://127.0.0.1:8000/api/webhook/readings/
  python device_simulator/simulator.py --daily              # also send daily data (sleep, PVT, urine calcium...) each cycle
  python device_simulator/simulator.py --scenario nominal   # ignore the server, always use this preset
  python device_simulator/simulator.py --legacy --emergency 2   # the old generator (random tails, forced emergency)

Only the Python standard library is used.
"""
import argparse
import hashlib
import hmac
import json
import os
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import generators
import scenarios
from generators import CREW, cabin, daily_summary, reading, wearable_and_patch

DEFAULT_URL = "http://127.0.0.1:8000/api/webhook/readings/"
SECRET = os.environ.get("ASTRA_WEBHOOK_SECRET", "astra-dev-secret")  # must match Django settings


def emergency(a, ts):
    """Clearly abnormal readings so the demo shows a red alert on cue (--legacy only)."""
    return [
        reading(ts, "heart_rate", random.randint(125, 140), "bpm", "wearable", a),
        reading(ts, "spo2", random.randint(87, 90), "%", "patch", a),
        reading(ts, "ecg_rhythm", "irregular", "", "patch", a),
    ]


def legacy_batch(args, ts):
    batch = cabin(ts)
    for a in CREW:
        normal = wearable_and_patch(a, ts)
        if args.emergency == a["id"]:
            bad = emergency(a, ts)
            replaced = {item["metric"] for item in bad}
            normal = [item for item in normal if item["metric"] not in replaced] + bad
        batch += normal
        if args.daily:
            batch += daily_summary(a, ts, 0)
    return batch


def send(url, readings):
    body = json.dumps({"readings": readings}).encode()
    signature = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "X-Astra-Signature": signature})
    for attempt in range(3):                      # retry a few times if the server is down
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return {"error": f"HTTP {e.code}: {e.read().decode()[:200]}"}
        except urllib.error.URLError as e:
            print(f"  ! server not reachable ({e.reason}), retrying...")
            time.sleep(2)
    return {"error": "gave up after 3 attempts"}


def fetch_scenario(url):
    """GET /api/sim/scenario/ -> the JSON, or None if the server can't be reached."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=3) as resp:
            data = json.loads(resp.read())
        return data if isinstance(data.get("resolved"), dict) else None
    except (urllib.error.URLError, ValueError, OSError):
        return None


def scenario_url_for(webhook_url):
    if "/webhook/readings/" in webhook_url:
        return webhook_url.replace("/webhook/readings/", "/sim/scenario/")
    return webhook_url.rstrip("/").rsplit("/api/", 1)[0] + "/api/sim/scenario/"


def main():
    p = argparse.ArgumentParser(description="ASTRA HEALTH device simulator")
    p.add_argument("--url", default=DEFAULT_URL)
    p.add_argument("--scenario-url", help="where to read the active scenario (default: derived from --url)")
    p.add_argument("--scenario", choices=scenarios.PRESET_KEYS,
                   help="use this preset and ignore the server (focus astronaut 2, cardiovascular)")
    p.add_argument("--interval", type=float, default=3, help="seconds between batches")
    p.add_argument("--daily", action="store_true", help="include daily metrics in every batch")
    p.add_argument("--once", action="store_true", help="send one batch and exit")
    p.add_argument("--legacy", action="store_true", help="old random generator (ignores scenarios)")
    p.add_argument("--emergency", type=int, metavar="ASTRONAUT_ID", help="--legacy only: force an emergency")
    p.add_argument("--anomaly-rate", type=float, default=0.0005, help="--legacy only: chance a reading is abnormal")
    args = p.parse_args()
    generators.ANOMALY_CHANCE = args.anomaly_rate
    scenario_url = args.scenario_url or scenario_url_for(args.url)
    crew_ids = [a["id"] for a in CREW]

    if args.legacy:
        print(f"Device simulator (legacy generator) -> {args.url}  (every {args.interval}s, Ctrl+C to stop)")
    else:
        if args.emergency or args.anomaly_rate != 0.0005:
            print("  note: --emergency / --anomaly-rate only apply with --legacy; use the Scenario Control page instead")
        src = f"preset '{args.scenario}' (local)" if args.scenario else scenario_url
        print(f"Device simulator -> {args.url}\n  scenario from {src}  (every {args.interval}s, Ctrl+C to stop)")

    # Fallback until the server answers: mostly-nominal "realistic" behaviour.
    local = scenarios.resolve({"preset": args.scenario or "realistic"}, crew_ids)
    resolved, label, version, warned = local, args.scenario or "realistic", None, False
    sw_id = None
    while True:
        # Timezone-aware UTC, e.g. 2026-11-14T19:30:00+00:00, so the server never has to guess.
        ts = datetime.now(timezone.utc)
        stamp = ts.astimezone().strftime("%H:%M:%S")   # local time for the console
        if args.legacy:
            batch = legacy_batch(args, ts)
        else:
            if not args.scenario:
                data = fetch_scenario(scenario_url)
                if data is None:
                    if not warned:
                        print(f"[{stamp}] ! cannot read {scenario_url}; keeping scenario '{label}'")
                        warned = True
                else:
                    warned = False
                    resolved, label = data["resolved"], data.get("label", data.get("preset"))
                    if data.get("version") != version:
                        version = data.get("version")
                        print(f"[{stamp}] scenario v{version}: {label}")
                    sw = (resolved.get("space_weather") or {})
                    if sw.get("id") != sw_id:
                        sw_id = sw.get("id")
                        if sw_id:
                            print(f"[{stamp}] space weather: NASA DONKI {sw.get('type')} {sw_id} ({sw.get('label')}) "
                                  f"-> crew radiation {sw.get('level')}")
            batch = scenarios.generate_batch(resolved, CREW, ts, daily=args.daily)

        result = send(args.url, batch)
        if "error" in result:
            print(f"[{stamp}] sent {len(batch)} readings -> ERROR {result['error']}")
        else:
            print(f"[{stamp}] sent {len(batch)} readings -> saved {result['saved']}, alerts {len(result['alerts'])}")
            for al in result["alerts"]:
                icon = "🔴" if al["level"] == "red" else "🟡"
                print(f"     {icon} {al['astronaut']}: {al['message']}")
        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()

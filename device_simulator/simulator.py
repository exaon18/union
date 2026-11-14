"""
ASTRA HEALTH - Device Simulator (separate system)
-------------------------------------------------
Acts like the crew's wearables, patches, CGMs and the cabin sensors.
Every few seconds it generates new readings and POSTs them to the
ASTRA HEALTH webhook, signed with a shared secret (HMAC-SHA256).

Run (in a second terminal, while Django is running):
  python device_simulator/simulator.py
  python device_simulator/simulator.py --interval 2 --url http://127.0.0.1:8000/api/webhook/readings/
  python device_simulator/simulator.py --daily        # also send daily data (sleep, PVT, urine calcium...) each cycle
  python device_simulator/simulator.py --emergency 2  # force a medical emergency for astronaut 2 (for the demo)

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
from datetime import datetime

from generators import CREW, cabin, daily_summary, reading, wearable_and_patch

DEFAULT_URL = "http://127.0.0.1:8000/api/webhook/readings/"
SECRET = os.environ.get("ASTRA_WEBHOOK_SECRET", "astra-dev-secret")  # must match Django settings


def emergency(a, ts):
    """Clearly abnormal readings so the demo shows a red alert on cue."""
    return [
        reading(ts, "heart_rate", random.randint(125, 140), "bpm", "wearable", a),
        reading(ts, "spo2", random.randint(87, 90), "%", "patch", a),
        reading(ts, "ecg_rhythm", "irregular", "", "patch", a),
    ]


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


def main():
    p = argparse.ArgumentParser(description="ASTRA HEALTH device simulator")
    p.add_argument("--url", default=DEFAULT_URL)
    p.add_argument("--interval", type=float, default=3, help="seconds between batches")
    p.add_argument("--daily", action="store_true", help="include daily metrics in every batch")
    p.add_argument("--emergency", type=int, metavar="ASTRONAUT_ID", help="force an emergency for one astronaut")
    p.add_argument("--once", action="store_true", help="send one batch and exit")
    args = p.parse_args()

    print(f"Device simulator -> {args.url}  (every {args.interval}s, Ctrl+C to stop)")
    while True:
        ts = datetime.now()
        batch = cabin(ts)
        for a in CREW:
            batch += wearable_and_patch(a, ts)
            if args.daily:
                batch += daily_summary(a, ts, 0)
            if args.emergency == a["id"]:
                batch += emergency(a, ts)

        result = send(args.url, batch)
        stamp = ts.strftime("%H:%M:%S")
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

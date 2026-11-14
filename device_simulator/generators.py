"""
ASTRA HEALTH - dummy data generator
-----------------------------------
Pretends to be the wearables, patches, cabin sensors, lab tests and the PVT game.

Usage:
  python generate_dummy_data.py                    # 30 days of history -> dummy_data.json + dummy_data.csv
  python generate_dummy_data.py --days 7           # 7 days instead
  python generate_dummy_data.py --live             # print a new batch of readings every 3 seconds
  python generate_dummy_data.py --live --post http://127.0.0.1:8000/api/readings/
                                                   # send each reading to your Django API

Only uses the Python standard library (no pip install needed).
"""
import argparse
import csv
import json
import random
import time
import urllib.request
from datetime import datetime, timedelta

# ---- The crew. Each astronaut has personal baselines (their "normal"). ----
CREW = [
    {"id": 1, "name": "Abebe Kebede", "role": "Commander",        "hr": 62, "sbp": 118, "dbp": 76, "glucose": 90,  "pvt_ms": 260},
    {"id": 2, "name": "Sara Tesfaye", "role": "Flight Engineer",  "hr": 68, "sbp": 112, "dbp": 72, "glucose": 88,  "pvt_ms": 245},
    {"id": 3, "name": "Dawit Haile",  "role": "Medical Officer",  "hr": 72, "sbp": 124, "dbp": 80, "glucose": 95,  "pvt_ms": 270},
    {"id": 4, "name": "Hana Girma",   "role": "Mission Specialist","hr": 65, "sbp": 115, "dbp": 74, "glucose": 92,  "pvt_ms": 255},
]

ANOMALY_CHANCE = 0.08  # 8% of readings are deliberately "bad" so alerts fire in the demo


def r(value, spread, decimals=0):
    """Random value around `value` (normal distribution)."""
    v = random.gauss(value, spread)
    return round(v, decimals) if decimals else int(round(v))


def bad():
    return random.random() < ANOMALY_CHANCE


def reading(ts, metric, value, unit, source, astronaut=None):
    return {
        "timestamp": ts.isoformat(timespec="seconds"),
        "astronaut_id": astronaut["id"] if astronaut else None,   # None = cabin data
        "astronaut": astronaut["name"] if astronaut else "CABIN",
        "source": source,
        "metric": metric,
        "value": value,
        "unit": unit,
    }


def wearable_and_patch(a, ts, day=0):
    """Smartwatch / chest patch / CGM readings for one astronaut at one moment."""
    out = []
    hr = r(a["hr"] + 15, 8) if not bad() else r(118, 6)          # real-time HR
    out += [
        reading(ts, "heart_rate", hr, "bpm", "wearable", a),
        reading(ts, "resting_heart_rate", r(a["hr"], 3), "bpm", "wearable", a),
        reading(ts, "hrv", r(55, 10) if not bad() else r(22, 4), "ms", "wearable", a),
        reading(ts, "ecg_rhythm", "normal_sinus" if not bad() else "irregular", "", "patch", a),
        reading(ts, "spo2", r(98, 0.8) if not bad() else r(91, 1), "%", "patch", a),
        reading(ts, "skin_temperature", r(33.5, 0.4, 1) if not bad() else r(36.2, 0.3, 1), "°C", "wearable", a),
        reading(ts, "body_temperature", r(36.8, 0.2, 1) if not bad() else r(38.4, 0.2, 1), "°C", "patch", a),
        reading(ts, "respiration_rate", r(15, 2) if not bad() else r(24, 2), "breaths/min", "patch", a),
        reading(ts, "systolic_bp", r(a["sbp"], 6) if not bad() else r(148, 5), "mmHg", "bp_cuff", a),
        reading(ts, "diastolic_bp", r(a["dbp"], 4) if not bad() else r(96, 4), "mmHg", "bp_cuff", a),
        reading(ts, "blood_glucose", r(a["glucose"], 8) if not bad() else r(165, 15), "mg/dL", "cgm", a),
        reading(ts, "stress_level", r(35, 12) if not bad() else r(85, 5), "0-100", "wearable", a),
        reading(ts, "radiation_dose", r(0.5, 0.1, 2) if not bad() else r(1.4, 0.2, 2), "mSv/day", "dosimeter", a),
    ]
    return out


def daily_summary(a, ts, day):
    """Once-a-day values: activity, sleep, recovery, lab tests, PVT."""
    sleep = r(7, 0.7, 1) if not bad() else r(4.3, 0.4, 1)
    deep = round(sleep * random.uniform(0.15, 0.22), 1)
    rem = round(sleep * random.uniform(0.20, 0.25), 1)
    pvt = r(a["pvt_ms"], 15) if not bad() else r(a["pvt_ms"] * 1.35, 20)
    return [
        reading(ts, "distance", r(4.5, 1.0, 1), "km", "wearable", a),           # treadmill
        reading(ts, "calories_burned", r(2600, 200), "kcal", "wearable", a),
        reading(ts, "exercise_minutes", r(120, 20) if not bad() else r(35, 10), "min", "wearable", a),
        reading(ts, "sleep_total", sleep, "h", "wearable", a),
        reading(ts, "sleep_deep", deep, "h", "wearable", a),
        reading(ts, "sleep_rem", rem, "h", "wearable", a),
        reading(ts, "sleep_light", round(sleep - deep - rem, 1), "h", "wearable", a),
        reading(ts, "recovery_score", r(78, 8) if sleep > 5 else r(40, 8), "0-100", "wearable", a),
        reading(ts, "body_mass", r(72 - day * 0.03, 0.3, 1), "kg", "mass_device", a),   # slow loss over the mission
        reading(ts, "grip_strength", r(42 - day * 0.05, 2, 1), "kg", "dynamometer", a),
        reading(ts, "urine_calcium", r(200 + day * 2, 25) if not bad() else r(320, 15), "mg/day", "lab", a),
        reading(ts, "pvt_reaction_time", pvt, "ms", "pvt_test", a),
        reading(ts, "pvt_lapses", random.randint(0, 2) if pvt < a["pvt_ms"] * 1.2 else random.randint(4, 8), "count", "pvt_test", a),
    ]


def cabin(ts):
    """Spacecraft / station environment sensors."""
    return [
        reading(ts, "co2", r(2500, 300) if not bad() else r(5800, 300), "ppm", "cabin"),
        reading(ts, "o2", r(21, 0.3, 1) if not bad() else r(18.6, 0.2, 1), "%", "cabin"),
        reading(ts, "cabin_temperature", r(22.5, 0.8, 1), "°C", "cabin"),
        reading(ts, "humidity", r(45, 5), "%", "cabin"),
        reading(ts, "cabin_pressure", r(101.3, 0.4, 1), "kPa", "cabin"),
        reading(ts, "cabin_radiation", r(0.45, 0.08, 2) if not bad() else r(1.6, 0.2, 2), "mSv/day", "cabin"),
        reading(ts, "noise", r(58, 4) if not bad() else r(75, 3), "dB", "cabin"),
        reading(ts, "voc", r(0.3, 0.1, 2), "mg/m³", "cabin"),
    ]


def history(days):
    """Generate `days` of data: 4 readings per day per astronaut + 1 daily summary + cabin."""
    data = []
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days)
    for day in range(days):
        for hour in (8, 12, 16, 20):
            ts = start + timedelta(days=day, hours=hour)
            for a in CREW:
                data += wearable_and_patch(a, ts, day)
            data += cabin(ts)
        for a in CREW:
            data += daily_summary(a, start + timedelta(days=day, hours=7), day)
    return data


def post(url, item):
    req = urllib.request.Request(url, data=json.dumps(item).encode(), headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f"  ! could not POST: {e}")


def live(interval, url=None):
    print("Live mode - Ctrl+C to stop")
    while True:
        ts = datetime.now()
        batch = cabin(ts)
        for a in CREW:
            batch += wearable_and_patch(a, ts)
        for item in batch:
            print(f"{item['astronaut']:<14} {item['metric']:<20} {item['value']} {item['unit']}", flush=True)
            if url:
                post(url, item)
        print("-" * 50)
        time.sleep(interval)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="ASTRA HEALTH dummy data generator")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--live", action="store_true")
    p.add_argument("--interval", type=float, default=3)
    p.add_argument("--post", help="API URL to send each reading to")
    p.add_argument("--seed", type=int, help="random seed for repeatable data")
    args = p.parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    if args.live:
        live(args.interval, args.post)
    else:
        rows = history(args.days)
        with open("dummy_data.json", "w", encoding="utf-8") as f:
            json.dump({"crew": CREW, "readings": rows}, f, indent=2, ensure_ascii=False)
        with open("dummy_data.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader()
            w.writerows(rows)
        print(f"Wrote {len(rows)} readings for {len(CREW)} astronauts over {args.days} days")
        print("-> dummy_data.json, dummy_data.csv")

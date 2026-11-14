"""
ASTRA HEALTH - simulation scenarios
-----------------------------------
Decides what the device simulator sends, so a demo can show exactly the situation
you want: everyone healthy, one astronaut in trouble, a cabin CO2 problem, a solar storm...

The active scenario lives on the server (GET /api/sim/scenario/). The simulator fetches it
every tick and builds its batch with `generate_batch()` below; the server uses the same code
for "Apply now". Values are drawn inside fixed bands, so:

  * "normal"   -> always inside the green range of health/sensor_rules.py (no alert ever)
  * "caution"  -> inside the yellow band of the chosen system (yellow alerts only)
  * "critical" -> inside the red band of the chosen system (red alerts)

Lab markers (serum CMP/cytokines, urine inflammation proteins) are drawn inside bands derived from
REAL NASA OSDR data (health/data/nasa_reference.json, built by scripts/build_nasa_reference.py):
pre-flight Inspiration4 values (OSD-575, OSD-656) for "normal", and the real return-day shift for
an immune problem. Radiation follows real NASA DONKI space weather when the server reports it
(see "space_weather" in the resolved scenario).

Only the Python standard library is used (the simulator runs without Django).
"""
import json
import random
from pathlib import Path

REFERENCE_PATH = Path(__file__).resolve().parent.parent / "health" / "data" / "nasa_reference.json"


def load_reference(path=REFERENCE_PATH):
    """The OSDR-derived bands ({} if the file is missing, then no lab markers are sent)."""
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}


REFERENCE = load_reference()
LAB = {m["metric"]: m for m in REFERENCE.get("monitoring", [])}

LEVELS = ["normal", "caution", "critical"]

# Systems an astronaut can have a problem in -> the metrics that go out of range.
SYSTEMS = {
    "cardiovascular": "Cardiovascular: heart rate, ECG rhythm, blood pressure",
    "respiratory": "Respiratory: SpO2 and breathing rate",
    "radiation": "Radiation: personal dosimeter",
    "behavioral": "Behavioral: stress, sleep and reaction-test lapses",
    "immune": "Immune: fever, glucose and inflammation markers shifted by the real Inspiration4 change (OSD-575/656)",
}
# Shared cabin (environment) sensors. Cabin alerts have no astronaut.
CABIN_SYSTEMS = {
    "co2": "Cabin CO2",
    "o2": "Cabin oxygen",
    "radiation": "Cabin radiation (solar event)",
    "noise": "Cabin noise",
}
SYSTEM_CYCLE = ["cardiovascular", "respiratory", "behavioral", "immune", "radiation"]

PRESETS = [
    {"key": "nominal", "label": "All nominal",
     "description": "Every astronaut and the cabin stay inside the green range. No new alerts."},
    {"key": "one_caution", "label": "One caution",
     "description": "The focus astronaut is yellow in the chosen system; everyone else is green."},
    {"key": "one_critical", "label": "One critical",
     "description": "The focus astronaut is red in the chosen system; everyone else is green."},
    {"key": "mixed", "label": "One critical + one caution",
     "description": "The focus astronaut is red, the next crew member is yellow (behavioral), the rest green."},
    {"key": "several_caution", "label": "Several caution",
     "description": "Everyone except the focus astronaut is yellow, each in a different system."},
    {"key": "all_critical", "label": "All critical",
     "description": "Every astronaut is red, each in a different system. Worst case for the console."},
    {"key": "cabin_co2", "label": "Cabin CO2 problem",
     "description": "CO2 scrubber failure: the cabin raises a red CO2 alert; crew vitals stay green."},
    {"key": "radiation_storm", "label": "Radiation storm",
     "description": "Solar particle event: cabin radiation and every astronaut's dose are red."},
    {"key": "space_weather", "label": "Replay real space weather",
     "description": "Replays a real NASA DONKI event (solar energetic particles or a solar flare): SEP or X-class "
                    "flare = radiation storm for everyone, M-class = caution. Alerts cite the event."},
    {"key": "realistic", "label": "Random / realistic",
     "description": "Mostly green with rare short anomalies (about one yellow blip every few minutes, "
                    "a red one much less often). Blips clear by themselves."},
    {"key": "custom", "label": "Custom",
     "description": "Pick a level and system for each astronaut and the cabin yourself."},
]
PRESET_KEYS = [p["key"] for p in PRESETS]
DEFAULT_CONFIG = {"preset": "realistic", "target": 2, "system": "cardiovascular",
                  "custom": {}, "cabin": {"level": "normal", "system": "co2"}, "anomaly_rate": 0.002,
                  "event": None}
MAX_ANOMALY_RATE = 0.2


# --------------------------------------------------------------------------- config
def _level(v, default="normal"):
    return v if v in LEVELS else default


def validate(data, crew_ids):
    """Clean a config dict from the API. Returns (config, errors)."""
    errors = []
    if not isinstance(data, dict):
        return None, ["body must be a JSON object"]
    cfg = dict(DEFAULT_CONFIG)
    cfg["custom"], cfg["cabin"] = {}, dict(DEFAULT_CONFIG["cabin"])
    preset = data.get("preset", "realistic")
    if preset not in PRESET_KEYS:
        errors.append(f"preset must be one of {', '.join(PRESET_KEYS)}")
    cfg["preset"] = preset
    if data.get("target") not in (None, ""):
        try:
            target = int(data["target"])
        except (TypeError, ValueError):
            target = None
        if target not in crew_ids:
            errors.append(f"target must be an astronaut id ({', '.join(map(str, crew_ids))})")
        else:
            cfg["target"] = target
    if data.get("system") not in (None, ""):
        if data["system"] not in SYSTEMS:
            errors.append(f"system must be one of {', '.join(SYSTEMS)}")
        else:
            cfg["system"] = data["system"]
    custom = data.get("custom") or {}
    if not isinstance(custom, dict):
        errors.append("custom must be an object {astronaut_id: {level, system}}")
        custom = {}
    for key, val in custom.items():
        try:
            aid = int(key)
        except (TypeError, ValueError):
            aid = None
        if aid not in crew_ids:
            errors.append(f"custom: unknown astronaut {key}")
            continue
        val = val if isinstance(val, dict) else {"level": val}
        level, system = val.get("level", "normal"), val.get("system", "cardiovascular")
        if level not in LEVELS:
            errors.append(f"custom[{key}].level must be one of {', '.join(LEVELS)}")
        if system not in SYSTEMS:
            errors.append(f"custom[{key}].system must be one of {', '.join(SYSTEMS)}")
        cfg["custom"][str(aid)] = {"level": _level(level), "system": system if system in SYSTEMS else "cardiovascular"}
    cabin = data.get("cabin") or {}
    if not isinstance(cabin, dict):
        errors.append("cabin must be an object {level, system}")
        cabin = {}
    if cabin.get("level", "normal") not in LEVELS:
        errors.append(f"cabin.level must be one of {', '.join(LEVELS)}")
    if cabin.get("system", "co2") not in CABIN_SYSTEMS:
        errors.append(f"cabin.system must be one of {', '.join(CABIN_SYSTEMS)}")
    cfg["cabin"] = {"level": _level(cabin.get("level")), "system": cabin.get("system") if cabin.get("system") in CABIN_SYSTEMS else "co2"}
    if preset == "space_weather":
        ev = data.get("event")
        if not isinstance(ev, dict) or not ev.get("id") or ev.get("level") not in ("caution", "critical"):
            errors.append("space_weather needs event {id, type, time, level: caution|critical} (pick a real DONKI event)")
        else:
            cfg["event"] = {k: str(ev.get(k) or "")[:120] for k in ("id", "type", "time", "label", "link")}
            cfg["event"]["level"] = ev["level"]
    if data.get("anomaly_rate") not in (None, ""):
        try:
            rate = float(data["anomaly_rate"])
            if not 0 <= rate <= MAX_ANOMALY_RATE:
                raise ValueError
            cfg["anomaly_rate"] = rate
        except (TypeError, ValueError):
            errors.append(f"anomaly_rate must be a number between 0 and {MAX_ANOMALY_RATE}")
    return cfg, errors


def resolve(cfg, crew_ids):
    """
    Turn a stored config into explicit instructions:
      {"mode": "fixed" | "random", "anomaly_rate": x,
       "astronauts": {"1": {"level", "system"}, ...}, "cabin": {"level", "system"}}
    """
    cfg = {**DEFAULT_CONFIG, **(cfg or {})}
    ids = sorted(crew_ids)
    target = cfg.get("target") if cfg.get("target") in ids else (2 if 2 in ids else (ids[0] if ids else None))
    system = cfg.get("system") if cfg.get("system") in SYSTEMS else "cardiovascular"
    normal = {"level": "normal", "system": "cardiovascular"}
    astro = {str(i): dict(normal) for i in ids}
    cabin = {"level": "normal", "system": "co2"}
    preset = cfg.get("preset")
    others = [i for i in ids if i != target]
    if preset == "one_caution" and target is not None:
        astro[str(target)] = {"level": "caution", "system": system}
    elif preset == "one_critical" and target is not None:
        astro[str(target)] = {"level": "critical", "system": system}
    elif preset == "mixed" and target is not None:
        astro[str(target)] = {"level": "critical", "system": system}
        if others:
            nxt = next((i for i in ids if i > target), others[0])
            astro[str(nxt)] = {"level": "caution", "system": "behavioral" if system != "behavioral" else "cardiovascular"}
    elif preset == "several_caution":
        for n, i in enumerate(others):
            astro[str(i)] = {"level": "caution", "system": SYSTEM_CYCLE[n % len(SYSTEM_CYCLE)]}
    elif preset == "all_critical":
        for n, i in enumerate(ids):
            astro[str(i)] = {"level": "critical", "system": SYSTEM_CYCLE[n % len(SYSTEM_CYCLE)]}
    elif preset == "cabin_co2":
        cabin = {"level": "critical", "system": "co2"}
    elif preset == "radiation_storm":
        for i in ids:
            astro[str(i)] = {"level": "critical", "system": "radiation"}
        cabin = {"level": "critical", "system": "radiation"}
    elif preset == "space_weather" and isinstance(cfg.get("event"), dict):
        lvl = cfg["event"].get("level", "critical")
        for i in ids:
            astro[str(i)] = {"level": lvl, "system": "radiation"}
        cabin = {"level": lvl, "system": "radiation"}
    elif preset == "custom":
        for key, val in (cfg.get("custom") or {}).items():
            if key in astro:
                astro[key] = {"level": _level(val.get("level")), "system": val.get("system") if val.get("system") in SYSTEMS else "cardiovascular"}
        c = cfg.get("cabin") or {}
        cabin = {"level": _level(c.get("level")), "system": c.get("system") if c.get("system") in CABIN_SYSTEMS else "co2"}
    out = {
        "mode": "random" if preset == "realistic" else "fixed",
        "anomaly_rate": float(cfg.get("anomaly_rate") or 0),
        "astronauts": astro,
        "cabin": cabin,
        "space_weather": None,
    }
    if preset == "space_weather" and isinstance(cfg.get("event"), dict):
        out["space_weather"] = dict(cfg["event"], replay=True)
    return out


def apply_space_weather(resolved, sw):
    """
    Live space weather (from NASA DONKI, see health/donki.py) on top of a *realistic* scenario:
    sw = {"level": "caution"|"critical", "id", "type", "time", ...} raises everyone's radiation.
    Fixed presets are left alone so "All nominal" really stays nominal.
    """
    if not sw or sw.get("level") not in ("caution", "critical") or resolved.get("mode") != "random":
        return resolved
    resolved = dict(resolved, space_weather=dict(sw, replay=False))
    resolved["astronauts"] = {k: (v if v["level"] != "normal" else {"level": sw["level"], "system": "radiation"})
                              for k, v in resolved["astronauts"].items()}
    resolved["cabin"] = {"level": sw["level"], "system": "radiation"}
    resolved["mode"] = "random"
    return resolved


def expected_status(resolved):
    """{astronaut_id: green|yellow|red} the console should show for a fixed scenario."""
    colour = {"normal": "green", "caution": "yellow", "critical": "red"}
    return {int(k): colour[v["level"]] for k, v in resolved["astronauts"].items()}


# --------------------------------------------------------------------------- values
def _g(rng, mean, sd, lo, hi, decimals=0):
    """Gaussian value clamped into [lo, hi] (so 'normal' can never cross a threshold)."""
    v = min(hi, max(lo, rng.gauss(mean, sd)))
    return round(v, decimals) if decimals else int(round(v))


def _u(rng, lo, hi, decimals=0):
    v = rng.uniform(lo, hi)
    return round(v, decimals) if decimals else int(round(v))


def nominal_live(a, rng):
    hr = a.get("hr", 70)
    return {
        "heart_rate": _g(rng, hr + 10, 5, hr - 5, 92),
        "resting_heart_rate": _g(rng, hr, 2, hr - 5, hr + 5),
        "hrv": _g(rng, 55, 7, 38, 75),
        "ecg_rhythm": "normal_sinus",
        "spo2": _g(rng, 98, 0.6, 96, 100),
        "skin_temperature": _g(rng, 33.5, 0.3, 32.6, 34.4, 1),
        "body_temperature": _g(rng, 36.8, 0.15, 36.4, 37.2, 1),
        "respiration_rate": _g(rng, 15, 1.5, 12, 19),
        "systolic_bp": _g(rng, a.get("sbp", 118), 5, a.get("sbp", 118) - 10, 132),
        "diastolic_bp": _g(rng, a.get("dbp", 76), 3, a.get("dbp", 76) - 8, 86),
        "blood_glucose": _g(rng, a.get("glucose", 90), 6, 75, 125),
        "stress_level": _g(rng, 33, 9, 10, 60),
        "radiation_dose": _g(rng, 0.5, 0.06, 0.3, 0.7, 2),
    }


def nominal_daily(a, rng):
    sleep = _g(rng, 7.1, 0.5, 6.0, 8.5, 1)
    deep, rem = round(sleep * rng.uniform(0.15, 0.22), 1), round(sleep * rng.uniform(0.20, 0.25), 1)
    pvt = a.get("pvt_ms", 255)
    return {
        "distance": _g(rng, 4.5, 0.8, 2.5, 6.5, 1),
        "calories_burned": _g(rng, 2600, 150, 2200, 3000),
        "exercise_minutes": _g(rng, 115, 12, 80, 150),
        "sleep_total": sleep, "sleep_deep": deep, "sleep_rem": rem,
        "sleep_light": round(sleep - deep - rem, 1),
        "recovery_score": _g(rng, 78, 6, 62, 95),
        "body_mass": _g(rng, 72, 0.3, 71, 73, 1),
        "grip_strength": _g(rng, 42, 1.5, 38, 46, 1),
        "urine_calcium": _g(rng, 190, 15, 150, 235),
        "pvt_reaction_time": _g(rng, pvt, 12, pvt - 30, int(pvt * 1.15)),
        "pvt_lapses": rng.randint(0, 1),
    }


def nominal_cabin(rng):
    return {
        "co2": _g(rng, 2500, 250, 1800, 3500),
        "o2": _g(rng, 21, 0.2, 20.5, 21.4, 1),
        "cabin_temperature": _g(rng, 22.5, 0.6, 21, 24, 1),
        "humidity": _g(rng, 45, 4, 35, 55),
        "cabin_pressure": _g(rng, 101.3, 0.3, 100.5, 102, 1),
        "cabin_radiation": _g(rng, 0.45, 0.05, 0.3, 0.7, 2),
        "noise": _g(rng, 58, 3, 50, 66),
        "voc": _g(rng, 0.3, 0.08, 0.1, 0.5, 2),
    }


def nominal_labs(rng):
    """Serum/urine markers inside the green band derived from real pre-flight values (OSD-575/656)."""
    out = {}
    for metric, m in LAB.items():
        lo, hi = m["green"]
        mu = m["preflight_mean"]
        v = min(hi, max(lo, rng.gauss(mu, (hi - lo) / 4)))
        out[metric] = round(v, 3 if abs(v) < 100 else 1)
    return out


def shifted_labs(level, rng):
    """
    Immune problem: shift each cytokine / CRP / urine marker by the REAL Inspiration4 return-day change (OSD-575/656).
    caution = 1.05-1.6 x the observed shift (past the R+1 mean, short of twice the shift),
    critical = 2.1-2.8 x the observed shift (beyond twice what flight did).
    """
    k = (1.05, 1.6) if level == "caution" else (2.1, 2.8)
    out = {}
    for metric, m in LAB.items():
        if metric.startswith("serum_"):      # metabolic panel stays nominal; only immune markers shift
            continue
        v = m["preflight_mean"] + m["flight_shift"] * rng.uniform(*k)
        out[metric] = round(max(v, 0), 3 if abs(v) < 100 else 1)
    return out


def problem_values(a, level, system, rng):
    """Metric -> value overrides for an astronaut in caution/critical."""
    if level == "normal":
        return {}
    c = level == "critical"
    pvt = a.get("pvt_ms", 255)
    if system == "cardiovascular":
        if c:
            return {"heart_rate": _u(rng, 118, 135), "ecg_rhythm": "irregular", "systolic_bp": _u(rng, 162, 175),
                    "diastolic_bp": _u(rng, 98, 106), "hrv": _u(rng, 18, 26)}
        return {"heart_rate": _u(rng, 102, 108), "systolic_bp": _u(rng, 142, 152), "diastolic_bp": _u(rng, 88, 94),
                "hrv": _u(rng, 22, 28)}
    if system == "respiratory":
        if c:
            return {"spo2": _u(rng, 86, 90), "respiration_rate": _u(rng, 29, 33)}
        return {"spo2": _u(rng, 93, 94), "respiration_rate": _u(rng, 23, 26)}
    if system == "radiation":
        return {"radiation_dose": _u(rng, 1.2, 1.6, 2) if c else _u(rng, 0.82, 0.95, 2)}
    if system == "behavioral":
        if c:
            return {"stress_level": _u(rng, 92, 97), "sleep_total": _u(rng, 3.5, 4.2, 1),
                    "pvt_lapses": rng.randint(6, 8), "pvt_reaction_time": int(pvt * rng.uniform(1.5, 1.7))}
        return {"stress_level": _u(rng, 78, 88), "sleep_total": _u(rng, 4.2, 4.8, 1),
                "pvt_lapses": rng.randint(3, 4), "pvt_reaction_time": int(pvt * rng.uniform(1.25, 1.35))}
    if system == "immune":
        labs = shifted_labs(level, rng)
        if c:
            return {"body_temperature": _u(rng, 38.3, 39.0, 1), "blood_glucose": _u(rng, 190, 215), **labs}
        return {"body_temperature": _u(rng, 37.6, 37.9, 1), "blood_glucose": _u(rng, 145, 170), **labs}
    return {}


def cabin_problem_values(level, system, rng):
    if level == "normal":
        return {}
    c = level == "critical"
    return {
        "co2": {"co2": _u(rng, 5300, 6200) if c else _u(rng, 4200, 4800)},
        "o2": {"o2": _u(rng, 18.6, 19.3, 1) if c else _u(rng, 19.6, 19.9, 1)},
        "radiation": {"cabin_radiation": _u(rng, 1.3, 1.8, 2) if c else _u(rng, 0.85, 0.95, 2)},
        "noise": {"noise": _u(rng, 87, 92) if c else _u(rng, 72, 78)},
    }.get(system, {})


# --------------------------------------------------------------------------- batch
UNITS = {
    "heart_rate": ("bpm", "wearable"), "resting_heart_rate": ("bpm", "wearable"), "hrv": ("ms", "wearable"),
    "ecg_rhythm": ("", "patch"), "spo2": ("%", "patch"), "skin_temperature": ("°C", "wearable"),
    "body_temperature": ("°C", "patch"), "respiration_rate": ("breaths/min", "patch"),
    "systolic_bp": ("mmHg", "bp_cuff"), "diastolic_bp": ("mmHg", "bp_cuff"), "blood_glucose": ("mg/dL", "cgm"),
    "stress_level": ("0-100", "wearable"), "radiation_dose": ("mSv/day", "dosimeter"),
    "distance": ("km", "wearable"), "calories_burned": ("kcal", "wearable"), "exercise_minutes": ("min", "wearable"),
    "sleep_total": ("h", "wearable"), "sleep_deep": ("h", "wearable"), "sleep_rem": ("h", "wearable"),
    "sleep_light": ("h", "wearable"), "recovery_score": ("0-100", "wearable"), "body_mass": ("kg", "mass_device"),
    "grip_strength": ("kg", "dynamometer"), "urine_calcium": ("mg/day", "lab"),
    "pvt_reaction_time": ("ms", "pvt_test"), "pvt_lapses": ("count", "pvt_test"),
    "co2": ("ppm", "cabin"), "o2": ("%", "cabin"), "cabin_temperature": ("°C", "cabin"), "humidity": ("%", "cabin"),
    "cabin_pressure": ("kPa", "cabin"), "cabin_radiation": ("mSv/day", "cabin"), "noise": ("dB", "cabin"),
    "voc": ("mg/m³", "cabin"),
}
for _m in LAB.values():
    UNITS[_m["metric"]] = (_m["unit"], "lab")
LIVE_KEYS = list(nominal_live({}, random.Random(0)).keys())
DAILY_KEYS = list(nominal_daily({}, random.Random(0)).keys()) + list(LAB)


def _row(ts, metric, value, astronaut=None):
    unit, source = UNITS.get(metric, ("", "unknown"))
    return {"timestamp": ts.isoformat(timespec="seconds"),
            "astronaut_id": astronaut["id"] if astronaut else None,
            "astronaut": astronaut["name"] if astronaut else "CABIN",
            "source": source, "metric": metric, "value": value, "unit": unit}


def tick_plan(resolved, rng):
    """For random mode, roll this tick's blips. Returns (astronauts, cabin) like resolved."""
    astro = {k: dict(v) for k, v in resolved["astronauts"].items()}
    cabin = dict(resolved["cabin"])
    if resolved.get("mode") != "random":
        return astro, cabin
    rate = resolved.get("anomaly_rate", 0.002)
    for k in astro:
        roll = rng.random()
        if roll < rate / 8:
            astro[k] = {"level": "critical", "system": rng.choice(SYSTEM_CYCLE[:4])}
        elif roll < rate:
            astro[k] = {"level": "caution", "system": rng.choice(SYSTEM_CYCLE)}
    roll = rng.random()
    if roll < rate / 2:
        cabin = {"level": "caution", "system": rng.choice(["co2", "noise"])}
    return astro, cabin


def generate_batch(resolved, crew, ts, daily=False, rng=None):
    """
    One simulator batch for `crew` (list of dicts with id, name, hr, sbp, dbp, glucose, pvt_ms)
    following `resolved` (output of resolve()). Daily metrics (sleep, PVT...) are included when
    daily=True, and always for an astronaut with a behavioral problem (so it shows up now).
    """
    rng = rng or random
    astro, cabin_state = tick_plan(resolved, rng)
    out = []
    values = nominal_cabin(rng)
    values.update(cabin_problem_values(cabin_state["level"], cabin_state["system"], rng))
    out += [_row(ts, m, v) for m, v in values.items()]
    for a in crew:
        st = astro.get(str(a["id"]), {"level": "normal", "system": "cardiovascular"})
        problem = problem_values(a, st["level"], st["system"], rng)
        values = nominal_live(a, rng)
        if daily or any(m in DAILY_KEYS for m in problem):
            values.update(nominal_daily(a, rng))
            values.update(nominal_labs(rng))
        values.update(problem)
        if "sleep_total" in problem and "sleep_deep" in values:      # keep the sleep stages consistent
            sl = values["sleep_total"]
            values["sleep_deep"], values["sleep_rem"] = round(sl * 0.18, 1), round(sl * 0.22, 1)
            values["sleep_light"] = round(sl - values["sleep_deep"] - values["sleep_rem"], 1)
        out += [_row(ts, m, v, a) for m, v in values.items()]
    return out

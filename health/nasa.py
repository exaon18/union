"""
NASA reference data used by the rules and the API.

* health/data/nasa_reference.json: derived from real NASA OSDR studies OSD-575 (Inspiration4 serum),
  OSD-656 (Inspiration4 urine) and OSD-53 (astronaut whole-blood gene expression).
  Rebuild with: python scripts/build_nasa_reference.py
* Lab-marker rules: a value is yellow once it is at least as far from the pre-flight mean as the
  Inspiration4 crew's average return-day (R+1) shift, and red beyond twice that shift.
"""
import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
REFERENCE_FILE = DATA / "nasa_reference.json"


@lru_cache(maxsize=1)
def reference():
    try:
        return json.loads(REFERENCE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def monitoring():
    return {m["metric"]: m for m in reference().get("monitoring", [])}


def _fmt(v):
    return f"{v:g}"


def citation(m):
    return (f"Inspiration4 crew: {_fmt(m['preflight_mean'])} pre-flight -> {_fmt(m['yellow_at'])} {m['unit']} on return day "
            f"(x{m['fold_change']:g}, {m['crew']} crew; NASA OSDR {m['study']})")


def lab_rules():
    """RULES entries for health/sensor_rules.py, built from the OSDR-derived bands."""
    rules = {}
    for metric, m in monitoring().items():
        up = m["direction"] == "up"
        y, rd = m["yellow_at"], m["red_at"]
        word = "above" if up else "below"
        cite = citation(m)
        if up:
            red_test = (lambda t: lambda v: v >= t)(rd)
            yel_test = (lambda t: lambda v: v >= t)(y)
        else:
            red_test = (lambda t: lambda v: v <= t)(rd)
            yel_test = (lambda t: lambda v: v <= t)(y)
        rules[metric] = (m["system"], [
            ("red", red_test, f"{m['label']} beyond twice the spaceflight change",
             (f"Repeat the sample and contact the flight surgeon. {cite}.")[:255]),
            ("yellow", yel_test, f"{m['label']} {word} the post-flight level",
             (f"Like the shift seen after flight; repeat the sample tomorrow. {cite}.")[:255]),
        ])
    return rules

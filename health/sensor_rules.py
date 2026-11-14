"""
Threshold rules for real-time sensor readings (from the webhook).

Each entry: metric -> list of (level, test, message, recommendation).
The first matching rule wins (put RED before YELLOW).
Thresholds are prototype values for a demo, NOT clinical guidance.
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import Alert

RED, YELLOW = Alert.RED, Alert.YELLOW

RULES = {
    # metric: (system, [(level, test(value), message, recommendation), ...])
    "heart_rate": ("cardiovascular", [
        (RED, lambda v: v > 110, "Very high heart rate", "Stop activity, rest 15 min and re-measure. Contact mission support if it persists."),
        (YELLOW, lambda v: v > 100, "High heart rate", "Rest and monitor."),
    ]),
    "hrv": ("cardiovascular", [
        (YELLOW, lambda v: v < 30, "Low heart rate variability (fatigue/stress)", "Prioritise rest and recovery today."),
    ]),
    "ecg_rhythm": ("cardiovascular", [
        (RED, lambda v: v == "irregular", "Irregular heart rhythm detected", "Record a full ECG and contact the flight surgeon."),
    ]),
    "spo2": ("cardiovascular", [
        (RED, lambda v: v < 92, "Low blood oxygen", "Check cabin O2 and breathe supplemental oxygen; contact mission support."),
        (YELLOW, lambda v: v < 95, "Blood oxygen slightly low", "Re-measure in 10 minutes."),
    ]),
    "systolic_bp": ("cardiovascular", [
        (RED, lambda v: v > 160, "Very high blood pressure", "Rest and contact the flight surgeon."),
        (YELLOW, lambda v: v > 140, "Elevated blood pressure", "Reduce sodium and re-check later."),
    ]),
    "body_temperature": ("immune", [
        (RED, lambda v: v > 38, "Fever", "Possible infection: isolate if possible and contact mission support."),
    ]),
    "respiration_rate": ("cardiovascular", [
        (YELLOW, lambda v: v > 22, "Fast breathing", "Rest and check cabin CO2 levels."),
    ]),
    "blood_glucose": ("immune", [
        (RED, lambda v: v > 180 or v < 60, "Blood glucose out of safe range", "Re-test; eat or adjust meal plan; contact the flight surgeon."),
        (YELLOW, lambda v: v > 140, "Blood glucose high", "Review recent meals and re-test in 2 hours."),
    ]),
    "stress_level": ("behavioral", [
        (YELLOW, lambda v: v > 75, "High stress level", "Take a break; schedule a call with the flight psychologist."),
    ]),
    "radiation_dose": ("radiation", [
        (RED, lambda v: v > 1, "High personal radiation dose", "Move to the shielded area and contact mission support."),
    ]),
    "sleep_total": ("behavioral", [
        (YELLOW, lambda v: v < 5, "Short sleep", "Adjust the schedule to allow a full sleep period."),
    ]),
    "urine_calcium": ("musculoskeletal", [
        (RED, lambda v: v > 300, "High urine calcium (bone loss / kidney stone risk)", "Increase water intake and resistance exercise; inform the flight surgeon."),
        (YELLOW, lambda v: v > 250, "Rising urine calcium", "Check exercise minutes and hydration."),
    ]),
    "exercise_minutes": ("musculoskeletal", [
        (YELLOW, lambda v: v < 60, "Not enough exercise (bone and muscle loss risk)", "Complete today's exercise session."),
    ]),
    "pvt_lapses": ("behavioral", [
        (RED, lambda v: v >= 6, "Many attention lapses (severe fatigue)", "Avoid critical tasks (EVA, docking) and rest."),
        (YELLOW, lambda v: v >= 3, "Attention lapses (fatigue)", "Rest before critical tasks."),
    ]),
    # Cabin / environment
    "co2": ("environment", [
        (RED, lambda v: v > 5000, "Cabin CO2 dangerously high", "Check CO2 scrubbers immediately; alert mission control."),
        (YELLOW, lambda v: v > 4000, "Cabin CO2 elevated", "Check ventilation; may cause headaches."),
    ]),
    "o2": ("environment", [
        (RED, lambda v: v < 19.5, "Cabin O2 low", "Check life support and alert mission control."),
    ]),
    "cabin_radiation": ("radiation", [
        (RED, lambda v: v > 1, "Cabin radiation spike (possible solar event)", "All crew to the shielded area."),
    ]),
    "noise": ("environment", [
        (YELLOW, lambda v: v > 70, "Cabin noise high", "Use hearing protection; affects sleep and stress."),
    ]),
}


def match_reading(reading):
    """Return an UNSAVED Alert if `reading` breaks a rule in RULES, else None."""
    rule = RULES.get(reading.metric)
    if not rule:
        return None
    system, checks = rule
    value = reading.value if reading.value is not None else reading.text_value
    for level, test, message, recommendation in checks:
        try:
            hit = test(value)
        except TypeError:
            continue
        if hit:
            text = f"{message}: {value:g} {reading.unit}".strip() if isinstance(value, (int, float)) else message
            return Alert(
                astronaut=reading.astronaut, reading=reading, system=system, level=level,
                message=text, recommendation=recommendation,
            )
    return None


def _open_alert_keys(minutes):
    """(astronaut_id, metric, level) of open sensor alerts created in the last `minutes`."""
    if minutes <= 0:
        return set()
    since = timezone.now() - timedelta(minutes=minutes)
    return set(
        Alert.objects.filter(resolved=False, created_at__gte=since, reading__isnull=False)
        .values_list("astronaut_id", "reading__metric", "level")
    )


def evaluate_readings(readings, dedup_minutes=None):
    """
    Check many saved SensorReadings and bulk-create the alerts they trigger.
    An alert is skipped when the same astronaut/metric/level already has an open
    alert from the last ALERT_DEDUP_MINUTES (so a stuck sensor doesn't flood the
    crew with identical alerts). Returns the created alerts.
    """
    if dedup_minutes is None:
        dedup_minutes = getattr(settings, "ALERT_DEDUP_MINUTES", 0)
    seen = _open_alert_keys(dedup_minutes)
    new = []
    for reading in readings:
        alert = match_reading(reading)
        if alert is None:
            continue
        key = (reading.astronaut_id, reading.metric, alert.level)
        if key in seen:
            continue
        seen.add(key)
        new.append(alert)
    if new:
        Alert.objects.bulk_create(new)
    return new


def evaluate_reading(reading):
    """Check one SensorReading against RULES and create an Alert if a rule matches."""
    created = evaluate_readings([reading])
    return created[0] if created else None

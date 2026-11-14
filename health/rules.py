"""
Rule-based alert engine for ASTRA HEALTH.

Each rule looks at one reading and returns an alert (or nothing).
This is a decision-support prototype, NOT a medical diagnosis tool.
"""
from .models import Alert

RED, YELLOW = Alert.RED, Alert.YELLOW


def check(checkin):
    """Return a list of (system, level, message, recommendation) tuples for one check-in."""
    a = checkin.astronaut
    found = []

    # Cardiovascular
    if checkin.heart_rate > 100:
        found.append(("cardiovascular", RED, f"High heart rate: {checkin.heart_rate} bpm (baseline {a.baseline_heart_rate})",
                      "Rest and re-measure in 15 min; contact mission support if it stays high."))
    elif checkin.heart_rate > a.baseline_heart_rate * 1.2:
        found.append(("cardiovascular", YELLOW, f"Heart rate {checkin.heart_rate} bpm is 20%+ above baseline",
                      "Monitor at the next check-in."))
    if checkin.systolic_bp > 140:
        found.append(("cardiovascular", YELLOW, f"Elevated blood pressure: {checkin.systolic_bp}/{checkin.diastolic_bp} mmHg",
                      "Reduce sodium and re-check tomorrow."))
    if checkin.temperature > 38:
        found.append(("immune", RED, f"Fever: {checkin.temperature:.1f} °C",
                      "Possible infection; isolate if possible and contact mission support."))

    # Behavioral
    if checkin.sleep_hours < 5:
        found.append(("behavioral", YELLOW, f"Short sleep: {checkin.sleep_hours:.1f} h",
                      "Adjust the schedule to allow a full sleep period."))
    if checkin.mood <= 2 or checkin.stress >= 4:
        found.append(("behavioral", YELLOW, f"Low mood / high stress (mood {checkin.mood}, stress {checkin.stress})",
                      "Schedule a private conference with the flight psychologist."))

    # Bone and muscle
    if checkin.exercise_minutes < 60:
        found.append(("musculoskeletal", YELLOW, f"Only {checkin.exercise_minutes} min exercise (target ≥ 60)",
                      "Bone and muscle loss risk in microgravity; complete the exercise session."))

    # Radiation
    if checkin.radiation_msv > 1:
        found.append(("radiation", RED, f"High radiation dose: {checkin.radiation_msv:.2f} mSv today",
                      "Move to the shielded area and contact mission support."))

    return found


def evaluate(checkin):
    """Run all rules on a check-in and save any alerts. Returns the created alerts."""
    return [
        Alert.objects.create(astronaut=checkin.astronaut, checkin=checkin,
                             system=system, level=level, message=msg, recommendation=rec)
        for system, level, msg, rec in check(checkin)
    ]

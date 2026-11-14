import hashlib
import secrets

from django.conf import settings
from django.db import models


class Astronaut(models.Model):
    """A crew member being monitored. Linked to a login account (core.User)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="astronaut")
    mission = models.CharField(max_length=100)
    role = models.CharField(max_length=50)  # e.g. Commander, Flight Engineer

    # Personal baselines: each astronaut is compared against their own normal values
    baseline_heart_rate = models.PositiveIntegerField(default=70)
    baseline_systolic_bp = models.PositiveIntegerField(default=120)
    baseline_diastolic_bp = models.PositiveIntegerField(default=80)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.role})"


class DailyCheckIn(models.Model):
    """One day's readings from wearables, measurements, and the self-assessment."""
    astronaut = models.ForeignKey(Astronaut, on_delete=models.CASCADE, related_name="checkins")
    created_at = models.DateTimeField(auto_now_add=True)

    # Cardiovascular
    heart_rate = models.PositiveIntegerField(help_text="beats per minute")
    systolic_bp = models.PositiveIntegerField(help_text="mmHg")
    diastolic_bp = models.PositiveIntegerField(help_text="mmHg")
    temperature = models.FloatField(help_text="°C")

    # Bone and muscle
    exercise_minutes = models.PositiveIntegerField(default=0)

    # Behavioral (self-assessment, 1 = very low, 5 = very high)
    sleep_hours = models.FloatField()
    mood = models.PositiveSmallIntegerField(help_text="1–5")
    stress = models.PositiveSmallIntegerField(help_text="1–5")

    # Radiation
    radiation_msv = models.FloatField(default=0, help_text="dose today in millisieverts")

    symptoms = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.astronaut} – {self.created_at:%Y-%m-%d %H:%M}"


class Alert(models.Model):
    """A flag raised by the rule engine (health/rules.py)."""
    GREEN, YELLOW, RED = "green", "yellow", "red"
    LEVEL_CHOICES = [(GREEN, "Green"), (YELLOW, "Yellow – watch"), (RED, "Red – contact mission support")]

    SYSTEM_CHOICES = [
        ("cardiovascular", "Cardiovascular"),
        ("musculoskeletal", "Bone & muscle"),
        ("immune", "Immune"),
        ("behavioral", "Behavioral"),
        ("radiation", "Radiation"),
        ("environment", "Environment"),
    ]

    # astronaut is empty for cabin/environment alerts
    astronaut = models.ForeignKey(Astronaut, on_delete=models.CASCADE, related_name="alerts", null=True, blank=True)
    # SET_NULL so pruning old sensor readings keeps the alert history
    reading = models.ForeignKey("SensorReading", on_delete=models.SET_NULL, related_name="alerts", null=True, blank=True)
    checkin = models.ForeignKey(DailyCheckIn, on_delete=models.CASCADE, related_name="alerts", null=True, blank=True)
    system = models.CharField(max_length=20, choices=SYSTEM_CHOICES)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES)
    message = models.CharField(max_length=255)
    recommendation = models.CharField(max_length=255, blank=True)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # Mission support workflow (flight surgeon)
    acknowledged = models.BooleanField(default=False)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name="acknowledged_alerts")
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name="resolved_alerts")

    class Meta:
        ordering = ["resolved", "-created_at"]
        indexes = [
            models.Index(fields=["resolved", "created_at"], name="alert_resolved_created_idx"),
            models.Index(fields=["astronaut", "resolved", "created_at"], name="alert_astro_resolved_idx"),
        ]

    def __str__(self):
        return f"[{self.level.upper()}] {self.astronaut or 'CABIN'}: {self.message}"


class SensorReading(models.Model):
    """
    One value from one device at one moment (wearable, patch, CGM, cabin sensor, lab, PVT...).
    Stored one-metric-per-row so new devices/metrics need no database changes.
    """
    astronaut = models.ForeignKey(Astronaut, on_delete=models.CASCADE, related_name="readings",
                                  null=True, blank=True)  # empty = cabin/environment data
    source = models.CharField(max_length=30)   # wearable, patch, cgm, bp_cuff, cabin, lab, pvt_test...
    metric = models.CharField(max_length=40, db_index=True)  # heart_rate, spo2, co2...
    value = models.FloatField(null=True, blank=True)          # numeric values
    text_value = models.CharField(max_length=50, blank=True)  # non-numeric, e.g. ecg_rhythm = "irregular"
    unit = models.CharField(max_length=20, blank=True)
    timestamp = models.DateTimeField(db_index=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            # latest-per-metric and history for one astronaut (or cabin when astronaut is NULL).
            # Ascending on purpose: SQLite scans it backwards for ORDER BY timestamp DESC, id DESC.
            models.Index(fields=["astronaut", "metric", "timestamp"], name="reading_astro_metric_ts_idx"),
            # last reading per astronaut (crew status)
            models.Index(fields=["astronaut", "timestamp"], name="reading_astro_ts_idx"),
            models.Index(fields=["metric", "timestamp"], name="reading_metric_ts_idx"),
        ]

    def __str__(self):
        who = self.astronaut or "CABIN"
        return f"{who} {self.metric}={self.value if self.value is not None else self.text_value} {self.unit}"


class PVTResult(models.Model):
    """One Psychomotor Vigilance Task run (reaction-time test for fatigue)."""
    astronaut = models.ForeignKey(Astronaut, on_delete=models.CASCADE, related_name="pvt_results")
    mean_rt_ms = models.PositiveIntegerField()
    fastest_ms = models.PositiveIntegerField(null=True, blank=True)
    lapses = models.PositiveSmallIntegerField(default=0, help_text="responses slower than 500 ms")
    false_starts = models.PositiveSmallIntegerField(default=0)
    trials = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["astronaut", "created_at"], name="pvt_astro_created_idx")]

    def __str__(self):
        return f"PVT {self.astronaut} {self.mean_rt_ms} ms, {self.lapses} lapses"


class AuthToken(models.Model):
    """
    API login token for the static frontend (header: Authorization: Token <key>).
    Only a SHA-256 hash of the key is stored; the plain key is shown once at login.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="api_tokens")
    key_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def hash_key(key):
        return hashlib.sha256(key.encode()).hexdigest()

    @classmethod
    def issue(cls, user):
        """Create a token for `user`; returns (token_obj, plain_key)."""
        key = secrets.token_hex(20)
        return cls.objects.create(user=user, key_hash=cls.hash_key(key)), key

    def __str__(self):
        return f"token for {self.user} ({self.created_at:%Y-%m-%d %H:%M})"

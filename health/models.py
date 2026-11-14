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

    astronaut = models.ForeignKey(Astronaut, on_delete=models.CASCADE, related_name="alerts")
    checkin = models.ForeignKey(DailyCheckIn, on_delete=models.CASCADE, related_name="alerts", null=True, blank=True)
    system = models.CharField(max_length=20, choices=SYSTEM_CHOICES)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES)
    message = models.CharField(max_length=255)
    recommendation = models.CharField(max_length=255, blank=True)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["resolved", "-created_at"]

    def __str__(self):
        return f"[{self.level.upper()}] {self.astronaut}: {self.message}"

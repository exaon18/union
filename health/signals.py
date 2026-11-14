from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import DailyCheckIn
from .rules import evaluate


@receiver(post_save, sender=DailyCheckIn)
def run_rules_on_new_checkin(sender, instance, created, **kwargs):
    """Every time a NEW check-in is saved, run the alert rules on it automatically."""
    if created:
        evaluate(instance)

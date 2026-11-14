from django.db.backends.signals import connection_created
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import DailyCheckIn
from .rules import evaluate


@receiver(post_save, sender=DailyCheckIn)
def run_rules_on_new_checkin(sender, instance, created, **kwargs):
    """Every time a NEW check-in is saved, run the alert rules on it automatically."""
    if created:
        evaluate(instance)


@receiver(connection_created)
def sqlite_tuning(sender, connection, **kwargs):
    """
    SQLite: WAL lets readers (dashboard API) work while a writer (simulator webhook)
    is committing, instead of blocking each other. synchronous=NORMAL is safe with WAL
    and much faster for frequent small writes.
    """
    if connection.vendor == "sqlite":
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA busy_timeout=20000;")

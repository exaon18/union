"""
python manage.py prune_readings --keep-hours 48
Deletes sensor readings older than N hours (alerts are kept; their reading link becomes empty).
--drop-future also deletes readings dated more than 5 minutes in the future
(e.g. rows saved 3 h ahead by the old simulator time-zone bug).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from health.models import Alert, SensorReading

BATCH = 5000


class Command(BaseCommand):
    help = "Delete old sensor readings to keep SQLite small and fast"

    def add_arguments(self, parser):
        parser.add_argument("--keep-hours", type=int, default=48)
        parser.add_argument("--drop-future", action="store_true",
                            help="also delete readings dated > 5 min in the future")
        parser.add_argument("--vacuum", action="store_true", help="VACUUM the SQLite file afterwards")

    def _delete(self, qs):
        total = 0
        while True:
            ids = list(qs.values_list("id", flat=True)[:BATCH])
            if not ids:
                return total
            with transaction.atomic():
                Alert.objects.filter(reading_id__in=ids).update(reading=None)
                # _raw_delete: one DELETE statement, no per-row Python cascade
                SensorReading.objects.filter(id__in=ids)._raw_delete(SensorReading.objects.db)
            total += len(ids)

    def handle(self, *args, keep_hours, drop_future, vacuum, **opts):
        now = timezone.now()
        old = self._delete(SensorReading.objects.filter(timestamp__lt=now - timedelta(hours=keep_hours)).order_by())
        self.stdout.write(f"deleted {old} readings older than {keep_hours} h")
        if drop_future:
            fut = self._delete(SensorReading.objects.filter(timestamp__gt=now + timedelta(minutes=5)).order_by())
            self.stdout.write(f"deleted {fut} readings dated in the future")
        if vacuum and connection.vendor == "sqlite":
            with connection.cursor() as c:
                c.execute("VACUUM")
            self.stdout.write("vacuumed")
        self.stdout.write(self.style.SUCCESS(f"{SensorReading.objects.count()} readings left"))

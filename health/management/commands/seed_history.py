"""
python manage.py seed_history --days 7
Backfills past readings (4 per day per astronaut + cabin + one daily summary with sleep,
PVT, urine calcium...) using the device simulator's generators, so the 7-day charts have
data right after a fresh deploy. No alerts are created for backfilled data.
"""
import random
import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from health.models import Astronaut, SensorReading
from health.webhook import parse_timestamp

sys.path.insert(0, str(Path(settings.BASE_DIR) / "device_simulator"))
import generators  # noqa: E402


class Command(BaseCommand):
    help = "Backfill N days of simulated history (no alerts)"

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7)
        parser.add_argument("--seed", type=int, default=None)

    def handle(self, *args, days, seed, **opts):
        if seed is not None:
            random.seed(seed)
        crew = {a.id: a for a in Astronaut.objects.all()}
        if not crew:
            self.stderr.write("No astronauts. Run: python manage.py seed_crew")
            return
        now = timezone.now()
        rows = []
        for item in generators.history(days):
            aid = item.get("astronaut_id")
            if aid is not None and aid not in crew:
                continue
            ts = parse_timestamp(item["timestamp"], now)   # naive -> EAT
            if ts >= now:
                continue
            value = item["value"]
            numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
            rows.append(SensorReading(
                astronaut=crew.get(aid), source=item["source"], metric=item["metric"],
                value=value if numeric else None, text_value="" if numeric else str(value),
                unit=item.get("unit", ""), timestamp=ts,
            ))
        SensorReading.objects.bulk_create(rows, batch_size=2000)
        self.stdout.write(self.style.SUCCESS(f"Backfilled {len(rows)} readings over {days} days."))

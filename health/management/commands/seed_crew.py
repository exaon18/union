"""python manage.py seed_crew  -> creates the 4 demo astronauts (ids 1-4) the simulator uses."""
from django.core.management.base import BaseCommand

from core.models import User
from health.models import Astronaut

CREW = [
    ("abebe", "Abebe", "Kebede", "Commander", 62, 118, 76),
    ("sara", "Sara", "Tesfaye", "Flight Engineer", 68, 112, 72),
    ("dawit", "Dawit", "Haile", "Medical Officer", 72, 124, 80),
    ("hana", "Hana", "Girma", "Mission Specialist", 65, 115, 74),
]


class Command(BaseCommand):
    help = "Create the demo crew"

    def handle(self, *args, **opts):
        for i, (username, first, last, role, hr, sbp, dbp) in enumerate(CREW, start=1):
            user, _ = User.objects.get_or_create(username=username, defaults={
                "first_name": first, "last_name": last, "role": "astronaut"})
            user.set_password("astra2026")
            user.save()
            Astronaut.objects.update_or_create(id=i, defaults={
                "user": user, "mission": "Artemis Mars Transit", "role": role,
                "baseline_heart_rate": hr, "baseline_systolic_bp": sbp, "baseline_diastolic_bp": dbp})
            self.stdout.write(f"  astronaut {i}: {first} {last} ({role})  login: {username} / astra2026")
        self.stdout.write(self.style.SUCCESS("Crew ready."))

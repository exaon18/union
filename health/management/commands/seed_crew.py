"""python manage.py seed_crew  -> creates the 4 demo astronauts (ids 1-4) the simulator uses,
plus the flight surgeon account. All passwords: astra2026."""
from django.core.management.base import BaseCommand

from core.models import User
from health.models import Astronaut

PASSWORD = "astra2026"

CREW = [
    ("abebe", "Abebe", "Kebede", "Commander", 62, 118, 76),
    ("sara", "Sara", "Tesfaye", "Flight Engineer", 68, 112, 72),
    ("dawit", "Dawit", "Haile", "Medical Officer", 72, 124, 80),
    ("hana", "Hana", "Girma", "Mission Specialist", 65, 115, 74),
]

SURGEON = ("surgeon", "Meron", "Alemu")


class Command(BaseCommand):
    help = "Create the demo crew and the flight surgeon (password astra2026)"

    def handle(self, *args, **opts):
        for i, (username, first, last, role, hr, sbp, dbp) in enumerate(CREW, start=1):
            user, _ = User.objects.get_or_create(username=username, defaults={
                "first_name": first, "last_name": last, "role": "astronaut"})
            user.set_password(PASSWORD)
            user.save()
            Astronaut.objects.update_or_create(id=i, defaults={
                "user": user, "mission": "Artemis Mars Transit", "role": role,
                "baseline_heart_rate": hr, "baseline_systolic_bp": sbp, "baseline_diastolic_bp": dbp})
            self.stdout.write(f"  astronaut {i}: {first} {last} ({role})  login: {username} / {PASSWORD}")

        username, first, last = SURGEON
        user, _ = User.objects.get_or_create(username=username)
        user.first_name, user.last_name, user.role = first, last, "surgeon"
        user.is_staff = True          # can also open /admin (not superuser)
        user.set_password(PASSWORD)
        user.save()
        self.stdout.write(f"  flight surgeon: Dr. {first} {last}  login: {username} / {PASSWORD}")
        self.stdout.write(self.style.SUCCESS("Crew ready."))

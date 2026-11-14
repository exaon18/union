from django.contrib import admin

from .models import Alert, Astronaut, DailyCheckIn


@admin.register(Astronaut)
class AstronautAdmin(admin.ModelAdmin):
    list_display = ("__str__", "mission", "role", "baseline_heart_rate")


@admin.register(DailyCheckIn)
class DailyCheckInAdmin(admin.ModelAdmin):
    list_display = ("astronaut", "created_at", "heart_rate", "systolic_bp", "temperature", "sleep_hours", "radiation_msv")
    list_filter = ("astronaut",)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("astronaut", "level", "system", "message", "resolved", "created_at")
    list_filter = ("level", "system", "resolved")
    list_editable = ("resolved",)

from django.contrib import admin

from .models import Alert, Astronaut, AuthToken, DailyCheckIn, PVTResult, SensorReading


@admin.register(Astronaut)
class AstronautAdmin(admin.ModelAdmin):
    list_display = ("__str__", "mission", "role", "baseline_heart_rate")


@admin.register(DailyCheckIn)
class DailyCheckInAdmin(admin.ModelAdmin):
    list_display = ("astronaut", "created_at", "heart_rate", "systolic_bp", "temperature", "sleep_hours", "radiation_msv")
    list_filter = ("astronaut",)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("astronaut", "level", "system", "message", "acknowledged", "resolved", "created_at")
    list_filter = ("level", "system", "acknowledged", "resolved")
    list_editable = ("resolved",)


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "astronaut", "source", "metric", "value", "text_value", "unit")
    list_filter = ("source", "metric", "astronaut")


@admin.register(PVTResult)
class PVTResultAdmin(admin.ModelAdmin):
    list_display = ("astronaut", "created_at", "mean_rt_ms", "fastest_ms", "lapses", "false_starts", "trials")
    list_filter = ("astronaut",)


@admin.register(AuthToken)
class AuthTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "last_used_at")
    readonly_fields = ("key_hash",)

from django.urls import path

from . import webhook

urlpatterns = [
    path("webhook/readings/", webhook.receive_readings, name="webhook-readings"),
]

from django.urls import path

from . import views, webhook

urlpatterns = [
    path("", views.api_index, name="api-index"),
    path("crew/", views.crew_list, name="crew-list"),
    path("crew/<str:pk>/", views.crew_detail, name="crew-detail"),
    path("readings/latest/", views.readings_latest, name="readings-latest"),
    path("readings/history/", views.readings_history, name="readings-history"),
    path("cabin/latest/", views.cabin_latest, name="cabin-latest"),
    path("alerts/", views.alerts_list, name="alerts-list"),
    path("checkins/", views.checkins_list, name="checkins-list"),
    path("webhook/readings/", webhook.receive_readings, name="webhook-readings"),
]

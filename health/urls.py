from django.urls import path

from . import auth, sim, views, voice, webhook

urlpatterns = [
    path("", views.api_index, name="api-index"),
    path("auth/login/", auth.login_view, name="auth-login"),
    path("auth/me/", auth.me_view, name="auth-me"),
    path("auth/logout/", auth.logout_view, name="auth-logout"),
    path("crew/", views.crew_list, name="crew-list"),
    path("crew/<str:pk>/", views.crew_detail, name="crew-detail"),
    path("readings/latest/", views.readings_latest, name="readings-latest"),
    path("readings/history/", views.readings_history, name="readings-history"),
    path("cabin/latest/", views.cabin_latest, name="cabin-latest"),
    path("alerts/", views.alerts_list, name="alerts-list"),
    path("alerts/<str:pk>/acknowledge/", views.alert_acknowledge, name="alert-acknowledge"),
    path("alerts/<str:pk>/resolve/", views.alert_resolve, name="alert-resolve"),
    path("checkins/", views.checkins_view, name="checkins"),
    path("pvt/", views.pvt_view, name="pvt"),
    path("sim/scenario/", sim.scenario_view, name="sim-scenario"),
    path("sim/reset/", sim.reset_view, name="sim-reset"),
    path("sim/tick/", sim.tick_view, name="sim-tick"),
    path("voice-alert/", voice.warning_audio, name="voice-alert"),
    path("space-weather/", sim.space_weather_view, name="space-weather"),
    path("nasa/reference/", sim.nasa_reference_view, name="nasa-reference"),
    path("webhook/readings/", webhook.receive_readings, name="webhook-readings"),
    path("leaderboard/", views.leaderboard_view, name="leaderboard"),
]

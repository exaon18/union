import hashlib
import hmac
import json
from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Alert, Astronaut, AuthToken, DailyCheckIn, PVTResult, SensorReading

SECRET = "test-secret"


@override_settings(WEBHOOK_SECRET=SECRET, ALERT_DEDUP_MINUTES=5, ALERT_AUTO_RESOLVE_MINUTES=30)
class ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_crew", stdout=open("/dev/null", "w"))

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": "astra2026"},
                             content_type="application/json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def post(self, url, data=None, token=None):
        headers = {"HTTP_AUTHORIZATION": f"Token {token}"} if token else {}
        return self.client.post(url, json.dumps(data or {}), content_type="application/json", **headers)

    def webhook(self, readings):
        body = json.dumps({"readings": readings}).encode()
        sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        return self.client.post("/api/webhook/readings/", body, content_type="application/json",
                                HTTP_X_ASTRA_SIGNATURE=sig)

    # --- auth ---
    def test_login_roles(self):
        sara = self.login("sara")
        self.assertEqual(sara["user"]["role"], "astronaut")
        self.assertEqual(sara["user"]["astronaut_id"], 2)
        surgeon = self.login("surgeon")
        self.assertEqual(surgeon["user"]["role"], "surgeon")
        self.assertIsNone(surgeon["user"]["astronaut_id"])
        r = self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Token {sara['token']}")
        self.assertEqual(r.json()["user"]["username"], "sara")
        self.assertFalse(AuthToken.objects.filter(key_hash=sara["token"]).exists())  # stored hashed

    def test_bad_login_and_logout(self):
        r = self.client.post("/api/auth/login/", {"username": "sara", "password": "nope"}, content_type="application/json")
        self.assertEqual(r.status_code, 401)
        tok = self.login("sara")["token"]
        self.assertEqual(self.post("/api/auth/logout/", token=tok).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Token {tok}").status_code, 401)

    @override_settings(API_TOKEN_TTL_HOURS=1)
    def test_expired_token(self):
        tok = self.login("sara")["token"]
        AuthToken.objects.update(created_at=timezone.now() - timedelta(hours=2))
        self.assertEqual(self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Token {tok}").status_code, 401)

    # --- check-ins ---
    CHECKIN = {"heart_rate": 72, "systolic_bp": 118, "diastolic_bp": 76, "temperature": 36.8,
               "exercise_minutes": 45, "sleep_hours": 4.5, "mood": 4, "stress": 2, "radiation_msv": 0.3,
               "symptoms": "headache", "urine_calcium": 320}

    def test_checkin_create_runs_rules(self):
        tok = self.login("sara")["token"]
        r = self.post("/api/checkins/", self.CHECKIN, tok)
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["checkin"]["astronaut_id"], 2)
        messages = [a["message"] for a in body["alerts"]]
        self.assertTrue(any("Short sleep" in m for m in messages))
        self.assertTrue(any("exercise" in m for m in messages))
        self.assertTrue(any("urine calcium" in m for m in messages))
        self.assertEqual(body["status"], "red")
        self.assertEqual(self.client.get("/api/checkins/?astronaut=2").json()["count"], 1)

    def test_checkin_permissions_and_validation(self):
        self.assertEqual(self.post("/api/checkins/", self.CHECKIN).status_code, 401)
        tok = self.login("sara")["token"]
        self.assertEqual(self.post("/api/checkins/", dict(self.CHECKIN, astronaut_id=1), tok).status_code, 403)
        bad = self.post("/api/checkins/", dict(self.CHECKIN, mood=9), tok)
        self.assertEqual(bad.status_code, 400)
        self.assertIn("mood", bad.json()["error"])
        surgeon = self.login("surgeon")["token"]
        self.assertEqual(self.post("/api/checkins/", self.CHECKIN, surgeon).status_code, 400)  # needs astronaut_id
        self.assertEqual(self.post("/api/checkins/", dict(self.CHECKIN, astronaut_id=3), surgeon).status_code, 201)
        self.assertEqual(DailyCheckIn.objects.count(), 1)

    # --- PVT ---
    def test_pvt(self):
        tok = self.login("sara")["token"]
        r = self.post("/api/pvt/", {"mean_rt": 430, "fastest_ms": 250, "lapses": 6, "false_starts": 1, "trials": 10}, tok)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["status"], "red")
        self.assertEqual(PVTResult.objects.get().mean_rt_ms, 430)
        self.assertEqual(set(SensorReading.objects.values_list("metric", flat=True)), {"pvt_lapses", "pvt_reaction_time"})
        self.assertEqual(self.client.get("/api/pvt/?astronaut=2").json()["results"][0]["lapses"], 6)
        self.assertEqual(self.post("/api/pvt/", {"mean_rt_ms": 300, "lapses": 11, "trials": 10}, tok).status_code, 400)

    def test_leaderboard_uses_latest_pvt_result_per_astronaut(self):
        astronauts = list(Astronaut.objects.order_by("id"))
        PVTResult.objects.create(astronaut=astronauts[0], mean_rt_ms=500, trials=10)
        PVTResult.objects.create(astronaut=astronauts[0], mean_rt_ms=250, trials=10)
        PVTResult.objects.create(astronaut=astronauts[1], mean_rt_ms=300, lapses=1, trials=10)

        response = self.client.get("/api/leaderboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 2)
        self.assertEqual([row["astronaut_id"] for row in response.json()["leaderboard"]], [1, 2])
        self.assertEqual(response.json()["leaderboard"][0]["mean_rt_ms"], 250)
        top = response.json()["leaderboard"][0]
        self.assertEqual(top["rank"], 1)
        self.assertEqual(top["score"], 750)          # 1000 - (250-150)*2.5
        self.assertEqual(top["attempts"], 2)
        self.assertTrue(top["personal_best"])
        self.assertEqual(top["change"], 750 - 125)   # previous run: 500 ms -> 125
        self.assertEqual(top["tier"], "Sharp")

    # --- alerts ---
    def test_acknowledge_resolve_surgeon_only(self):
        a = Alert.objects.create(system="environment", level="red", message="CO2")
        sara = self.login("sara")["token"]
        self.assertEqual(self.post(f"/api/alerts/{a.id}/resolve/", token=sara).status_code, 403)
        surgeon = self.login("surgeon")["token"]
        r = self.post(f"/api/alerts/{a.id}/acknowledge/", token=surgeon)
        self.assertTrue(r.json()["alert"]["acknowledged"])
        self.assertFalse(r.json()["alert"]["resolved"])
        r = self.post(f"/api/alerts/{a.id}/resolve/", token=surgeon)
        self.assertTrue(r.json()["alert"]["resolved"])
        self.assertEqual(self.post("/api/alerts/999/resolve/", token=surgeon).status_code, 404)
        self.assertEqual(self.client.get("/api/alerts/?acknowledged=true").json()["count"], 1)

    # --- webhook, time zones, dedup ---
    def test_webhook_timezones_and_dedup(self):
        r = self.webhook([
            {"timestamp": "2026-11-14T22:00:00", "astronaut_id": 1, "source": "wearable", "metric": "heart_rate", "value": 120, "unit": "bpm"},
            {"timestamp": "2026-11-14T19:00:00+00:00", "astronaut_id": 1, "source": "wearable", "metric": "spo2", "value": 98, "unit": "%"},
        ])
        self.assertEqual(r.status_code, 201, r.content)
        hr = SensorReading.objects.get(metric="heart_rate")
        spo2 = SensorReading.objects.get(metric="spo2")
        self.assertEqual(hr.timestamp, spo2.timestamp)            # naive 22:00 EAT == 19:00 UTC
        self.assertEqual(len(r.json()["alerts"]), 1)
        r = self.webhook([{"timestamp": "2026-11-14T19:00:03+00:00", "astronaut_id": 1, "source": "wearable",
                           "metric": "heart_rate", "value": 125, "unit": "bpm"}])
        self.assertEqual(len(r.json()["alerts"]), 0)              # deduplicated while the first is open
        future = (timezone.now() + timedelta(hours=3)).isoformat()
        self.webhook([{"timestamp": future, "astronaut_id": 1, "metric": "hrv", "value": 50}])
        self.assertLess(SensorReading.objects.get(metric="hrv").timestamp, timezone.now() + timedelta(minutes=1))

    @override_settings(ALERT_CLEAR_AFTER_SECONDS=60)
    def test_alert_clears_when_back_to_normal(self):
        self.webhook([{"astronaut_id": 1, "metric": "spo2", "value": 90, "unit": "%"}])
        alert = Alert.objects.get()
        self.webhook([{"astronaut_id": 1, "metric": "spo2", "value": 98, "unit": "%"}])
        alert.refresh_from_db()
        self.assertFalse(alert.resolved)                           # too fresh to clear
        Alert.objects.update(created_at=timezone.now() - timedelta(minutes=5))
        self.webhook([{"astronaut_id": 1, "metric": "spo2", "value": 89, "unit": "%"}])
        alert.refresh_from_db()
        self.assertFalse(alert.resolved)                           # still abnormal
        self.webhook([{"astronaut_id": 1, "metric": "spo2", "value": 98, "unit": "%"}])
        alert.refresh_from_db()
        self.assertTrue(alert.resolved)
        listed = self.client.get("/api/alerts/?astronaut=1").json()["alerts"]
        self.assertEqual([a["resolved_by"] for a in listed if a["id"] == alert.id], ["auto"])

    def test_bad_signature(self):
        r = self.client.post("/api/webhook/readings/", "{}", content_type="application/json", HTTP_X_ASTRA_SIGNATURE="sha256=x")
        self.assertEqual(r.status_code, 401)

    # --- reads ---
    def test_latest_and_crew(self):
        now = timezone.now()
        for i, v in enumerate([70, 80, 90]):
            SensorReading.objects.create(astronaut_id=2, source="w", metric="heart_rate", value=v, unit="bpm",
                                         timestamp=now - timedelta(minutes=3 - i))
        SensorReading.objects.create(astronaut_id=2, source="w", metric="heart_rate", value=999, unit="bpm",
                                     timestamp=now + timedelta(hours=3))      # future: ignored
        SensorReading.objects.create(astronaut=None, source="cabin", metric="co2", value=2500, unit="ppm", timestamp=now)
        latest = self.client.get("/api/readings/latest/?astronaut=2").json()
        self.assertEqual(latest["readings"][0]["value"], 90)
        self.assertTrue(latest["readings"][0]["timestamp"].endswith("+03:00"))
        self.assertEqual(self.client.get("/api/cabin/latest/").json()["readings"][0]["metric"], "co2")
        Alert.objects.create(astronaut_id=2, system="cardiovascular", level="yellow", message="x")
        Alert.objects.create(astronaut_id=2, system="cardiovascular", level="red", message="y")
        crew = {a["id"]: a for a in self.client.get("/api/crew/").json()["astronauts"]}
        self.assertEqual(crew[2]["status"], "red")
        self.assertEqual(crew[2]["open_alerts"], 2)
        self.assertEqual(crew[1]["status"], "green")
        hist = self.client.get("/api/readings/history/?astronaut=2&metric=heart_rate&hours=1&limit=2&downsample=false").json()
        self.assertEqual([r["value"] for r in hist["readings"]], [80, 90])     # newest 2, oldest first
        hist = self.client.get("/api/readings/history/?astronaut=2&metric=heart_rate&hours=1&limit=2").json()
        self.assertIn("bucket_seconds", hist)                                   # 3 points > limit -> averaged
        self.assertEqual(sum(r["samples"] for r in hist["readings"]), 3)

    def test_frontend_served(self):
        self.assertEqual(self.client.get("/app/").status_code, 200)
        self.assertEqual(self.client.get("/app/js/api.js").status_code, 200)
        self.assertEqual(self.client.get("/app/../manage.py").status_code, 404)

    def test_simulation_lab_served_separately(self):
        for url in ("/lab/", "/lab/index.html"):
            r = self.client.get(url)
            self.assertEqual(r.status_code, 200, url)
            body = b"".join(r.streaming_content)
            self.assertIn(b"ASTRA Simulation Lab", body)
            self.assertIn(b"not part of the crew system", body)
        self.assertEqual(self.client.get("/lab/lab.js").status_code, 200)
        r = self.client.get("/lab")
        self.assertEqual((r.status_code, r["Location"]), (302, "/lab/"))
        self.assertEqual(self.client.get("/lab/../manage.py").status_code, 404)
        # the old crew-app URL now points to the lab; the crew app has no Scenario Control page
        r = self.client.get("/app/scenarios.html")
        self.assertEqual((r.status_code, r["Location"]), (302, "/lab/"))
        common = b"".join(self.client.get("/app/js/common.js").streaming_content)
        self.assertNotIn(b"scenarios.html", common)
        self.assertIn(b"Science / Sources", common)

"""Tests for the NASA data integration: DONKI space weather (health/donki.py) and the OSDR
reference bands (health/data/nasa_reference.json, health/nasa.py)."""
import random
import sys
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from . import donki, nasa
from .models import Alert, SensorReading, SpaceWeatherEvent
from .sensor_rules import RULES, match_reading

sys.path.insert(0, str(Path(settings.BASE_DIR) / "device_simulator"))
import scenarios  # noqa: E402

# Real DONKI records (trimmed) used as fixtures.
X_FLARE = {"flrID": "2026-07-04T20:29:00-FLR-001", "beginTime": "2026-07-04T20:29Z", "peakTime": "2026-07-04T20:44Z",
           "classType": "X1.3", "sourceLocation": "N10E20", "activeRegionNum": 14123,
           "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/47331/-1", "linkedEvents": None}
M_FLARE = {"flrID": "2026-11-11T21:06:00-FLR-001", "beginTime": "2026-11-11T21:06Z", "classType": "M1.7",
           "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/49504/-1"}
C_FLARE = {"flrID": "2026-11-10T01:00:00-FLR-001", "beginTime": "2026-11-10T01:00Z", "classType": "C5.2"}
SEP = {"sepID": "2026-09-05T16:30:00-SEP-001", "eventTime": "2026-09-05T16:30Z",
       "instruments": [{"displayName": "GOES-18: SEISS >10 MeV"}],
       "linkedEvents": [{"activityID": "2026-09-05T15:04:00-FLR-001"}],
       "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/48554/-1"}
GST = {"gstID": "2026-11-01T03:00:00-GST-001", "startTime": "2026-11-01T03:00Z",
       "allKpIndex": [{"kpIndex": 5.67}, {"kpIndex": 6.33}]}
CME = {"activityID": "2026-11-02T10:00:00-CME-001", "startTime": "2026-11-02T10:00Z",
       "cmeAnalyses": [{"isMostAccurate": True, "speed": 1450.0}]}


class DonkiMappingTests(SimpleTestCase):
    def test_classification(self):
        self.assertEqual(donki.normalize("SEP", SEP)["level"], "critical")
        self.assertIn("storm shelter", donki.normalize("SEP", SEP)["impact"])
        x = donki.normalize("FLR", X_FLARE)
        self.assertEqual((x["level"], x["label"], x["id"]), ("critical", "X1.3 solar flare", X_FLARE["flrID"]))
        self.assertEqual(donki.normalize("FLR", M_FLARE)["level"], "caution")
        self.assertEqual(donki.normalize("FLR", C_FLARE)["level"], "info")
        g = donki.normalize("GST", GST)
        self.assertEqual((g["level"], g["kp"]), ("info", 6.33))
        self.assertEqual(donki.normalize("CME", CME)["level"], "caution")

    def test_state_windows(self):
        sep = donki.normalize("SEP", SEP)
        t = datetime(2026, 9, 5, 16, 30, tzinfo=dt_timezone.utc)
        self.assertEqual(donki.state([sep], t + timedelta(hours=10))["level"], "critical")
        self.assertIn(SEP["sepID"], donki.state([sep], t + timedelta(hours=10))["reason"])
        self.assertEqual(donki.state([sep], t + timedelta(hours=49))["level"], "quiet")
        self.assertEqual(donki.state([sep], t - timedelta(hours=1))["level"], "quiet")      # not yet happened
        m = donki.normalize("FLR", M_FLARE)
        tm = datetime(2026, 11, 11, 21, 6, tzinfo=dt_timezone.utc)
        self.assertEqual(donki.state([m], tm + timedelta(hours=2))["level"], "caution")
        self.assertEqual(donki.state([m], tm + timedelta(hours=7))["level"], "quiet")
        # critical beats caution
        self.assertEqual(donki.state([m, donki.normalize("FLR", dict(X_FLARE, beginTime="2026-11-11T20:00Z"))],
                                     tm + timedelta(hours=1))["event"]["type"], "FLR")
        self.assertEqual(donki.state([m, donki.normalize("FLR", dict(X_FLARE, beginTime="2026-11-11T20:00Z"))],
                                     tm + timedelta(hours=1))["level"], "critical")

    def test_fetch_chunks_to_60_days_and_falls_back(self):
        calls = []

        def fake_get(url, timeout=60):
            calls.append(url)
            if "api.nasa.gov" in url:
                raise OSError("404")
            return [SEP]
        with mock.patch.object(donki, "_get", fake_get), mock.patch.object(donki.time, "sleep"):
            events, hosts = donki.fetch_type("SEP", datetime(2026, 1, 1).date(), datetime(2026, 4, 30).date(), log=lambda m: None)
        ok = [c for c in calls if "api.nasa.gov" not in c]
        self.assertEqual(len(ok), 2)                         # 120 days -> two <=60-day chunks
        self.assertTrue(all("DEMO_KEY" in c for c in calls if "api.nasa.gov" in c))
        self.assertEqual(hosts, ["https://ccmc.gsfc.nasa.gov"])
        self.assertEqual(len(events), 2)

    def test_space_weather_scenario(self):
        ev = {"id": SEP["sepID"], "type": "SEP", "time": SEP["eventTime"], "label": "SEP", "level": "critical"}
        cfg, errors = scenarios.validate({"preset": "space_weather", "event": ev}, [1, 2, 3, 4])
        self.assertEqual(errors, [])
        res = scenarios.resolve(cfg, [1, 2, 3, 4])
        self.assertEqual({v["level"] for v in res["astronauts"].values()}, {"critical"})
        self.assertEqual(res["cabin"], {"level": "critical", "system": "radiation"})
        self.assertEqual(res["space_weather"]["id"], SEP["sepID"])
        _, errors = scenarios.validate({"preset": "space_weather"}, [1, 2, 3, 4])
        self.assertTrue(errors)

    def test_live_space_weather_only_changes_realistic(self):
        sw = {"level": "caution", "id": "x", "type": "FLR"}
        nominal = scenarios.resolve({"preset": "nominal"}, [1, 2])
        self.assertIs(scenarios.apply_space_weather(nominal, sw), nominal)
        real = scenarios.apply_space_weather(scenarios.resolve({"preset": "realistic"}, [1, 2]), sw)
        self.assertEqual(real["astronauts"]["1"], {"level": "caution", "system": "radiation"})
        self.assertEqual(real["space_weather"]["id"], "x")

    def test_snapshot_is_real_and_labelled(self):
        snap = donki.load_snapshot()
        self.assertTrue(snap["fetched_at"])
        self.assertIn("Cached snapshot", snap["note"])
        self.assertGreater(len(snap["events"]), 50)
        for e in snap["events"]:
            self.assertRegex(e["id"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-(FLR|SEP|CME|GST)-\d{3}$")
            self.assertIn(e["level"], ("critical", "caution", "info"))
            self.assertTrue(e["link"].startswith("https://"), e)


class DonkiDatabaseTests(TestCase):
    def setUp(self):
        call_command("seed_crew", stdout=open("/dev/null", "w"))

    def test_fetch_command_falls_back_to_snapshot(self):
        with mock.patch.object(donki, "_get", side_effect=OSError("offline")), mock.patch.object(donki.time, "sleep"):
            call_command("fetch_donki", "--days", "5", stdout=open("/dev/null", "w"), stderr=open("/dev/null", "w"))
        self.assertTrue(SpaceWeatherEvent.objects.exists())
        self.assertEqual(set(SpaceWeatherEvent.objects.values_list("source", flat=True)), {"snapshot"})

    def test_fetch_command_saves_live_and_raises_cabin_alert(self):
        recent = (timezone.now() - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%MZ")
        sep = dict(SEP, sepID=recent[:16] + ":00-SEP-001", eventTime=recent)

        def fake_get(url, timeout=60):
            return [sep] if "/SEP" in url else []
        with mock.patch.object(donki, "_get", fake_get):
            call_command("fetch_donki", "--days", "2", stdout=open("/dev/null", "w"))
        self.assertEqual(SpaceWeatherEvent.objects.get().source, "live")
        alert = Alert.objects.get(astronaut=None, system="radiation")
        self.assertEqual(alert.level, "red")
        self.assertIn("storm shelter", alert.recommendation)
        self.assertIn(sep["sepID"], alert.recommendation)
        body = self.client.get("/api/space-weather/").json()
        self.assertEqual(body["state"]["level"], "critical")
        self.assertEqual(body["source"], "live")
        # realistic scenario now raises everyone's radiation, and the simulator sees why
        sc = self.client.get("/api/sim/scenario/").json()
        self.assertEqual(sc["resolved"]["space_weather"]["id"], sep["sepID"])

    def test_replay_cites_event_in_radiation_alerts(self):
        token = self.client.post("/api/auth/login/", {"username": "surgeon", "password": "astra2026"},
                                 content_type="application/json").json()["token"]
        h = {"HTTP_AUTHORIZATION": f"Token {token}"}
        r = self.client.post("/api/sim/scenario/", {"preset": "space_weather", "event_id": "made-up"},
                             content_type="application/json", **h)
        self.assertEqual(r.status_code, 400)
        sw = self.client.get("/api/space-weather/").json()
        ev = next(e for e in sw["replay"] if e["type"] == "SEP")
        r = self.client.post("/api/sim/scenario/", {"preset": "space_weather", "event_id": ev["id"],
                                                     "reset": True, "apply_now": True},
                             content_type="application/json", **h)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.client.get("/api/space-weather/").json()["active_replay"]["id"], ev["id"])
        alerts = Alert.objects.filter(resolved=False, system="radiation")
        self.assertEqual(alerts.filter(level="red").count(), 5)          # 4 crew + cabin
        for a in alerts:
            self.assertIn(ev["id"], a.recommendation)
            self.assertIn("storm shelter", a.recommendation)


class NasaReferenceTests(SimpleTestCase):
    def setUp(self):
        self.ref = nasa.reference()

    def test_provenance(self):
        for sid in ("OSD-575", "OSD-656", "OSD-53"):
            st = self.ref["studies"][sid]
            self.assertTrue(st["title"])
            self.assertTrue(st["url"].startswith("https://osdr.nasa.gov/"))
            self.assertTrue(all(f["url"].startswith("https://") for f in st["files"]))
        self.assertTrue(self.ref["generated_at"])

    def test_bands_follow_the_real_flight_shift(self):
        mons = nasa.monitoring()
        self.assertGreaterEqual(len(mons), 10)
        for m in mons.values():
            mu, d = m["preflight_mean"], m["flight_shift"]
            tol = 1e-3 * max(1, abs(mu))          # values are rounded to 4-5 significant digits
            self.assertAlmostEqual(m["yellow_at"], mu + d, delta=tol)
            self.assertAlmostEqual(m["red_at"], mu + 2 * d, delta=tol)
            lo, hi = m["green"]
            self.assertTrue(lo <= mu <= hi)
            self.assertIn(m["study"], ("OSD-575", "OSD-656"))
            self.assertEqual(m["direction"], "up" if d > 0 else "down")
        # spot-check against the source data (Inspiration4 IL-6, Eve panel, pg/mL)
        il6 = mons["il6"]
        self.assertEqual(il6["crew"], "4/4")
        self.assertAlmostEqual(il6["preflight_mean"], 3.703, places=2)

    def test_rules_built_from_reference(self):
        il6 = nasa.monitoring()["il6"]
        self.assertIn("il6", RULES)
        r = lambda v: match_reading(SensorReading(metric="il6", value=v, unit="pg/mL"))
        self.assertIsNone(r(il6["preflight_mean"]))
        self.assertEqual(r(il6["yellow_at"] + 0.01).level, "yellow")
        self.assertEqual(r(il6["red_at"] + 0.01).level, "red")
        self.assertIn("OSD-575", r(il6["red_at"] + 0.01).recommendation)
        ca = nasa.monitoring()["serum_calcium"]          # a marker that falls after flight
        self.assertEqual(ca["direction"], "down")
        self.assertEqual(match_reading(SensorReading(metric="serum_calcium", value=ca["yellow_at"] - 0.01, unit="mg/dL")).level, "yellow")

    def test_simulated_labs_stay_in_band_and_immune_shift_is_real(self):
        rng = random.Random(7)
        lvl = lambda m, v: (match_reading(SensorReading(metric=m, value=v, unit="")) or mock.Mock(level="green")).level
        for _ in range(200):
            for m, v in scenarios.nominal_labs(rng).items():
                self.assertEqual(lvl(m, v), "green", (m, v))
        for _ in range(50):
            for m, v in scenarios.shifted_labs("caution", rng).items():
                self.assertEqual(lvl(m, v), "yellow", (m, v))
            for m, v in scenarios.shifted_labs("critical", rng).items():
                self.assertEqual(lvl(m, v), "red", (m, v))

    def test_osd53_genes(self):
        genes = self.ref["shifted"]["OSD-53"]
        self.assertTrue(genes)
        for g in genes:
            self.assertLess(g["p_value"], 0.05)
        self.assertIn("HSP90", {g["marker"] for g in genes})

"""Tests for the simulation scenarios (device_simulator/scenarios.py) and /api/sim/ endpoints."""
import json
import random
import sys
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from .models import Alert, SensorReading, SimScenario
from .sensor_rules import match_reading

sys.path.insert(0, str(Path(settings.BASE_DIR) / "device_simulator"))
import generators  # noqa: E402
import scenarios  # noqa: E402
import simulator  # noqa: E402

CREW_IDS = [a["id"] for a in generators.CREW]
RANK = {None: 0, "yellow": 1, "red": 2}
COLOUR = {0: "green", 1: "yellow", 2: "red"}


def batch_levels(batch):
    """{astronaut_id or None: worst level} after running the real sensor rules on a batch."""
    out = {}
    for item in batch:
        value = item["value"]
        numeric = isinstance(value, (int, float))
        r = SensorReading(metric=item["metric"], unit=item["unit"],
                          value=value if numeric else None, text_value="" if numeric else value)
        hit = match_reading(r)
        key = item["astronaut_id"]
        out[key] = max(out.get(key, 0), RANK[hit.level if hit else None])
    return {k: COLOUR[v] for k, v in out.items()}


class ScenarioGenerationTests(SimpleTestCase):
    def run_preset(self, cfg, n=150, daily=True):
        resolved = scenarios.resolve(cfg, CREW_IDS)
        rng = random.Random(42)
        ts = datetime.now(dt_timezone.utc)
        return resolved, [batch_levels(scenarios.generate_batch(resolved, generators.CREW, ts, daily, rng)) for _ in range(n)]

    def test_nominal_never_crosses_a_threshold(self):
        _, runs = self.run_preset({"preset": "nominal"}, n=400)
        for levels in runs:
            self.assertEqual(set(levels.values()), {"green"}, levels)

    def test_fixed_presets_match_expected_status_every_tick(self):
        for preset in ["one_caution", "one_critical", "mixed", "several_caution", "all_critical", "radiation_storm"]:
            for system in scenarios.SYSTEMS:
                resolved, runs = self.run_preset({"preset": preset, "target": 2, "system": system}, n=40)
                expected = scenarios.expected_status(resolved)
                for levels in runs:
                    got = {k: v for k, v in levels.items() if k is not None}
                    self.assertEqual(got, expected, f"{preset}/{system}")

    def test_one_critical_is_exactly_one_red(self):
        resolved, runs = self.run_preset({"preset": "one_critical", "target": 3})
        for levels in runs:
            self.assertEqual([k for k, v in levels.items() if v == "red"], [3])
            self.assertEqual(levels[None], "green")      # cabin fine

    def test_every_system_and_level_reaches_its_colour(self):
        for system in scenarios.SYSTEMS:
            for level, colour in [("caution", "yellow"), ("critical", "red")]:
                _, runs = self.run_preset({"preset": "custom", "custom": {"1": {"level": level, "system": system}}}, n=60, daily=False)
                for levels in runs:
                    self.assertEqual(levels[1], colour, f"{system}/{level}")
                    self.assertEqual({levels[i] for i in (2, 3, 4)}, {"green"})
        for system in scenarios.CABIN_SYSTEMS:
            for level, colour in [("caution", "yellow"), ("critical", "red")]:
                _, runs = self.run_preset({"preset": "custom", "cabin": {"level": level, "system": system}}, n=60)
                for levels in runs:
                    self.assertEqual(levels[None], colour, f"cabin {system}/{level}")
                    self.assertEqual({levels[i] for i in CREW_IDS}, {"green"})

    def test_cabin_co2_keeps_crew_green(self):
        _, runs = self.run_preset({"preset": "cabin_co2"})
        for levels in runs:
            self.assertEqual(levels[None], "red")
            self.assertEqual({levels[i] for i in CREW_IDS}, {"green"})

    def test_realistic_is_mostly_nominal(self):
        _, runs = self.run_preset({"preset": "realistic", "anomaly_rate": 0.002}, n=2000, daily=False)
        noisy = sum(1 for levels in runs if set(levels.values()) != {"green"})
        self.assertLess(noisy / len(runs), 0.03)
        self.assertGreater(noisy, 0)             # but it does blip now and then

    def test_validate(self):
        cfg, errors = scenarios.validate({"preset": "custom", "custom": {"1": {"level": "critical", "system": "immune"}}}, CREW_IDS)
        self.assertEqual(errors, [])
        self.assertEqual(cfg["custom"]["1"], {"level": "critical", "system": "immune"})
        for bad in [{"preset": "x"}, {"preset": "one_critical", "target": 99}, {"preset": "one_caution", "system": "x"},
                    {"preset": "custom", "custom": {"1": {"level": "panic"}}}, {"preset": "custom", "cabin": {"system": "x"}},
                    {"preset": "realistic", "anomaly_rate": 5}]:
            self.assertTrue(scenarios.validate(bad, CREW_IDS)[1], bad)

    def test_simulator_scenario_url(self):
        self.assertEqual(simulator.scenario_url_for("http://h:8000/api/webhook/readings/"), "http://h:8000/api/sim/scenario/")


@override_settings(ALERT_DEDUP_MINUTES=5, ALERT_CLEAR_AFTER_SECONDS=120, ALERT_AUTO_RESOLVE_MINUTES=30)
class SimEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_crew", stdout=open("/dev/null", "w"))

    def token(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": "astra2026"}, content_type="application/json")
        return r.json()["token"]

    def post(self, url, data=None, user="surgeon"):
        headers = {"HTTP_AUTHORIZATION": f"Token {self.token(user)}"} if user else {}
        return self.client.post(url, json.dumps(data or {}), content_type="application/json", **headers)

    def statuses(self):
        return {a["id"]: a["status"] for a in self.client.get("/api/crew/").json()["astronauts"]}

    def apply(self, ticks=3, **cfg):
        r = self.post("/api/sim/scenario/", {**cfg, "reset": True, "apply_now": True})
        self.assertEqual(r.status_code, 200, r.content)
        for _ in range(ticks - 1):
            self.assertEqual(self.post("/api/sim/tick/").status_code, 201)
        return r.json()

    def test_get_is_public_and_defaults_to_realistic(self):
        body = self.client.get("/api/sim/scenario/").json()
        self.assertEqual(body["preset"], "realistic")
        self.assertEqual(body["resolved"]["mode"], "random")
        self.assertEqual({p["key"] for p in body["presets"]} >= {"nominal", "one_caution", "one_critical", "several_caution",
                                                                  "all_critical", "cabin_co2", "radiation_storm", "realistic", "custom"}, True)
        self.assertEqual(set(body["resolved"]["astronauts"]), {"1", "2", "3", "4"})

    def test_write_needs_surgeon(self):
        self.assertEqual(self.post("/api/sim/scenario/", {"preset": "nominal"}, user=None).status_code, 401)
        self.assertEqual(self.post("/api/sim/scenario/", {"preset": "nominal"}, user="sara").status_code, 403)
        self.assertEqual(self.post("/api/sim/reset/", user="sara").status_code, 403)
        self.assertEqual(self.post("/api/sim/tick/", user=None).status_code, 401)
        self.assertEqual(self.post("/api/sim/scenario/", {"preset": "nope"}).status_code, 400)
        self.assertEqual(SimScenario.objects.filter(version__gt=0).count(), 0)

    def test_nominal_produces_no_alerts(self):
        body = self.apply(ticks=5, preset="nominal")
        self.assertEqual(body["batch"]["alerts"], [])
        self.assertEqual(Alert.objects.filter(resolved=False).count(), 0)
        self.assertEqual(set(self.statuses().values()), {"green"})

    def test_one_critical_gives_exactly_one_red(self):
        body = self.apply(preset="one_critical", target=2, system="cardiovascular")
        self.assertEqual(body["scenario"]["version"], 1)
        self.assertEqual(body["scenario"]["updated_by"], "surgeon")
        self.assertEqual(self.statuses(), {1: "green", 2: "red", 3: "green", 4: "green"})
        self.assertEqual(self.client.get("/api/sim/scenario/").json()["preset"], "one_critical")

    def test_presets_end_to_end(self):
        cases = {
            "one_caution": {1: "green", 2: "yellow", 3: "green", 4: "green"},
            "several_caution": {1: "yellow", 2: "green", 3: "yellow", 4: "yellow"},
            "mixed": {1: "green", 2: "red", 3: "yellow", 4: "green"},
            "all_critical": {1: "red", 2: "red", 3: "red", 4: "red"},
            "cabin_co2": {1: "green", 2: "green", 3: "green", 4: "green"},
            "radiation_storm": {1: "red", 2: "red", 3: "red", 4: "red"},
        }
        for preset, expected in cases.items():
            self.apply(preset=preset, target=2)
            self.assertEqual(self.statuses(), expected, preset)
        # the last one: every open crew alert is radiation, plus a cabin radiation alert
        open_ = Alert.objects.filter(resolved=False)
        self.assertEqual(set(open_.values_list("system", flat=True)), {"radiation"})
        self.assertTrue(open_.filter(astronaut__isnull=True).exists())

    def test_cabin_co2_raises_cabin_alert_only(self):
        self.apply(preset="cabin_co2")
        open_ = Alert.objects.filter(resolved=False)
        self.assertTrue(open_.exists())
        self.assertFalse(open_.filter(astronaut__isnull=False).exists())
        self.assertIn("CO2", open_.first().message)

    def test_custom(self):
        self.apply(preset="custom", custom={"1": {"level": "caution", "system": "immune"},
                                            "4": {"level": "critical", "system": "respiratory"}},
                   cabin={"level": "caution", "system": "noise"})
        self.assertEqual(self.statuses(), {1: "yellow", 2: "green", 3: "green", 4: "red"})
        self.assertTrue(Alert.objects.filter(resolved=False, astronaut__isnull=True, level="yellow").exists())

    def test_reset_resolves_everything(self):
        self.apply(preset="all_critical")
        n = Alert.objects.filter(resolved=False).count()
        self.assertGreater(n, 0)
        r = self.post("/api/sim/reset/")
        self.assertEqual(r.json()["resolved"], n)
        self.assertEqual(set(self.statuses().values()), {"green"})
        listed = self.client.get("/api/alerts/?limit=1").json()["alerts"][0]
        self.assertEqual(listed["resolved_by"], "surgeon")

    def test_switching_back_recovers_without_reset(self):
        self.apply(preset="one_critical", target=2)
        Alert.objects.update(created_at=timezone.now() - timedelta(minutes=3))   # older than CLEAR_AFTER
        self.post("/api/sim/scenario/", {"preset": "one_caution", "target": 2, "apply_now": True})
        self.assertEqual(self.statuses()[2], "yellow")       # red cleared, yellow raised
        Alert.objects.update(created_at=timezone.now() - timedelta(minutes=3))
        self.post("/api/sim/scenario/", {"preset": "nominal", "apply_now": True})
        self.assertEqual(set(self.statuses().values()), {"green"})

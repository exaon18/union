import base64
import io
import json
import os
from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self, size=-1):
        return self.body[:size]


class GeminiVoiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_crew", stdout=io.StringIO())

    def setUp(self):
        cache.clear()
        response_body = {
            "steps": [{
                "type": "model_output",
                "content": [{"type": "audio", "data": base64.b64encode(b"RIFFtest-wave").decode("ascii")}],
            }],
        }
        self.response = FakeResponse(json.dumps(response_body).encode("utf-8"))
        login = self.client.post(
            "/api/auth/login/",
            {"username": "sara", "password": "astra2026"},
            content_type="application/json",
        )
        self.token = login.json()["token"]

    def post_voice(self, astronaut_id=2):
        return self.client.post(
            "/api/voice-alert/",
            json.dumps({"astronaut_id": astronaut_id}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {self.token}",
        )

    def test_requires_login(self):
        response = self.client.post(
            "/api/voice-alert/",
            json.dumps({"astronaut_id": 2}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_generates_and_caches_named_warning_audio(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("health.voice.urlopen", return_value=self.response) as send:
                response = self.post_voice()
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Content-Type"], "audio/wav")
                self.assertEqual(response.content, b"RIFFtest-wave")

                payload = json.loads(send.call_args.args[0].data.decode("utf-8"))
                text = payload["input"][0]["content"][0]["text"]
                self.assertEqual(text, "Sara is warning")

                cached = self.post_voice()
                self.assertEqual(cached.status_code, 200)
                self.assertEqual(cached.content, response.content)
                send.assert_called_once()

    def test_missing_key_returns_configuration_error(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            response = self.post_voice()
        self.assertEqual(response.status_code, 503)
        self.assertIn("not configured", response.json()["error"])

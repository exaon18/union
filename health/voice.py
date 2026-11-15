import base64
import binascii
import hashlib
import json
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_POST

from .auth import json_body, token_required
from .models import Astronaut

logger = logging.getLogger(__name__)

GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
GEMINI_TTS_MODEL = "gemini-3.8-flash-tts"
GEMINI_TTS_VOICE = "Kore"
CACHE_SECONDS = 24 * 60 * 60
MAX_RESPONSE_BYTES = 5 * 1024 * 1024


@require_POST
@token_required()
def warning_audio(request):
    data, error = json_body(request)
    if error:
        return error

    astronaut_id = data.get("astronaut_id")
    if isinstance(astronaut_id, bool):
        return JsonResponse({"error": "astronaut_id must be an integer"}, status=400)
    try:
        astronaut_id = int(astronaut_id)
    except (TypeError, ValueError):
        return JsonResponse({"error": "astronaut_id must be an integer"}, status=400)

    try:
        astronaut = Astronaut.objects.select_related("user").get(pk=astronaut_id)
    except Astronaut.DoesNotExist:
        return JsonResponse({"error": "unknown astronaut"}, status=404)

    raw_name = (astronaut.user.first_name or astronaut.user.username).strip().split()[0]
    name = "".join(char for char in raw_name if char.isalpha() or char in "-'") or "Crew"
    name_hash = hashlib.sha256(name.casefold().encode("utf-8")).hexdigest()[:16]
    cache_key = f"gemini-warning-audio-v1:{astronaut.pk}:{name_hash}"
    audio = cache.get(cache_key)
    if audio is not None:
        return HttpResponse(audio, content_type="audio/wav")

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return JsonResponse({"error": "Gemini voice is not configured on the server"}, status=503)

    payload = {
        "model": GEMINI_TTS_MODEL,
        "input": [{
            "type": "user_input",
            "content": [{
                "type": "text",
                "text": f"{name} is warning",
                "annotations": [{
                    "type": "speech_metadata",
                    "style": "clear, calm, urgent",
                }],
            }],
        }],
        "response_format": {"type": "audio"},
        "generation_config": {"speech_config": [{"voice": GEMINI_TTS_VOICE}]},
    }
    upstream_request = Request(
        GEMINI_TTS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urlopen(upstream_request, timeout=30) as response:
            response_body = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        logger.warning("Gemini TTS returned HTTP %s", exc.code)
        return JsonResponse({"error": "Gemini voice generation failed"}, status=502)
    except (URLError, TimeoutError, OSError) as exc:
        logger.warning("Gemini TTS request failed: %s", type(exc).__name__)
        return JsonResponse({"error": "Gemini voice service is unavailable"}, status=502)

    if len(response_body) > MAX_RESPONSE_BYTES:
        return JsonResponse({"error": "Gemini voice response was too large"}, status=502)
    try:
        result = json.loads(response_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Gemini returned an invalid voice response"}, status=502)

    audio_data = None
    steps = result.get("steps", []) if isinstance(result, dict) else []
    if not isinstance(steps, list):
        steps = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        for part in step.get("content", []):
            if isinstance(part, dict) and part.get("type") == "audio" and part.get("data"):
                audio_data = part["data"]
    if not audio_data:
        return JsonResponse({"error": "Gemini returned no audio"}, status=502)

    try:
        audio = base64.b64decode(audio_data, validate=True)
    except (binascii.Error, ValueError):
        return JsonResponse({"error": "Gemini returned invalid audio"}, status=502)
    if not audio.startswith(b"RIFF"):
        return JsonResponse({"error": "Gemini returned an unsupported audio format"}, status=502)

    cache.set(cache_key, audio, CACHE_SECONDS)
    return HttpResponse(audio, content_type="audio/wav")

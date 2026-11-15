"""
Serve the static frontend (../frontend/) from Django at /app/, so one URL
(e.g. http://2.24.53.231:8000/app/) gives both the dashboard and the API.
When served from here, frontend/js/api.js talks to the same-origin /api.
The Simulation Lab (../lab/, a testing tool, not part of the crew system) is served at /lab/;
it loads the shared CSS/JS from /app/.
Works with DEBUG=False (no whitenoise/nginx needed for a hackathon demo).
"""
import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.views.decorators.http import require_GET

FRONTEND_DIR = (Path(settings.BASE_DIR) / "frontend").resolve()
LAB_DIR = (Path(settings.BASE_DIR) / "lab").resolve()     # Simulation Lab (testing tool) at /lab/

# ES modules (three.js) need a JavaScript MIME type; some servers' mime tables lack woff2.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("font/woff2", ".woff2")


def _serve(root, path):
    if path == "" or path.endswith("/"):
        path += "index.html"
    target = (root / path).resolve()
    # block path traversal (../) and hidden files
    if root not in target.parents or any(p.startswith(".") for p in Path(path).parts):
        raise Http404("not found")
    if not target.is_file():
        raise Http404("not found")
    content_type, _ = mimetypes.guess_type(str(target))
    response = FileResponse(open(target, "rb"), content_type=content_type or "application/octet-stream")
    if path.startswith(("vendor/", "img/")):
        response["Cache-Control"] = "public, max-age=86400"   # three.js, fonts, Earth textures never change
    else:
        response["Cache-Control"] = "no-cache"   # demo: always pick up the latest deploy
    return response


@require_GET
def serve_frontend(request, path=""):
    if not request.path.startswith("/app/"):
        return HttpResponseRedirect("/app/")
    if path == "scenarios.html":            # Scenario Control moved to the Simulation Lab
        return HttpResponseRedirect("/lab/")
    return _serve(FRONTEND_DIR, path)


@require_GET
def serve_lab(request, path=""):
    if not request.path.startswith("/lab/"):
        return HttpResponseRedirect("/lab/")
    return _serve(LAB_DIR, path)

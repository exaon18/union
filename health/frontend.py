"""
Serve the static frontend (../frontend/) from Django at /app/, so one URL
(e.g. http://2.24.53.231:8000/app/) gives both the dashboard and the API.
When served from here, frontend/js/api.js talks to the same-origin /api.
Works with DEBUG=False (no whitenoise/nginx needed for a hackathon demo).
"""
import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.views.decorators.http import require_GET

FRONTEND_DIR = (Path(settings.BASE_DIR) / "frontend").resolve()


@require_GET
def serve_frontend(request, path=""):
    if not request.path.startswith("/app/"):
        return HttpResponseRedirect("/app/")
    if path == "" or path.endswith("/"):
        path += "index.html"
    target = (FRONTEND_DIR / path).resolve()
    # block path traversal (../) and hidden files
    if FRONTEND_DIR not in target.parents or any(p.startswith(".") for p in Path(path).parts):
        raise Http404("not found")
    if not target.is_file():
        raise Http404("not found")
    content_type, _ = mimetypes.guess_type(str(target))
    response = FileResponse(open(target, "rb"), content_type=content_type or "application/octet-stream")
    response["Cache-Control"] = "no-cache"   # demo: always pick up the latest deploy
    return response

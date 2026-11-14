"""
Token auth for the static frontend (works across origins, no cookies/CSRF needed).

  POST /api/auth/login/   {"username": "sara", "password": "astra2026"}
       -> {"token": "<key>", "user": {...}}
  then send   Authorization: Token <key>   on write requests.
"""
import json
from datetime import timedelta
from functools import wraps

from django.conf import settings
from django.contrib.auth import authenticate
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import Astronaut, AuthToken

SURGEON_TITLE = "Flight Surgeon"


def user_role(user):
    """'astronaut' if linked to an Astronaut, 'surgeon' for staff / role=surgeon, else 'member'."""
    if Astronaut.objects.filter(user=user).exists():
        return "astronaut"
    if user.is_staff or getattr(user, "role", "") == "surgeon":
        return "surgeon"
    return "member"


def user_json(user):
    astronaut = Astronaut.objects.filter(user=user).only("id").first()
    role = "astronaut" if astronaut else user_role(user)
    return {
        "id": user.id,
        "username": user.username,
        "name": user.get_full_name() or user.username,
        "role": role,
        "title": SURGEON_TITLE if role == "surgeon" else None,
        "astronaut_id": astronaut.id if astronaut else None,
    }


def _token_ttl():
    return timedelta(hours=getattr(settings, "API_TOKEN_TTL_HOURS", 72))


def user_from_request(request):
    """Return (user, token) from 'Authorization: Token <key>' (or 'Bearer <key>'), else (None, None)."""
    header = request.headers.get("Authorization", "")
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() not in ("token", "bearer"):
        return None, None
    token = (
        AuthToken.objects.select_related("user")
        .filter(key_hash=AuthToken.hash_key(parts[1]))
        .first()
    )
    if token is None or not token.user.is_active:
        return None, None
    now = timezone.now()
    if token.created_at < now - _token_ttl():
        token.delete()
        return None, None
    # Avoid a write on every request: refresh last_used_at at most once a minute.
    if token.last_used_at is None or token.last_used_at < now - timedelta(minutes=1):
        AuthToken.objects.filter(pk=token.pk).update(last_used_at=now)
    return token.user, token


def json_body(request):
    """Parse a JSON object body. Returns (dict, error_response)."""
    if not request.body:
        return {}, None
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse({"error": "invalid JSON"}, status=400)
    if not isinstance(data, dict):
        return None, JsonResponse({"error": "body must be a JSON object"}, status=400)
    return data, None


def token_required(roles=None):
    """
    Decorator for write endpoints. Sets request.api_user, request.api_role and
    request.api_astronaut (Astronaut or None). 401 if not logged in, 403 if the role is not allowed.
    """
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            user, token = user_from_request(request)
            if user is None:
                return JsonResponse({"error": "login required (Authorization: Token <key>)"}, status=401)
            astronaut = Astronaut.objects.select_related("user").filter(user=user).first()
            role = "astronaut" if astronaut else user_role(user)
            if roles and role not in roles:
                return JsonResponse({"error": f"forbidden for role {role}"}, status=403)
            request.api_user, request.api_token = user, token
            request.api_role, request.api_astronaut = role, astronaut
            return view(request, *args, **kwargs)
        return csrf_exempt(wrapper)
    return decorator


@csrf_exempt
@require_POST
def login_view(request):
    data, err = json_body(request)
    if err:
        return err
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    if not username or not password:
        return JsonResponse({"error": "username and password are required"}, status=400)
    user = authenticate(request, username=username, password=password)
    if user is None:
        user = authenticate(request, username=username.lower(), password=password)
    if user is None or not user.is_active:
        return JsonResponse({"error": "wrong username or password"}, status=401)
    # Housekeeping: drop this user's expired tokens.
    AuthToken.objects.filter(user=user, created_at__lt=timezone.now() - _token_ttl()).delete()
    token, key = AuthToken.issue(user)
    return JsonResponse({
        "token": key,
        "expires_at": timezone.localtime(token.created_at + _token_ttl()).isoformat(),
        "user": user_json(user),
    })


@require_GET
@token_required()
def me_view(request):
    return JsonResponse({"user": user_json(request.api_user)})


@require_POST
@token_required()
def logout_view(request):
    request.api_token.delete()
    return JsonResponse({"ok": True})

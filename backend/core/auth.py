from __future__ import annotations

import secrets

from fastapi import Request

from config.settings import api_token
from core.exceptions import AuthenticationError


def token_is_valid(candidate: str | None) -> bool:
    expected = api_token()
    return bool(expected and candidate and secrets.compare_digest(expected, candidate))


def require_request_token(request: Request) -> None:
    if not token_is_valid(request.headers.get("x-trainkit-token")):
        raise AuthenticationError("Invalid or missing TrainKit backend token")

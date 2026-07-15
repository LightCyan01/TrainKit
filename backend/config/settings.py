from __future__ import annotations

import os

APP_VERSION = os.getenv("TRAINKIT_VERSION", "development")
API_TOKEN_ENV = "TRAINKIT_BACKEND_TOKEN"
DESKTOP_ORIGIN = os.getenv("TRAINKIT_DESKTOP_ORIGIN", "trainkit://desktop")
MAX_IMAGE_BYTES = int(os.getenv("TRAINKIT_MAX_IMAGE_BYTES", str(128 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("TRAINKIT_MAX_IMAGE_PIXELS", "100000000"))


def api_token() -> str | None:
    return os.getenv(API_TOKEN_ENV)

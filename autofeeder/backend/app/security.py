"""Password hashing, JWT handling and login rate limiting."""
from __future__ import annotations

import hashlib
import threading
import time
import uuid
from collections import defaultdict, deque

import bcrypt
import jwt

from .config import settings

ALGORITHM = "HS256"
BCRYPT_MAX_BYTES = 72


def normalize_password(password: str) -> bytes:
    encoded = password.encode("utf-8")
    if len(encoded) > BCRYPT_MAX_BYTES:
        # Bcrypt silently truncates at 72 bytes; hash a deterministic SHA-256
        # pre-hash instead so long passwords cannot collide at byte 72.
        return hashlib.sha256(encoded).hexdigest().encode("ascii")
    return encoded


def hash_password(password: str) -> str:
    return bcrypt.hashpw(normalize_password(password), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(normalize_password(password), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def password_problem(password: str) -> str | None:
    if len(password) < 10:
        return "Password minimal 10 karakter."
    if len(password.encode("utf-8")) > 256:
        return "Password terlalu panjang."
    if password.lower() in {"password123", "12345678910", "qwertyuiop1"}:
        return "Password terlalu mudah ditebak."
    return None


def create_access_token(user) -> tuple[str, int]:
    now = int(time.time())
    expires_in = settings.access_token_expire_minutes * 60
    payload = {
        "sub": user.email,
        "uid": user.id,
        "role": user.role,
        "ver": user.token_version,
        "iat": now,
        "nbf": now,
        "exp": now + expires_in,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), expires_in


def hash_device_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def generate_device_key() -> str:
    return "fg_" + uuid.uuid4().hex + uuid.uuid4().hex[:16]


def decode_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=[ALGORITHM],
        options={"require": ["sub", "exp", "ver"]},
    )


class LoginRateLimiter:
    """Small in-process limiter for login attempts.

    For multi-worker deployments replace this with a Redis-backed limiter.
    """

    def __init__(self) -> None:
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._locked_until: dict[str, float] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> int | None:
        now = time.time()
        with self._lock:
            locked = self._locked_until.get(key, 0)
            if locked > now:
                return int(locked - now) + 1
            if locked:
                self._locked_until.pop(key, None)
                self._failures.pop(key, None)
            cutoff = now - settings.login_window_seconds
            attempts = self._failures[key]
            while attempts and attempts[0] < cutoff:
                attempts.popleft()
            if len(attempts) >= settings.login_max_attempts:
                self._locked_until[key] = now + settings.login_lockout_seconds
                return settings.login_lockout_seconds
        return None

    def fail(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.time())

    def success(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._locked_until.pop(key, None)


login_limiter = LoginRateLimiter()

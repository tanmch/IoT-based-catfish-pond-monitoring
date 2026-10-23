"""Device API-key helpers.

The presentation build has no user accounts, so password hashing, JWT and
login rate limiting were removed. Device keys are still hashed at rest.
"""
from __future__ import annotations

import hashlib
import uuid


def hash_device_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def generate_device_key() -> str:
    return "fg_" + uuid.uuid4().hex + uuid.uuid4().hex[:16]

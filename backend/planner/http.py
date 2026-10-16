"""One GET helper for the providers: timeout, JSON, and errors that never carry the API key.

Every call is logged as one key=value line (provider, status, ms, cache) without URL or params.
"""

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import requests
from django.core.cache import cache

TIMEOUT_S = 20
CACHE_S = 30 * 60

log = logging.getLogger("planner")


class ProviderError(Exception):
    """A provider call failed. `code` is safe to show the user; the message never contains a key."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Deadline:
    """The moment a plan must be done by, on the monotonic clock."""

    at: float

    @classmethod
    def after(cls, seconds: float) -> "Deadline":
        return cls(time.monotonic() + seconds)

    def remaining(self) -> float:
        return self.at - time.monotonic()

    def timeout(self, cap: float = TIMEOUT_S) -> float:
        """Seconds one call may take: the time left, at most `cap`. Raises when none is left."""
        left = self.remaining()
        if left <= 0:
            raise ProviderError("plan_timeout", "Planning took too long")
        return min(cap, left)


def get_json(provider: str, url: str, params: dict[str, Any], deadline: Deadline | None = None) -> Any:
    timeout = TIMEOUT_S if deadline is None else deadline.timeout(TIMEOUT_S)
    started = time.monotonic()
    status: object = "-"
    try:
        try:
            resp = requests.get(url, params=params, timeout=timeout, allow_redirects=False)
        except requests.RequestException:
            if deadline is not None and deadline.remaining() <= 0:
                raise ProviderError("plan_timeout", "Planning took too long") from None
            # Exception text can include the full URL with the key, so drop it.
            raise ProviderError(f"{provider}_unreachable", f"{provider} did not answer") from None
        status = resp.status_code
        if resp.status_code == 429:
            raise ProviderError(f"{provider}_quota", f"{provider} rate limit or quota reached")
        if resp.status_code >= 400:
            raise ProviderError(f"{provider}_failed", f"{provider} returned HTTP {resp.status_code}")
        try:
            return resp.json()
        except ValueError:
            raise ProviderError(f"{provider}_failed", f"{provider} returned invalid JSON") from None
    finally:
        ms = round((time.monotonic() - started) * 1000)
        log.info("provider_call provider=%s status=%s ms=%d cache=miss", provider, status, ms)


def cached_json(provider: str, url: str, params: dict[str, Any], deadline: Deadline | None = None) -> Any:
    """get_json, remembered for CACHE_S. The key is the request itself minus the API key."""
    shown = {k: v for k, v in params.items() if k != "key"}
    digest = hashlib.sha256(json.dumps([provider, url, shown], sort_keys=True, default=str).encode())
    key = f"{provider}:{digest.hexdigest()}"
    if (hit := cache.get(key)) is not None:
        log.info("provider_call provider=%s status=- ms=0 cache=hit", provider)
        return hit
    body = get_json(provider, url, params, deadline)
    cache.set(key, body, CACHE_S)
    return body

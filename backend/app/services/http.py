"""Shared HTTP + logging helpers for Sleep Drive's AI providers.

Retries
-------
LLM and speech APIs fail transiently (429 / 5xx / dropped connections) far
more often than production monitoring wants. Every outbound call to Groq,
Sarvam or ElevenLabs goes through `request_with_retry` so a single blip does
not fail a conversation turn — while the total time budget stays bounded
(exponential backoff + full jitter, capped at max_attempts).

Logging
-------
Keys live only in backend env config. `Log` prints tag-prefixed lines for
greppability, and every error path must go through `safe_exc` so a raised
exception can never carry a secret into a log or API response.
"""
from __future__ import annotations

import asyncio
import random
import time
from typing import Any

import httpx

RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


class Log:
    """Minimal structured logger. Never passes raw payloads — use safe_exc()."""

    @staticmethod
    def info(tag: str, msg: str) -> None:
        print(f"[{tag}] {msg}", flush=True)

    @staticmethod
    def warn(tag: str, msg: str) -> None:
        print(f"[{tag}] WARN {msg}", flush=True)

    @staticmethod
    def error(tag: str, msg: str) -> None:
        print(f"[{tag}] ERROR {msg}", flush=True)


def safe_exc(exc: BaseException) -> str:
    """A log-safe representation of an exception — type + status only,
    never the message (a message can echo upstream response bodies that
    might contain tokens)."""
    status = getattr(exc, "response", None)
    status = getattr(status, "status_code", None)
    if status:
        return f"{type(exc).__name__} (HTTP {status})"
    return type(exc).__name__


def _redact(values: dict[str, Any]) -> dict[str, Any]:
    """Scrub anything that looks like a credential before it can leak."""
    return {k: ("***" if "key" in k.lower() or "token" in k.lower() else v) for k, v in values.items()}


async def request_with_retry(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    json: dict[str, Any] | None = None,
    data: str | dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
    timeout: float,
    max_attempts: int = 3,
    base_delay: float = 0.35,
    max_delay: float = 2.5,
    tag: str = "http",
) -> httpx.Response:
    """Perform an HTTP request, retrying transient failures with exponential
    backoff + full jitter. Deterministic 4xx errors are returned immediately
    (the caller decides). Raises the last exception when attempts are spent.

    Headers containing keys are never logged: only the tag and status.
    """
    attempt = 0
    last_exc: BaseException | None = None
    while attempt < max_attempts:
        attempt += 1
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, headers=headers, json=json, data=data, files=files)
            if resp.status_code in RETRYABLE_STATUS and attempt < max_attempts:
                delay = _backoff(base_delay, max_delay, attempt)
                Log.warn(tag, f"retryable {resp.status_code} on attempt {attempt}/{max_attempts} — retrying in {delay:.2f}s")
                await asyncio.sleep(delay)
                continue
            return resp
        except (httpx.TimeoutException, httpx.NetworkError, httpx.ConnectError, httpx.ReadError) as exc:
            last_exc = exc
            if attempt < max_attempts:
                delay = _backoff(base_delay, max_delay, attempt)
                Log.warn(tag, f"transient {type(exc).__name__} on attempt {attempt}/{max_attempts} — retrying in {delay:.2f}s")
                await asyncio.sleep(delay)
                continue
            raise
        except httpx.HTTPStatusError as exc:
            # Caller should normally use the returned response + raise_for_status();
            # if one escapes here it is deterministic — surface it.
            last_exc = exc
            break
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("unreachable — request_with_retry exhausted attempts")


def _backoff(base_delay: float, max_delay: float, attempt: int) -> float:
    delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
    return delay * (0.5 + random.random())  # full jitter

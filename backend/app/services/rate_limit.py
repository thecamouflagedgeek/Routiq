"""In-memory sliding-window rate limiter for AI-facing endpoints.

Protects the Groq / Sarvam API budget from misbehaving or looped clients.
Each client IP gets `limit` requests per `window_s`; excess returns 429 so
the frontend can degrade gracefully instead of silently draining the budget.

Deliberately simple and single-process (per-worker). Swap for Redis when the
backend runs multiple workers behind a load balancer.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, limit: int, window_s: float, tag: str) -> None:
        self.limit = limit
        self.window_s = window_s
        self.tag = tag
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def check(self, request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        now = time.time()
        q = self._hits[key]
        while q and now - q[0] > self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests for this endpoint ({self.tag}) — try again shortly.",
            )
        q.append(now)

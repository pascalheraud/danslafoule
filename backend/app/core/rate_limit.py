import time
from collections import defaultdict, deque

# Simple in-memory sliding-window limiter (protocol spec §8.1: "basic anti-spam
# rate-limiting"). Single-process only — sufficient for v1; revisit (e.g. Redis)
# if the relay is ever scaled horizontally.
_hits: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str, max_requests: int = 60, window_seconds: float = 60.0) -> bool:
    now = time.monotonic()
    hits = _hits[key]
    while hits and now - hits[0] > window_seconds:
        hits.popleft()
    if len(hits) >= max_requests:
        return False
    hits.append(now)
    return True


def reset_rate_limits() -> None:
    """Test-only helper to avoid cross-test rate-limit bleed-through."""
    _hits.clear()

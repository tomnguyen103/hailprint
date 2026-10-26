"""One HTTP GET with a bounded retry."""

import time
import urllib.error
import urllib.request

TRIES = 3
BACKOFF_S = (0.5, 1.0)


def get(url: str, timeout: float = 30) -> bytes:
    """Return the body. Retry a URLError, a timeout, or an HTTP 5xx; a 4xx raises at once.

    After the last try the last error propagates.
    """
    # shortcut: no jitter in the backoff, upgrade if many parallel callers appear
    for attempt in range(TRIES):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code < 500 or attempt == TRIES - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == TRIES - 1:
                raise
        time.sleep(BACKOFF_S[attempt])
    raise AssertionError("unreachable: the last try returns or raises")

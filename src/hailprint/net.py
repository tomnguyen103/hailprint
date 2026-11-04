"""HTTP GET with a bounded retry: `get` returns a whole body, `open_stream` a chunked one."""

import http.client
import io
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from importlib.metadata import version
from typing import Any

TRIES = 3
BACKOFF_S = (0.5, 1.0)
MAX_RETRY_AFTER_S = 30.0
RETRY_CODES = frozenset({408, 429})
SERVER_ERROR_MIN = 500
DEFAULT_TIMEOUT = 30
CHUNK_BYTES = 1 << 20  # read-ahead buffer of a stream
MAX_BYTES = 64 * 1024 * 1024  # 64 MB cap on whole-body responses
MAX_STREAM_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB cap on chunked stream responses
USER_AGENT = f"hailprint/{version('hailprint')} (+https://hailprint.tomnguyen.me)"


def _check_url(url: str) -> None:
    if not url.startswith(("https://", "http://")):
        raise ValueError(f"unsupported URL scheme: {url}")


class _NoDowngradeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reject HTTPS-to-HTTP redirects before urllib sends the next request."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: PLR0913
        if req.full_url.startswith("https://") and newurl.startswith("http://"):
            if fp is not None:
                fp.close()
            raise RuntimeError(f"{req.full_url}: redirect downgraded from https to http")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_NoDowngradeRedirectHandler())
_opener.addheaders = [("User-Agent", USER_AGENT)]
urllib.request.install_opener(_opener)


def _check_redirect(url: str, response: Any) -> None:
    final_url = getattr(response, "url", None) or (
        response.geturl() if hasattr(response, "geturl") else None
    )
    if (
        url.startswith("https://")
        and isinstance(final_url, str)
        and final_url.startswith("http://")
    ):
        response.close()
        raise RuntimeError(f"{url}: redirect downgraded from https to http")


def _retry[T](attempt_once: Callable[[], T]) -> T:
    """Return the result of `attempt_once`. Retry a network error, an HTTP 408, 429, or 5xx.

    Any other 4xx raises at once. A numeric `Retry-After` (RFC 9110 10.2.3 delta-seconds) sets
    the sleep, at most `MAX_RETRY_AFTER_S`; any other value uses `BACKOFF_S`. A retried HTTP
    error is closed before the sleep; the last error goes to the caller open.
    """
    # shortcut: no jitter in the backoff, upgrade if many parallel callers appear
    for attempt in range(TRIES):
        pause = BACKOFF_S[min(attempt, len(BACKOFF_S) - 1)]
        try:
            return attempt_once()
        except urllib.error.HTTPError as exc:
            if (
                exc.code not in RETRY_CODES and exc.code < SERVER_ERROR_MIN
            ) or attempt == TRIES - 1:
                raise
            pause = _retry_after(exc.headers, pause)
            exc.close()
        except (OSError, http.client.HTTPException):
            # URLError, timeout, reset, or a short read (IncompleteRead) during the body read
            if attempt == TRIES - 1:
                raise
        time.sleep(pause)
    raise AssertionError("unreachable: the last try returns or raises")


def _retry_after(headers: Any, default: float) -> float:
    """The delta-seconds of a `Retry-After` header, capped; `default` for any other value."""
    raw = headers.get("Retry-After") if headers is not None else None
    text = str(raw).strip() if raw is not None else ""
    if not (text.isascii() and text.isdigit()):
        return default
    return float(min(int((text.lstrip("0") or "0")[:9]), MAX_RETRY_AFTER_S))


def get(url: str, timeout: float = DEFAULT_TIMEOUT, max_bytes: int = MAX_BYTES) -> bytes:
    """Return the body. Retry a network error, a short read, or an HTTP 408, 429, or 5xx.

    After the last try the last error propagates.
    """
    _check_url(url)

    def fetch() -> bytes:
        with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310
            _check_redirect(url, response)
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise RuntimeError(f"response exceeds {max_bytes} bytes: {url}")
            return data

    return _retry(fetch)


def post(
    url: str,
    data: bytes,
    headers: Mapping[str, str],
    *,
    timeout: float = DEFAULT_TIMEOUT,
    max_bytes: int = 65536,
) -> bytes:
    """Send an HTTP POST and return the body with bounded retries and redirect checks."""
    _check_url(url)
    req_headers = dict(headers)

    def attempt() -> bytes:
        req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")  # noqa: S310
        with urllib.request.urlopen(req, timeout=timeout) as response:  # noqa: S310
            _check_redirect(url, response)
            raw = response.read(max_bytes + 1)
            if len(raw) > max_bytes:
                raise RuntimeError("Supabase Auth token response exceeds 64 KiB")
            return raw

    return _retry(attempt)


class _Body(io.RawIOBase):
    """The body of a response that raises IncompleteRead when it stops before Content-Length.

    The stdlib returns a clean end of file for a bounded read of a body that stopped early.
    """

    def __init__(
        self,
        response: http.client.HTTPResponse,
        url: str = "",
        max_bytes: int = MAX_STREAM_BYTES,
    ) -> None:
        _check_redirect(url, response)
        self._response = response
        self._url = url
        self._max_bytes = max_bytes
        self._read_bytes = 0
        length = response.getheader("Content-Length") if hasattr(response, "getheader") else None
        if length is None:
            self._left = None
        else:
            try:
                parsed = int(length)
            except ValueError as err:
                response.close()
                raise RuntimeError(f"{url}: invalid Content-Length {length!r}") from err
            if parsed < 0:
                response.close()
                raise RuntimeError(f"{url}: invalid Content-Length {length!r}")
            self._left = parsed

    def readable(self) -> bool:
        return True

    def readinto(self, buffer) -> int:
        count = self._response.readinto(buffer)
        self._read_bytes += count
        if self._read_bytes > self._max_bytes:
            raise ValueError(f"response from {self._url} exceeds {self._max_bytes} bytes")
        if self._left is not None:
            self._left -= count
            if count == 0 and len(buffer) > 0 and self._left > 0:
                raise http.client.IncompleteRead(b"", self._left)
        return count

    def close(self) -> None:
        self._response.close()
        super().close()


def open_stream(
    url: str,
    timeout: float = 30,
    max_bytes: int = MAX_STREAM_BYTES,
) -> io.BufferedReader:
    """Open the URL and return a binary stream to read in chunks.

    The connect retries like `get`. A body that breaks mid-read raises to the caller, and the
    caller removes any temp file. The caller closes the stream.
    """
    # shortcut: open_stream retries the connect only and has no Range resume, upgrade when a
    # stream breaks more than once per year
    _check_url(url)
    response = _retry(lambda: urllib.request.urlopen(url, timeout=timeout))  # noqa: S310
    return io.BufferedReader(_Body(response, url=url, max_bytes=max_bytes), CHUNK_BYTES)

"""HTTP GET with a bounded retry: `get` returns a whole body, `open_stream` a chunked one."""

import http.client
import io
import time
import urllib.error
import urllib.request
from collections.abc import Callable

TRIES = 3
BACKOFF_S = (0.5, 1.0)
CHUNK_BYTES = 1 << 20  # read-ahead buffer of a stream
MAX_BYTES = 64 * 1024 * 1024  # 64 MB cap on whole-body responses
MAX_STREAM_BYTES = 512 * 1024 * 1024  # 512 MB cap on chunked stream responses


def _retry[T](attempt_once: Callable[[], T]) -> T:
    """Return the result of `attempt_once`. Retry a network error or an HTTP 5xx; a 4xx raises."""
    # shortcut: no jitter in the backoff, upgrade if many parallel callers appear
    for attempt in range(TRIES):
        try:
            return attempt_once()
        except urllib.error.HTTPError as exc:
            if exc.code < 500 or attempt == TRIES - 1:
                raise
        except (OSError, http.client.HTTPException):
            # URLError, timeout, reset, or a short read (IncompleteRead) during the body read
            if attempt == TRIES - 1:
                raise
        time.sleep(BACKOFF_S[attempt])
    raise AssertionError("unreachable: the last try returns or raises")


def get(url: str, timeout: float = 30, max_bytes: int = MAX_BYTES) -> bytes:
    """Return the body. Retry a network error, a short read, or an HTTP 5xx; a 4xx raises at once.

    After the last try the last error propagates.
    """

    def fetch() -> bytes:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise RuntimeError(f"response exceeds {max_bytes} bytes: {url}")
            return data

    return _retry(fetch)


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
        self._response = response
        self._url = url
        self._max_bytes = max_bytes
        self._read_bytes = 0
        length = response.getheader("Content-Length")
        self._left = int(length) if length is not None else None

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
    response = _retry(lambda: urllib.request.urlopen(url, timeout=timeout))
    return io.BufferedReader(_Body(response, url=url, max_bytes=max_bytes), CHUNK_BYTES)

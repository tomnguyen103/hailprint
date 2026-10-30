import http.client
import io
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from hailprint import net

URL = "https://example.test/file.csv"


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _script(monkeypatch, *outcomes):
    """Patch urlopen to play the outcomes in order; return (calls, sleeps)."""
    calls, sleeps = [], []
    queue = list(outcomes)

    def urlopen(url, timeout=None):
        calls.append((url, timeout))
        outcome = queue.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome if isinstance(outcome, _Response) else _Response(outcome)

    monkeypatch.setattr(net.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(net.time, "sleep", sleeps.append)
    return calls, sleeps


class _BrokenBody(_Response):
    def read(self, *args):
        raise http.client.IncompleteRead(b"x")


def _http(code):
    return urllib.error.HTTPError(URL, code, "status", {}, None)


def test_get_returns_the_bytes_after_one_url_error(monkeypatch):
    calls, sleeps = _script(monkeypatch, urllib.error.URLError("drop"), b"data")

    assert net.get(URL, timeout=7) == b"data"
    assert calls == [(URL, 7), (URL, 7)]
    assert sleeps == [0.5]


def test_get_stops_after_three_tries_and_raises_the_last_error(monkeypatch):
    errors = [urllib.error.URLError(f"drop {i}") for i in range(3)]
    calls, sleeps = _script(monkeypatch, *errors)

    with pytest.raises(urllib.error.URLError) as exc:
        net.get(URL)

    assert exc.value is errors[-1]
    assert len(calls) == 3
    assert sleeps == [0.5, 1.0]


def test_get_retries_a_connection_reset_and_a_short_read(monkeypatch):
    calls, sleeps = _script(
        monkeypatch, ConnectionResetError("reset"), http.client.IncompleteRead(b"x"), b"data"
    )

    assert net.get(URL) == b"data"
    assert len(calls) == 3
    assert sleeps == [0.5, 1.0]


def test_get_retries_a_body_read_error_and_raises_the_last_one(monkeypatch):
    calls, _ = _script(monkeypatch, _BrokenBody(), _BrokenBody(), _BrokenBody())

    with pytest.raises(http.client.IncompleteRead):
        net.get(URL)

    assert len(calls) == 3


def test_get_never_retries_a_404(monkeypatch):
    calls, sleeps = _script(monkeypatch, _http(404))

    with pytest.raises(urllib.error.HTTPError) as exc:
        net.get(URL)

    assert exc.value.code == 404
    assert len(calls) == 1
    assert sleeps == []


def test_get_retries_a_503_once_then_succeeds(monkeypatch):
    calls, sleeps = _script(monkeypatch, _http(503), b"ok")

    assert net.get(URL) == b"ok"
    assert len(calls) == 2
    assert sleeps == [0.5]


def test_get_retries_a_timeout(monkeypatch):
    calls, _ = _script(monkeypatch, TimeoutError("slow"), b"ok")

    assert net.get(URL) == b"ok"
    assert len(calls) == 2


def test_get_rejects_response_exceeding_max_bytes(monkeypatch):
    _script(monkeypatch, b"x" * 11)

    with pytest.raises(RuntimeError, match="exceeds"):
        net.get(URL, max_bytes=10)


@pytest.fixture
def server():
    """A local HTTP server. `hits` counts the requests per path."""
    hits: dict[str, int] = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            hits[self.path] = count = hits.get(self.path, 0) + 1
            if self.path == "/missing":
                self.send_error(404)
            elif self.path == "/down" or (self.path == "/flaky" and count <= 2):
                self.send_error(503)
            else:
                # /short promises 100 bytes, sends 40, and closes the connection
                body = b"x" * 40 if self.path == "/short" else b"abcdef"
                self.send_response(200)
                self.send_header("Content-Length", "100" if self.path == "/short" else "6")
                self.end_headers()
                self.wfile.write(body)

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield SimpleNamespace(url=lambda path: f"http://127.0.0.1:{httpd.server_port}{path}", hits=hits)
    httpd.shutdown()
    httpd.server_close()


@pytest.fixture
def sleeps(monkeypatch):
    slept: list[float] = []
    monkeypatch.setattr(net.time, "sleep", slept.append)
    return slept


def test_open_stream_reads_a_whole_body_in_pieces(server, sleeps):
    with net.open_stream(server.url("/ok")) as stream:
        assert stream.read(4) == b"abcd"
        assert stream.read() == b"ef"
    assert sleeps == []


def test_open_stream_retries_a_connect_that_fails_twice(server, sleeps):
    with net.open_stream(server.url("/flaky")) as stream:
        assert stream.read() == b"abcdef"
    assert server.hits["/flaky"] == 3
    assert sleeps == [0.5, 1.0]


def test_open_stream_never_retries_a_404(server, sleeps):
    with pytest.raises(urllib.error.HTTPError) as exc:
        net.open_stream(server.url("/missing"))
    assert exc.value.code == 404
    assert server.hits["/missing"] == 1
    assert sleeps == []


def test_open_stream_raises_the_status_after_three_5xx_tries(server, sleeps):
    with pytest.raises(urllib.error.HTTPError, match="503"):
        net.open_stream(server.url("/down"))
    assert server.hits["/down"] == 3
    assert sleeps == [0.5, 1.0]


def test_open_stream_raises_on_the_read_after_a_body_that_stops_early(server, sleeps):
    with net.open_stream(server.url("/short")) as stream:
        assert stream.read(40) == b"x" * 40
        with pytest.raises(http.client.IncompleteRead):
            stream.read(1)
    assert server.hits["/short"] == 1  # the body is never retried
    assert sleeps == []


def test_open_stream_enforces_max_bytes_boundary(server, sleeps):
    url = server.url("/ok")
    with net.open_stream(url, max_bytes=6) as stream:
        assert stream.read() == b"abcdef"

    with (
        net.open_stream(url, max_bytes=5) as stream,
        pytest.raises(
            ValueError, match=r"response from http://127\.0\.0\.1:\d+/ok exceeds 5 bytes"
        ),
    ):
        stream.read()
    assert sleeps == []


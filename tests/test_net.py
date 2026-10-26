import http.client
import io
import urllib.error

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

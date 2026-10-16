import logging

import pytest
import requests

from planner import http
from planner.http import ProviderError

SECRET = "SECRET-KEY-123"


class FakeResponse:
    def __init__(self, status: int, body: object = None) -> None:
        self.status_code = status
        self._body = body

    def json(self) -> object:
        if self._body is None:
            raise ValueError("no json")
        return self._body


def call(monkeypatch: pytest.MonkeyPatch, outcome: object, deadline: http.Deadline | None = None) -> object:
    def fake_get(url: str, **kwargs: object) -> object:
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(http.requests, "get", fake_get)
    return http.get_json("tomtom", "https://example.test", {"key": SECRET}, deadline)


@pytest.mark.parametrize(
    ("outcome", "code"),
    [
        (FakeResponse(429), "tomtom_quota"),
        (FakeResponse(403), "tomtom_failed"),
        (FakeResponse(200), "tomtom_failed"),
        (requests.ConnectionError(f"https://example.test?key={SECRET}"), "tomtom_unreachable"),
    ],
)
def test_errors_have_codes_and_never_the_key(
    monkeypatch: pytest.MonkeyPatch, outcome: object, code: str
) -> None:
    with pytest.raises(ProviderError) as err:
        call(monkeypatch, outcome)
    assert err.value.code == code
    assert SECRET not in str(err.value)
    assert err.value.__cause__ is None


def test_ok_returns_json(monkeypatch: pytest.MonkeyPatch) -> None:
    assert call(monkeypatch, FakeResponse(200, {"a": 1})) == {"a": 1}


def test_calls_are_logged_without_url_or_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="planner"):
        call(monkeypatch, FakeResponse(200, {"a": 1}))
    [line] = [r.getMessage() for r in caplog.records]
    assert line.startswith("provider_call provider=tomtom status=200 ms=")
    assert line.endswith("cache=miss")
    assert SECRET not in caplog.text and "example.test" not in caplog.text


def test_a_cached_call_is_a_hit_and_skips_the_request(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    calls = []

    def fake_get(url: str, **kwargs: object) -> object:
        calls.append(url)
        return FakeResponse(200, {"a": 1})

    monkeypatch.setattr(http.requests, "get", fake_get)
    with caplog.at_level(logging.INFO, logger="planner"):
        for key in ("one", "two"):  # the API key is not part of the cache key
            assert http.cached_json("tomtom", "https://example.test", {"q": 1, "key": key}) == {"a": 1}
    assert len(calls) == 1
    assert [r.getMessage().split()[-1] for r in caplog.records] == ["cache=miss", "cache=hit"]


def test_the_deadline_caps_the_timeout_and_runs_out(monkeypatch: pytest.MonkeyPatch) -> None:
    now = [100.0]
    monkeypatch.setattr(http.time, "monotonic", lambda: now[0])
    deadline = http.Deadline.after(25)
    assert deadline.timeout() == http.TIMEOUT_S
    now[0] = 115.0
    assert deadline.timeout() == pytest.approx(10)
    now[0] = 125.0
    with pytest.raises(ProviderError) as err:
        deadline.timeout()
    assert err.value.code == "plan_timeout"


def test_get_json_uses_the_time_left_as_its_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}

    def fake_get(url: str, **kwargs: object) -> object:
        seen.update(kwargs)
        return FakeResponse(200, {})

    monkeypatch.setattr(http.requests, "get", fake_get)
    http.get_json("tomtom", "https://example.test", {}, http.Deadline.after(5))
    assert 4 < seen["timeout"] <= 5


def test_a_spent_deadline_is_plan_timeout_before_any_request(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(url: str, **kwargs: object) -> object:
        raise AssertionError("no request expected")

    monkeypatch.setattr(http.requests, "get", fail)
    with pytest.raises(ProviderError) as err:
        http.get_json("tomtom", "https://example.test", {}, http.Deadline.after(-1))
    assert err.value.code == "plan_timeout"

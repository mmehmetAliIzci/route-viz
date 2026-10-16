import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from planner import http, routing
from planner.http import ProviderError

FIXTURE = Path(__file__).parent / "fixtures" / "tomtom_route_kc_den.json"
NOW = datetime(2026, 10, 16, 12, tzinfo=UTC)


@pytest.fixture(scope="module")
def kc_den() -> list[routing.Route]:
    return routing.parse(json.loads(FIXTURE.read_text()))


def test_three_routes_with_names(kc_den: list[routing.Route]) -> None:
    assert [r.name for r in kc_den] == ["I-70 W / I-470 W", "I-80 W / I-76 W", "US-36 W / US-34 W"]


def test_routes_run_kansas_city_to_denver(kc_den: list[routing.Route]) -> None:
    for r in kc_den:
        (lon0, lat0), (lon1, lat1) = r.geometry[0], r.geometry[-1]
        assert (lon0, lat0) == pytest.approx((-94.58, 39.10), abs=0.05)
        assert (lon1, lat1) == pytest.approx((-104.99, 39.74), abs=0.05)
        assert 550 < r.distance_mi < 750


def test_profile_runs_from_departure_to_arrival(kc_den: list[routing.Route]) -> None:
    for r in kc_den:
        assert r.profile[0] == (0, 0)
        assert r.profile[-1] == (pytest.approx(r.distance_mi), r.duration_s)
        assert len(r.profile) > 10
        for (m0, t0), (m1, t1) in zip(r.profile, r.profile[1:], strict=False):
            assert m1 >= m0 and t1 >= t0 and (m1, t1) != (m0, t0)


def test_request_sends_gross_weight_in_kg() -> None:
    params = routing.request_params(datetime(2026, 10, 16, 14, tzinfo=UTC), 38_000, "k", NOW)
    assert params["vehicleWeight"] == round(73_000 * 0.45359237)  # 33,112 kg
    assert params["departAt"] == "2026-10-16T14:00:00+00:00"
    assert params["maxAlternatives"] == 2
    assert params["travelMode"] == "truck"


def test_routes_puts_lat_before_lon_in_the_url(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}

    def fake_get(provider: str, url: str, params: dict, deadline: object = None) -> dict:
        seen["url"] = url
        return json.loads(FIXTURE.read_text())

    monkeypatch.setattr(http, "get_json", fake_get)
    routing.routes((-94.5, 39.1), (-105.0, 39.7), datetime(2026, 10, 16, tzinfo=UTC), 0, "k")
    assert "/39.1,-94.5:39.7,-105.0/" in seen["url"]


def test_empty_response_is_no_route() -> None:
    with pytest.raises(ProviderError) as err:
        routing.parse({"routes": []})
    assert err.value.code == "no_route"


def test_departure_is_rounded_up_to_15_minutes_for_the_router() -> None:
    at = routing.depart_at
    assert at(datetime(2026, 10, 16, 14, 0, 1, tzinfo=UTC), NOW) == "2026-10-16T14:15:00+00:00"
    assert at(datetime(2026, 10, 16, 14, 15, tzinfo=UTC), NOW) == "2026-10-16T14:15:00+00:00"


def test_departure_whose_mark_has_passed_goes_as_now() -> None:
    assert routing.depart_at(datetime(2026, 10, 16, 11, 50, tzinfo=UTC), NOW) == "now"
    assert routing.depart_at(NOW, NOW) == "now"


def test_routes_are_cached_per_15_minute_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict] = []

    def fake_get(provider: str, url: str, params: dict, deadline: object = None) -> dict:
        sent.append(params)
        return json.loads(FIXTURE.read_text())

    monkeypatch.setattr(http, "get_json", fake_get)

    def call(minute: int, second: int = 0, load_lb: int = 0, key: str = "k") -> list[routing.Route]:
        when = datetime(2030, 10, 16, 14, minute, second, tzinfo=UTC)  # future, so never "now"
        return routing.routes((-94.5, 39.1), (-105.0, 39.7), when, load_lb, key)

    first = call(1)
    assert call(14, 59) == first  # same bucket: no second request
    assert len(sent) == 1
    call(16)  # next bucket
    call(1, load_lb=10_000)  # other load
    assert len(sent) == 3
    call(1, key="other-key")  # the key is not part of the cache key
    assert len(sent) == 3

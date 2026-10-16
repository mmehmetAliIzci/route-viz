from datetime import UTC, datetime, timedelta

import pytest

from planner import http, weather
from planner.http import ProviderError
from planner.weather import Series

T0 = datetime(2026, 10, 16, 12, tzinfo=UTC)


def series(wind: list[float], rain: list[float]) -> Series:
    return Series(
        t0=int(T0.timestamp()), wind_mph=wind, gust_mph=wind, rain_in_hr=rain, snow_in_hr=[0.0] * len(rain)
    )


def test_wind_is_read_at_the_stamp_and_rain_half_an_hour_earlier() -> None:
    s = series(wind=[10, 20, 30], rain=[0.1, 0.3, 0.5])
    # 13:30: wind halfway between 13:00 and 14:00; the rain stamped 14:00 covers 13:00-14:00
    w = s.at(T0 + timedelta(hours=1, minutes=30))
    assert w.wind_mph == pytest.approx(25)
    assert w.rain_in_hr == pytest.approx(0.5)
    # 12:30 sits in the hour stamped 13:00
    assert s.at(T0 + timedelta(minutes=30)).rain_in_hr == pytest.approx(0.3)


def test_times_outside_the_series_clamp_to_the_ends() -> None:
    s = series(wind=[10, 20, 30], rain=[0.1, 0.3, 0.5])
    assert s.at(T0 - timedelta(hours=5)).wind_mph == 10
    assert s.at(T0 + timedelta(hours=9)).wind_mph == 30


def test_units_are_converted_and_showers_count_as_rain() -> None:
    hourly = {
        "time": [0, 3600],
        "wind_speed_10m": [100, 0],
        "wind_gusts_10m": [0, 0],
        "rain": [25.4, 0],
        "showers": [2.54, 0],
        "snowfall": [2.54, 0],
    }
    [s] = weather.parse([{"hourly": hourly}])
    assert s.wind_mph[0] == pytest.approx(62.1371)
    assert s.rain_in_hr[0] == pytest.approx(1.1)
    assert s.snow_in_hr[0] == pytest.approx(1.0)


def test_a_null_value_fails_loudly() -> None:
    hourly = {
        "time": [0],
        "wind_speed_10m": [None],
        "wind_gusts_10m": [0],
        "rain": [0],
        "showers": [0],
        "snowfall": [0],
    }
    with pytest.raises(ProviderError) as err:
        weather.parse([{"hourly": hourly}])
    assert err.value.code == "weather_missing"


def test_hour_window_pads_one_hour_before_and_after() -> None:
    first, last = weather.hour_window(
        T0 + timedelta(hours=2, minutes=30), T0 + timedelta(hours=4, minutes=10)
    )
    assert (first, last) == (T0 + timedelta(hours=1), T0 + timedelta(hours=6))


def test_layout_keeps_the_corners_of_every_cell_a_route_crosses() -> None:
    # A straight line along lat 39.1 from lon -95.0 to -94.0, step 0.25: cells i = 1..5, j = 1
    lay = weather.layout([[(-95.0, 39.1), (-94.0, 39.1)]], max_nodes=12)
    assert lay.step == 0.25 and (lay.west, lay.south) == (-95.25, 38.75)
    on_line = {(k % lay.nx, k // lay.nx) for k in lay.nodes}
    assert {(i, j) for i in range(1, 6) for j in (1, 2)} <= on_line


def test_layout_adds_a_ring_only_when_the_budget_allows() -> None:
    line = [[(-95.0, 39.1), (-94.0, 39.1)]]
    assert len(weather.layout(line, max_nodes=40).nodes) > len(weather.layout(line, max_nodes=12).nodes)


def test_layout_coarsens_the_step_to_fit_the_budget() -> None:
    long_line = [[(-105.0, 39.0), (-94.0, 39.0)]]
    lay = weather.layout(long_line, max_nodes=50)
    assert lay.step > 0.25
    assert len(lay.nodes) <= 50


def grid_with(values: dict[tuple[int, int], float]) -> weather.Grid:
    """2 x 2 nodes, step 1 degree, constant over time; wind given per node."""
    nodes = {j * 2 + i: series([v, v], [0, 0]) for (i, j), v in values.items()}
    return weather.Grid(west=0, south=0, step=1, nx=2, ny=2, start=T0, series=nodes)


def test_grid_at_is_bilinear_between_nodes() -> None:
    g = grid_with({(0, 0): 0, (1, 0): 10, (0, 1): 20, (1, 1): 30})
    assert g.at(0.5, 0.5, T0).wind_mph == pytest.approx(15)
    assert g.at(0.25, 0, T0).wind_mph == pytest.approx(2.5)
    assert g.at(1, 1, T0).wind_mph == pytest.approx(30)


def test_grid_at_fails_when_a_corner_was_not_fetched() -> None:
    g = grid_with({(0, 0): 0, (1, 0): 10, (0, 1): 20})
    with pytest.raises(ProviderError):
        g.at(0.5, 0.5, T0)


def test_frame_marks_unfetched_nodes() -> None:
    g = grid_with({(0, 0): 5})
    frame = g.frame(0)
    assert frame[0] is not None and frame[1:] == [None, None, None]


def test_series_are_cached_by_request_and_deadline_is_passed_on(monkeypatch: pytest.MonkeyPatch) -> None:
    hourly = {k: [0] * 3 for k in ("wind_speed_10m", "wind_gusts_10m", "rain", "showers", "snowfall")}
    hourly["time"] = [0, 3600, 7200]
    seen = []

    def fake_get(provider: str, url: str, params: dict, deadline: object = None) -> dict:
        seen.append(deadline)
        return {"hourly": hourly}

    monkeypatch.setattr(http, "get_json", fake_get)
    deadline = http.Deadline.after(25)
    where = [(-95.0, 39.1)]
    # Two departures in the same hour ask for the same hours, so the second is a hit.
    weather.fetch_series(where, T0 + timedelta(minutes=5), T0 + timedelta(hours=3), deadline)
    weather.fetch_series(where, T0 + timedelta(minutes=50), T0 + timedelta(hours=3), deadline)
    assert seen == [deadline]
    weather.fetch_series(where, T0 + timedelta(hours=2), T0 + timedelta(hours=3), deadline)
    assert len(seen) == 2

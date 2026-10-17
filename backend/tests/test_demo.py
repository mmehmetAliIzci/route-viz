"""Demo weather: a synthetic front on the lean grid, deterministic, crossing every threshold."""

from datetime import UTC, datetime

import pytest

from planner import demo, rules, samples, weather
from planner.rules import Level

START = datetime(2026, 10, 16, 14, tzinfo=UTC)
HOURS = 49


@pytest.fixture(scope="module")
def layout() -> weather.Layout:
    stored = samples.get("kansas-city-denver")
    return weather.layout([[tuple(p) for p in r["geometry"]] for r in stored["routes"]])


@pytest.mark.parametrize("scenario", demo.SCENARIOS)
def test_grid_covers_every_layout_node_for_49_hours(layout: weather.Layout, scenario: str) -> None:
    g = demo.grid(layout, START, HOURS, scenario)
    assert set(g.series) == set(layout.nodes)
    assert (g.west, g.south, g.step, g.nx, g.ny, g.start) == (
        layout.west, layout.south, layout.step, layout.nx, layout.ny, START,
    )  # fmt: skip
    for s in g.series.values():
        assert s.t0 == int(START.timestamp())
        assert len(s.wind_mph) == len(s.gust_mph) == len(s.rain_in_hr) == len(s.snow_in_hr) == HOURS
        assert s.dir_deg is not None and len(s.dir_deg) == HOURS
    assert g.has_direction


@pytest.mark.parametrize("scenario", demo.SCENARIOS)
def test_grid_is_deterministic(layout: weather.Layout, scenario: str) -> None:
    assert demo.grid(layout, START, HOURS, scenario) == demo.grid(layout, START, HOURS, scenario)


def node_hours(g: weather.Grid, field: str) -> list[float]:
    return [v for s in g.series.values() for v in getattr(s, field)]


def test_wind_crosses_every_wind_threshold(layout: weather.Layout) -> None:
    g = demo.grid(layout, START, HOURS, "wind")
    levels = {rules.wind_level(v, 38_000) for v in node_hours(g, "wind_mph")}
    assert {Level.LOW, Level.MODERATE, Level.HIGH, Level.NO_TRAVEL} <= levels
    assert Level.SEVERE in {rules.wind_level(v, 20_000) for v in node_hours(g, "wind_mph")}
    assert max(node_hours(g, "wind_mph")) <= 52
    assert min(node_hours(g, "wind_mph")) >= 8
    assert all(s.gust_mph[0] == pytest.approx(1.3 * s.wind_mph[0]) for s in g.series.values())
    dirs = node_hours(g, "dir_deg")
    assert 195 <= min(dirs) < 215 and 235 < max(dirs) <= 255  # south-west, veering across the corridor


def test_rain_and_snow_cross_their_thresholds(layout: weather.Layout) -> None:
    rain = demo.grid(layout, START, HOURS, "rain")
    assert {rules.rain_level(v) for v in node_hours(rain, "rain_in_hr")} >= set(Level) - {Level.NO_TRAVEL}
    assert max(node_hours(rain, "snow_in_hr")) == 0
    assert set(node_hours(rain, "dir_deg")) == {180}
    snow = demo.grid(layout, START, HOURS, "snow")
    assert {rules.snow_level(v) for v in node_hours(snow, "snow_in_hr")} >= set(Level) - {Level.NO_TRAVEL}
    assert max(node_hours(snow, "rain_in_hr")) == 0
    assert set(node_hours(snow, "dir_deg")) == {315}


def test_the_front_sweeps_across_the_corridor(layout: weather.Layout) -> None:
    g = demo.grid(layout, START, HOURS, "wind")
    # KC-Denver runs east-west: the front starts west of the corridor and leaves it to the east.
    west_k = min(g.series, key=lambda k: k % g.nx)
    east_k = max(g.series, key=lambda k: k % g.nx)
    west, east = g.series[west_k].wind_mph, g.series[east_k].wind_mph
    assert west.index(max(west)) < east.index(max(east))


def test_unknown_scenario_is_rejected(layout: weather.Layout) -> None:
    with pytest.raises(ValueError):
        demo.grid(layout, START, HOURS, "hail")  # type: ignore[arg-type]

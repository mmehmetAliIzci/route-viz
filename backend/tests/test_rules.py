"""Cases come from the PDF risk table and load rules, not from running the code."""

import pytest

from planner.rules import Assessment, Level, classify, rain_level, snow_level, wind_level

L, M, H, S, N = Level.LOW, Level.MODERATE, Level.HIGH, Level.SEVERE, Level.NO_TRAVEL
LIGHT = 10_000  # below every load threshold


@pytest.mark.parametrize(
    ("mph", "expected"),
    [(0, L), (24.9, L), (25, M), (34.9, M), (35, H), (44.9, H), (45, S), (54.9, S), (55, N), (80, N)],
)
def test_wind_bands_light_load(mph: float, expected: Level) -> None:
    assert wind_level(mph, LIGHT) == expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [(0, L), (0.099, L), (0.10, M), (0.249, M), (0.25, H), (0.499, H), (0.50, S), (1.00, S), (1.001, N)],
)
def test_rain_bands(in_hr: float, expected: Level) -> None:
    assert rain_level(in_hr) == expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [(0, L), (0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H), (2.0, S), (3.0, S), (3.01, N)],
)
def test_snow_bands(in_hr: float, expected: Level) -> None:
    assert snow_level(in_hr) == expected


@pytest.mark.parametrize(
    ("mph", "load_lb", "expected"),
    [
        # >=55 mph: No Travel for any load
        (55, 0, N),
        (60, 80_000, N),
        # 45-54 mph: No Travel above 30,000 lb, otherwise the table's Severe
        (45, 30_000, S),
        (45, 30_001, N),
        (54, 45_000, N),
        # 35-44 mph: Severe above 40,000 lb, otherwise the table's High
        (35, 40_000, H),
        (35, 40_001, S),
        (44, 80_000, S),
        # load rules do not touch lower wind bands
        (34, 80_000, M),
        (24, 80_000, L),
    ],
)
def test_load_rules(mph: float, load_lb: float, expected: Level) -> None:
    assert wind_level(mph, load_lb) == expected


def test_classify_calm_is_low_with_no_cause() -> None:
    assert classify(5, 0, 0, LIGHT) == Assessment(L, None)


def test_classify_takes_worst_condition() -> None:
    assert classify(26, 0.30, 0, LIGHT) == Assessment(H, "rain")
    assert classify(26, 0.05, 2.5, LIGHT) == Assessment(S, "snow")


def test_classify_load_can_raise_wind_above_rain() -> None:
    # 40 mph is High for a light load, Severe above 40,000 lb
    assert classify(40, 0.30, 0, LIGHT) == Assessment(H, "wind")
    assert classify(40, 0.30, 0, 42_000) == Assessment(S, "wind")


def test_classify_tie_names_wind_then_rain_then_snow() -> None:
    assert classify(36, 0.30, 1.5, LIGHT) == Assessment(H, "wind")
    assert classify(0, 0.30, 1.5, LIGHT) == Assessment(H, "rain")

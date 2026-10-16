import math
from datetime import UTC, datetime, timedelta

import pytest

from planner.sampling import EARTH_RADIUS_MI, checkpoints, haversine_mi, owned_miles, seconds_at

DEG = EARTH_RADIUS_MI * math.radians(1)  # one degree of a great circle, about 69.09 mi
DEPART = datetime(2026, 10, 16, 14, 0, tzinfo=UTC)


def steady(total_mi: float, seconds: float) -> list[tuple[float, float]]:
    """Constant speed from start to end."""
    return [(0, 0), (total_mi, seconds)]


def test_one_degree_on_equator() -> None:
    assert haversine_mi((0, 0), (1, 0)) == pytest.approx(DEG)


def test_even_spacing_on_two_degree_line() -> None:
    cps = checkpoints([(0, 0), (2, 0)], profile=steady(2 * DEG, 7200), spacing_mi=DEG / 2, departure=DEPART)

    assert [c.mile for c in cps] == pytest.approx([0, DEG / 2, DEG, 1.5 * DEG, 2 * DEG])
    assert [c.lon for c in cps] == pytest.approx([0, 0.5, 1, 1.5, 2])
    assert [c.owned_mi for c in cps] == pytest.approx([DEG / 4, DEG / 2, DEG / 2, DEG / 2, DEG / 4])
    assert [c.eta - DEPART for c in cps] == [timedelta(minutes=m) for m in (0, 30, 60, 90, 120)]


def test_owned_miles_halves_the_gaps() -> None:
    assert owned_miles([0, 25, 50, 60]) == [12.5, 25, 17.5, 5]


def test_short_last_gap_owns_only_half_of_it() -> None:
    cps = checkpoints([(0, 0), (1, 0)], profile=steady(DEG, 3600), spacing_mi=25, departure=DEPART)

    assert [c.mile for c in cps] == pytest.approx([0, 25, 50, DEG])
    last_gap = DEG - 50
    assert [c.owned_mi for c in cps] == pytest.approx([12.5, 25, 12.5 + last_gap / 2, last_gap / 2])
    assert sum(c.owned_mi for c in cps) == pytest.approx(DEG)


def test_spacing_longer_than_route_gives_both_ends() -> None:
    cps = checkpoints([(0, 0), (1, 0)], profile=steady(DEG, 3600), spacing_mi=100, departure=DEPART)

    assert [c.mile for c in cps] == pytest.approx([0, DEG])
    assert [c.owned_mi for c in cps] == pytest.approx([DEG / 2, DEG / 2])


def test_position_follows_polyline_around_a_corner() -> None:
    # east one degree, then north one degree; mile 1.5 DEG is halfway up the second leg
    cps = checkpoints(
        [(0, 0), (1, 0), (1, 1)], profile=steady(2 * DEG, 3600), spacing_mi=DEG / 2, departure=DEPART
    )

    lon, lat = cps[3].lon, cps[3].lat
    assert (lon, lat) == pytest.approx((1, 0.5), abs=1e-3)


@pytest.mark.parametrize(("geometry", "spacing"), [([(0, 0)], 25), ([(0, 0), (1, 0)], 0)])
def test_rejects_bad_input(geometry: list[tuple[float, float]], spacing: float) -> None:
    with pytest.raises(ValueError):
        checkpoints(geometry, profile=steady(DEG, 3600), spacing_mi=spacing, departure=DEPART)


def test_eta_follows_uneven_speeds() -> None:
    # first half of a 2-degree line is slow (90 min), second half fast (30 min)
    profile = [(0, 0), (DEG, 5400), (2 * DEG, 7200)]
    cps = checkpoints([(0, 0), (2, 0)], profile=profile, spacing_mi=DEG / 2, departure=DEPART)

    assert [c.eta - DEPART for c in cps] == [timedelta(minutes=m) for m in (0, 45, 90, 105, 120)]


def test_seconds_at_clamps_and_handles_repeated_miles() -> None:
    profile = [(0, 0), (10, 600), (10, 900), (20, 1500)]  # a 5-minute stop at mile 10
    assert seconds_at(profile, -1) == 0
    assert seconds_at(profile, 5) == 300
    assert seconds_at(profile, 15) == 1200
    assert seconds_at(profile, 99) == 1500

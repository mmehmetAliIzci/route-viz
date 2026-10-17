"""Leaving later: the recommended route rescored at later departures on the grid it already has."""

from datetime import UTC, datetime, timedelta

from planner import later, ranking, sampling, weather
from planner.rules import Level

START = datetime(2026, 10, 16, 14, tzinfo=UTC)
HOURS = 49


def grid_with_wind(windy_hours: range, mph: float = 60.0) -> weather.Grid:
    """A 2 x 2 grid where every node blows `mph` (60 is No Travel) in `windy_hours` and 5 mph otherwise."""
    wind = [mph if h in windy_hours else 5.0 for h in range(HOURS)]
    series = weather.Series(
        t0=int(START.timestamp()),
        wind_mph=wind,
        gust_mph=[w * 1.3 for w in wind],
        rain_in_hr=[0.0] * HOURS,
        snow_in_hr=[0.0] * HOURS,
    )
    return weather.Grid(-100.0, 38.0, 1.0, 2, 2, START, {k: series for k in range(4)})


def checkpoints(count: int = 4) -> list[sampling.Checkpoint]:
    """One checkpoint an hour apart along the diagonal of the grid's one cell."""
    return [
        sampling.Checkpoint(
            mile=25 * i, lon=-99.8 + 0.1 * i, lat=38.2 + 0.1 * i, eta=START + timedelta(hours=i), owned_mi=25
        )
        for i in range(count)
    ]


def summary_at(cps: list[sampling.Checkpoint], grid: weather.Grid, shift_h: int = 0) -> ranking.Summary:
    from planner import rules

    scored = []
    for c in cps:
        w = grid.at(c.lon, c.lat, c.eta + timedelta(hours=shift_h))
        scored.append(
            ranking.Scored(rules.classify(w.wind_mph, w.rain_in_hr, w.snow_in_hr, 38_000).level, c.owned_mi)
        )
    return ranking.summarize(scored, 3 * 3600)


def test_finds_the_smallest_shift_that_clears_the_storm() -> None:
    grid = grid_with_wind(range(0, 8))  # No Travel wind for the first eight hours only
    cps = checkpoints()
    now = summary_at(cps, grid)
    assert now.max_level == Level.NO_TRAVEL
    found = later.leave_later(cps, 3 * 3600, grid, 38_000, START, now)
    assert found is not None
    # Three hours later every checkpoint is still in the storm; six hours later only the first two are.
    assert found.shift_h == 6
    assert found.departure == START + timedelta(hours=6)
    assert now.no_travel_mi == 100 and found.summary.no_travel_mi == 50
    # Starting from that improved departure, the next useful step clears the storm completely.
    again = later.leave_later(cps, 3 * 3600, grid, 38_000, START + timedelta(hours=6), found.summary)
    assert again is not None and again.summary.no_travel_mi == 0


def test_none_when_the_route_is_already_fine() -> None:
    grid = grid_with_wind(range(0))  # calm all the way
    cps = checkpoints()
    assert later.leave_later(cps, 3 * 3600, grid, 38_000, START, summary_at(cps, grid)) is None


def test_none_when_no_covered_shift_helps() -> None:
    grid = grid_with_wind(range(0, HOURS))  # windy the whole forecast
    cps = checkpoints()
    assert later.leave_later(cps, 3 * 3600, grid, 38_000, START, summary_at(cps, grid)) is None


def test_never_reads_past_the_end_of_the_forecast() -> None:
    grid = grid_with_wind(range(0, 40))  # clears at hour 40, but a 24 h shift of a 3 h trip ends at hour 27
    cps = checkpoints()
    assert later.leave_later(cps, 3 * 3600, grid, 38_000, START, summary_at(cps, grid)) is None
    # A trip that ends 30 hours out cannot shift 24 hours within a 48 hour grid.
    late = [sampling.Checkpoint(25, -99.8, 38.2, START + timedelta(hours=30), 25)]
    assert (
        later.leave_later(
            late,
            3600,
            grid_with_wind(range(0, 46)),
            38_000,
            START,
            summary_at(late, grid_with_wind(range(0, 46))),
        )
        is None
    )


def test_grid_end_is_the_last_stamp() -> None:
    assert grid_with_wind(range(0)).end() == START + timedelta(hours=HOURS - 1)


def test_a_near_tie_is_not_an_improvement() -> None:
    grid = grid_with_wind(range(0, 2), mph=40.0)  # High wind for the first two hours only
    few = [sampling.Checkpoint(mile=0, lon=-99.8, lat=38.2, eta=START, owned_mi=3)]
    many = [sampling.Checkpoint(mile=0, lon=-99.8, lat=38.2, eta=START, owned_mi=5)]
    now = summary_at(few, grid)
    assert now.risk_score == 9  # 3 High miles: later is 9 points better, within the 10 point near-tie
    assert later.leave_later(few, 3 * 3600, grid, 38_000, START, now) is None
    now = summary_at(many, grid)
    assert now.risk_score == 15  # 5 High miles: 15 points better is a real improvement
    found = later.leave_later(many, 3 * 3600, grid, 38_000, START, now)
    assert found is not None and found.shift_h == 3 and found.summary.risk_score == 0

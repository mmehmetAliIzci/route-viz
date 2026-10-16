import pytest

from planner.ranking import Scored, Summary, recommend, summarize
from planner.rules import Level


def route(nt: float = 0, sev: float = 0, high: float = 0, avg: float = 0, dur: float = 3600) -> Summary:
    return Summary(
        no_travel_mi=nt,
        severe_mi=sev,
        high_mi=high,
        moderate_mi=0,
        avg_risk=avg,
        max_level=Level.LOW,
        duration_s=dur,
    )


def test_summarize_weights_levels_by_owned_miles() -> None:
    scored = [
        Scored(Level.LOW, 10),
        Scored(Level.HIGH, 20),
        Scored(Level.SEVERE, 5),
        Scored(Level.NO_TRAVEL, 5),
    ]
    s = summarize(scored, duration_s=5000)

    assert (s.no_travel_mi, s.severe_mi, s.high_mi) == (5, 5, 20)
    assert s.avg_risk == pytest.approx((0 * 10 + 2 * 20 + 3 * 5 + 4 * 5) / 40)  # 1.875
    assert s.max_level == Level.NO_TRAVEL
    assert s.duration_s == 5000


def test_summarize_counts_moderate_miles() -> None:
    scored = [Scored(Level.MODERATE, 25), Scored(Level.MODERATE, 25), Scored(Level.LOW, 10)]
    assert summarize(scored, duration_s=1).moderate_mi == 50


def test_severe_miles_beat_high_miles() -> None:
    rec = recommend([route(sev=10), route(sev=0, high=50)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "severe_mi")


def test_high_miles_decide_when_severe_ties() -> None:
    rec = recommend([route(sev=5, high=50, dur=3000), route(sev=5, high=0, dur=9000)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "high_mi")


def test_average_risk_decides_next() -> None:
    rec = recommend([route(avg=1.2), route(avg=0.8, dur=99_999)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "avg_risk")


def test_travel_time_decides_last() -> None:
    rec = recommend([route(dur=36_000), route(dur=31_440), route(dur=40_000)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "duration")


def test_no_travel_miles_rank_before_severe() -> None:
    rec = recommend([route(nt=5), route(sev=100)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "no_travel_mi")


def test_float_noise_does_not_break_a_tie() -> None:
    rec = recommend([route(sev=10.000001, dur=3000), route(sev=10, dur=4000)])
    assert (rec.index, rec.decided_by) == (0, "duration")


def test_full_tie_keeps_first_route() -> None:
    rec = recommend([route(), route()])
    assert (rec.index, rec.runner_up, rec.decided_by) == (0, 1, None)


def test_single_route_has_no_runner_up() -> None:
    rec = recommend([route()])
    assert (rec.index, rec.runner_up, rec.decided_by) == (0, None, None)


def test_empty_is_an_error() -> None:
    with pytest.raises(ValueError):
        recommend([])

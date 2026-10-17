import pytest

from planner.ranking import LEVEL_WEIGHTS, Scored, Summary, near_tied, recommend, summarize
from planner.rules import Level


def route(score: float = 0, dur: float = 3600, avg: float = 0) -> Summary:
    return Summary(
        no_travel_mi=0,
        severe_mi=0,
        high_mi=0,
        moderate_mi=0,
        avg_risk=avg,
        risk_score=score,
        max_level=Level.LOW,
        duration_s=dur,
    )


def miles(severe: float = 0, high: float = 0, dur: float = 3600) -> Summary:
    """A route summarized from checkpoints, so its score comes from the weights."""
    scored = [Scored(Level.SEVERE, severe), Scored(Level.HIGH, high), Scored(Level.LOW, 100)]
    return summarize(scored, dur)


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
    assert s.risk_score == 20 * 3 + 5 * 9 + 5 * 27  # 240
    assert s.max_level == Level.NO_TRAVEL
    assert s.duration_s == 5000


def test_summarize_counts_moderate_miles() -> None:
    scored = [Scored(Level.MODERATE, 25), Scored(Level.MODERATE, 25), Scored(Level.LOW, 10)]
    assert summarize(scored, duration_s=1).moderate_mi == 50


def test_weights_triple_with_each_level() -> None:
    assert [LEVEL_WEIGHTS[lv] for lv in Level] == [0, 1, 3, 9, 27]


def test_near_tie_on_a_big_score_is_decided_by_time() -> None:
    rec = recommend([route(score=1000, dur=40_000), route(score=1040, dur=30_000)])
    assert (rec.index, rec.decided_by) == (1, "duration")


def test_130_high_miles_cost_more_than_one_severe_mile() -> None:
    a, b = miles(severe=50, high=130), miles(severe=51)
    assert (a.risk_score, b.risk_score) == (840, 459)
    rec = recommend([a, b])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "risk_score")


def test_lowest_score_wins_when_not_near_tied() -> None:
    rec = recommend([route(score=300, dur=3000), route(score=100, dur=99_999), route(score=500)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "risk_score")


def test_near_tied_scores_go_to_the_quicker_route() -> None:
    rec = recommend([route(score=100, dur=36_000), route(score=108, dur=30_000)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "duration")


def test_near_tie_is_ten_points_or_five_percent() -> None:
    assert near_tied(0, 10) and not near_tied(0, 10.2)
    assert near_tied(1000, 1052) and not near_tied(1000, 1053)
    assert near_tied(1052, 1000)


def test_a_longer_route_with_the_same_bad_miles_does_not_score_lower() -> None:
    short = summarize([Scored(Level.SEVERE, 30), Scored(Level.HIGH, 20), Scored(Level.LOW, 100)], 3600)
    long = summarize([Scored(Level.SEVERE, 30), Scored(Level.HIGH, 20), Scored(Level.LOW, 400)], 99_999)
    assert long.risk_score == short.risk_score
    assert long.avg_risk < short.avg_risk
    rec = recommend([short, long])
    assert (rec.index, rec.decided_by) == (0, "duration")


def test_all_calm_routes_are_decided_by_time() -> None:
    rec = recommend([route(dur=36_000), route(dur=31_440), route(dur=40_000)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 0, "duration")


def test_runner_up_is_the_best_of_the_rest() -> None:
    rec = recommend([route(score=400), route(score=0), route(score=200)])
    assert (rec.index, rec.runner_up, rec.decided_by) == (1, 2, "risk_score")


def test_float_noise_does_not_break_a_tie() -> None:
    rec = recommend([route(score=10.000001, dur=3000), route(score=10, dur=4000)])
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

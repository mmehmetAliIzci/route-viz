from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from planner.explain import Hazard, RouteFacts, explain
from planner.ranking import LEVEL_WEIGHTS, Recommendation, Summary
from planner.rules import Level

TZ = ZoneInfo("America/Chicago")


def _eta(text: str) -> datetime:
    return datetime.fromisoformat(text).astimezone(UTC)


def _summary(duration_s, *, moderate=0.0, high=0.0, severe=0.0, no_travel=0.0, score=None):
    top = Level.LOW
    for mi, level in (
        (moderate, Level.MODERATE),
        (high, Level.HIGH),
        (severe, Level.SEVERE),
        (no_travel, Level.NO_TRAVEL),
    ):
        if mi:
            top = level
    return Summary(
        no_travel_mi=no_travel,
        severe_mi=severe,
        high_mi=high,
        moderate_mi=moderate,
        avg_risk=0.5,
        risk_score=score
        if score is not None
        else (
            moderate * LEVEL_WEIGHTS[Level.MODERATE]
            + high * LEVEL_WEIGHTS[Level.HIGH]
            + severe * LEVEL_WEIGHTS[Level.SEVERE]
            + no_travel * LEVEL_WEIGHTS[Level.NO_TRAVEL]
        ),
        max_level=top,
        duration_s=duration_s,
    )


def _route(name, duration_s, hazards=(), **summary):
    return RouteFacts(name, duration_s, _summary(duration_s, **summary), list(hazards))


def _kc_routes():
    return [
        _route(
            "I-70 W / I-470 W",
            29915,
            [
                Hazard(Level.MODERATE, "rain", 175, _eta("2026-10-15T10:23:25+00:00"), 50),
                Hazard(Level.MODERATE, "wind", 525, _eta("2026-10-15T15:01:58+00:00"), 50),
            ],
            moderate=50,
        ),
        _route("I-80 W / I-76 W", 34380, moderate=50),
        _route(
            "US-36 W / US-34 W",
            41242,
            [Hazard(Level.HIGH, "rain", 200, _eta("2026-10-15T11:27:22+00:00"), 25)],
            moderate=50,
            high=25,
        ),
    ]


def test_same_weather_on_kansas_city_denver_is_decided_by_time():
    out = explain(Recommendation(0, 1, "duration"), _kc_routes(), TZ)
    assert out["route_id"] == 0
    assert out["runner_up_id"] == 1
    assert out["decided_by"] == "duration"
    assert out["headline"] == "Take I-70 W / I-470 W"
    assert out["reason"] == "Same weather, 1 h 14 min faster."
    assert out["close_call"] is False
    assert out["time_vs_runner_up_s"] == -4465
    assert out["why_not"] == [
        {"route_id": 1, "text": "Arrives 1 h 14 min later.", "hazard": None},
        {
            "route_id": 2,
            "text": "Arrives 3 h 9 min later. High rain at mile 200 around 6:27 AM.",
            "hazard": "High rain at mile 200 around 6:27 AM.",
        },
    ]


def test_risk_score_reason_leads_with_the_biggest_saving():
    routes = [_route("Fast", 10000, high=130, severe=50), _route("Safe", 12760, severe=51)]
    out = explain(Recommendation(1, 0, "risk_score"), routes, TZ)
    assert out["reason"] == (
        "Less dangerous weather than Fast (459 vs 840 risk points): 130 fewer mi of High weather. "
        "It has 1 more mi of Severe weather, which counts for less. Adds 46 min."
    )
    assert out["close_call"] is False


def test_risk_score_reason_without_a_cost_has_one_sentence():
    routes = [_route("Fast", 10000, severe=30), _route("Slow", 10000, severe=25)]
    out = explain(Recommendation(1, 0, "risk_score"), routes, TZ)
    assert (
        out["reason"]
        == "Less dangerous weather than Fast (225 vs 270 risk points): 5 fewer mi of Severe weather."
    )


def test_risk_score_reason_never_says_zero_miles():
    routes = [_route("Fast", 10000, no_travel=0.4), _route("Slow", 10600)]
    out = explain(Recommendation(1, 0, "risk_score"), routes, TZ)
    assert out["reason"] == (
        "Less dangerous weather than Fast (0 vs 11 risk points): "
        "under 1 fewer mi of No Travel weather. Adds 10 min."
    )


def test_risk_score_reason_omits_a_zero_minute_gap():
    routes = [_route("Fast", 10000, high=25), _route("Safe", 10020)]
    out = explain(Recommendation(1, 0, "risk_score"), routes, TZ)
    assert (
        out["reason"]
        == "Less dangerous weather than Fast (0 vs 75 risk points): 25 fewer mi of High weather."
    )


def test_risk_score_reason_names_the_costliest_extra_level():
    routes = [_route("A", 10000, no_travel=10, moderate=5), _route("B", 10000, high=20, severe=10)]
    out = explain(Recommendation(1, 0, "risk_score"), routes, TZ)
    assert out["reason"] == (
        "Less dangerous weather than A (150 vs 275 risk points): 10 fewer mi of No Travel weather. "
        "It has 10 more mi of Severe weather, which counts for less."
    )


def test_duration_reason():
    routes = [_route("A", 11200), _route("B", 10000)]
    out = explain(Recommendation(1, 0, "duration"), routes, TZ)
    assert out["reason"] == "Same weather, 20 min faster."
    assert out["close_call"] is False


def test_near_tied_scores_are_a_close_call():
    routes = [_route("A", 11200, moderate=50), _route("B", 10000, moderate=58)]
    out = explain(Recommendation(1, 0, "duration"), routes, TZ)
    assert out["reason"] == "About the same weather as A (58 vs 50 risk points), 20 min faster."
    assert out["close_call"] is True


def test_near_tied_scores_with_equal_times_do_not_claim_speed():
    routes = [_route("A", 10000, moderate=50), _route("B", 10000, moderate=58)]
    out = explain(Recommendation(0, 1, "duration"), routes, TZ)
    assert out["reason"] == "About the same weather as B (50 vs 58 risk points), no slower."


def test_only_route():
    out = explain(Recommendation(0, None, None), [_route("A", 10000)], TZ)
    assert out["reason"] == "Only route available."
    assert out["runner_up_id"] is None
    assert out["decided_by"] is None
    assert out["time_vs_runner_up_s"] == 0
    assert out["why_not"] == []
    assert out["close_call"] is False


def test_full_tie():
    routes = [_route("A", 10000), _route("B", 10000)]
    out = explain(Recommendation(0, 1, None), routes, TZ)
    assert out["reason"] == "Tied with B on every criterion."
    assert out["close_call"] is False


def test_why_not_without_hazards():
    routes = [_route("A", 10000), _route("B", 10000)]
    out = explain(Recommendation(0, 1, None), routes, TZ)
    assert out["why_not"] == [{"route_id": 1, "text": "Arrives at the same time.", "hazard": None}]


def test_why_not_rounds_the_gap_in_minutes():
    for seconds, expected in ((20, "Arrives at the same time."), (40, "Arrives 1 min later.")):
        routes = [_route("A", 10000), _route("B", 10000 + seconds)]
        out = explain(Recommendation(0, 1, None), routes, TZ)
        assert out["why_not"][0]["text"] == expected
    routes = [_route("A", 10000), _route("B", 9960)]
    assert explain(Recommendation(0, 1, None), routes, TZ)["why_not"][0]["text"] == "Arrives 1 min sooner."

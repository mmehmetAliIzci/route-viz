from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from planner.explain import Hazard, RouteFacts, explain
from planner.ranking import Recommendation, Summary
from planner.rules import Level

TZ = ZoneInfo("America/Chicago")


def _eta(text: str) -> datetime:
    return datetime.fromisoformat(text).astimezone(UTC)


def _summary(duration_s, *, moderate=0.0, high=0.0, severe=0.0, no_travel=0.0, risk=0.5):
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
        avg_risk=risk,
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


def test_close_call_on_kansas_city_denver():
    out = explain(Recommendation(1, 0, "avg_risk"), _kc_routes(), TZ)
    assert out["route_id"] == 1
    assert out["runner_up_id"] == 0
    assert out["decided_by"] == "avg_risk"
    assert out["headline"] == "Take I-80 W / I-76 W"
    assert out["reason"] == (
        "Same weather as I-70 W / I-470 W. I-80 W / I-76 W scores slightly lower "
        "only because it is longer. I-70 W / I-470 W is 1 h 14 min faster."
    )
    assert out["close_call"] is True
    assert out["time_vs_runner_up_s"] == 4465
    assert out["why_not"] == [
        {
            "route_id": 0,
            "text": "Arrives 1 h 14 min sooner. Moderate rain at mile 175 around 5:23 AM.",
            "hazard": "Moderate rain at mile 175 around 5:23 AM.",
        },
        {
            "route_id": 2,
            "text": "Arrives 1 h 54 min later. High rain at mile 200 around 6:27 AM.",
            "hazard": "High rain at mile 200 around 6:27 AM.",
        },
    ]


def test_high_miles_reason_names_the_avoided_hazard():
    hazard = Hazard(Level.HIGH, "rain", 200, _eta("2026-10-15T11:27:22+00:00"), 25)
    routes = [
        _route("Fast", 10000, [hazard], high=25),
        _route("Safe", 12760),
    ]
    out = explain(Recommendation(1, 0, "high_mi"), routes, TZ)
    assert out["reason"] == "Avoids 25 mi of High rain at mile 200 around 6:27 AM. Adds 46 min."
    assert out["close_call"] is False


def test_moderate_miles_differ_is_not_a_close_call():
    routes = [_route("A", 10600, moderate=50), _route("B", 10000, moderate=25)]
    out = explain(Recommendation(1, 0, "avg_risk"), routes, TZ)
    assert out["reason"] == "Fewer Moderate miles (25 vs 50 mi). Saves 10 min."
    assert out["close_call"] is False


def test_duration_reason():
    routes = [_route("A", 11200), _route("B", 10000)]
    out = explain(Recommendation(1, 0, "duration"), routes, TZ)
    assert out["reason"] == "Same weather, 20 min faster."
    assert out["close_call"] is False


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


SEVERE = Hazard(Level.SEVERE, "wind", 100, _eta("2026-10-15T11:27:22+00:00"), 30)


def test_level_reason_with_miles_on_both_routes_is_a_comparison():
    routes = [_route("Fast", 10000, [SEVERE], severe=30), _route("Slow", 10000, severe=25)]
    out = explain(Recommendation(1, 0, "severe_mi"), routes, TZ)
    assert out["reason"] == "5 fewer mi of Severe weather than Fast (25 vs 30 mi)."


def test_level_reason_never_says_zero_miles():
    hazard = Hazard(Level.SEVERE, "wind", 100, _eta("2026-10-15T11:27:22+00:00"), 0.4)
    routes = [_route("Fast", 10000, [hazard], severe=0.4), _route("Slow", 10000)]
    out = explain(Recommendation(1, 0, "severe_mi"), routes, TZ)
    assert out["reason"] == "Avoids under 1 mi of Severe wind at mile 100 around 6:27 AM."


def test_level_reason_with_tiny_gap():
    routes = [_route("Fast", 10000, severe=30.2), _route("Slow", 10000, severe=29.9)]
    out = explain(Recommendation(1, 0, "severe_mi"), routes, TZ)
    assert out["reason"] == "Under 1 fewer mi of Severe weather than Fast (30 vs 30 mi)."


def test_no_travel_criterion():
    hazard = Hazard(Level.NO_TRAVEL, "ice", 80, _eta("2026-10-15T11:27:22+00:00"), 10)
    routes = [_route("Fast", 10000, [hazard], no_travel=10), _route("Safe", 10600)]
    out = explain(Recommendation(1, 0, "no_travel_mi"), routes, TZ)
    assert out["reason"] == "Avoids 10 mi of No Travel ice at mile 80 around 6:27 AM. Adds 10 min."


def test_level_reason_omits_a_zero_minute_gap():
    hazard = Hazard(Level.HIGH, "rain", 200, _eta("2026-10-15T11:27:22+00:00"), 25)
    routes = [_route("Fast", 10000, [hazard], high=25), _route("Safe", 10020)]
    out = explain(Recommendation(1, 0, "high_mi"), routes, TZ)
    assert out["reason"] == "Avoids 25 mi of High rain at mile 200 around 6:27 AM."


def test_moderate_branch_omits_a_zero_minute_gap():
    routes = [_route("A", 10020, moderate=50), _route("B", 10000, moderate=25)]
    out = explain(Recommendation(1, 0, "avg_risk"), routes, TZ)
    assert out["reason"] == "Fewer Moderate miles (25 vs 50 mi)."


def test_equal_moderate_close_call_omits_a_zero_minute_gap():
    routes = [_route("A", 10000, moderate=50), _route("B", 10020, moderate=50)]
    out = explain(Recommendation(1, 0, "avg_risk"), routes, TZ)
    assert out["reason"] == "Same weather as A. B scores slightly lower only because it is longer."
    assert out["close_call"] is True


def test_best_faster_close_call():
    routes = [_route("A", 11200, moderate=50), _route("B", 10000, moderate=50)]
    out = explain(Recommendation(1, 0, "avg_risk"), routes, TZ)
    assert out["reason"].endswith(" B is also 20 min faster.")
    assert out["close_call"] is True


def test_more_moderate_miles_is_a_close_call():
    routes = [_route("A", 10000, moderate=50), _route("B", 11200, moderate=60)]
    out = explain(Recommendation(1, 0, "avg_risk"), routes, TZ)
    assert out["reason"] == (
        "B scores slightly lower only because it is longer. "
        "It has more Moderate miles (60 vs 50 mi). A is 20 min faster."
    )
    assert out["close_call"] is True


def test_more_moderate_miles_and_best_faster():
    routes = [_route("A", 11200, moderate=50), _route("B", 10000, moderate=60)]
    out = explain(Recommendation(1, 0, "avg_risk"), routes, TZ)
    assert out["reason"].endswith("It has more Moderate miles (60 vs 50 mi). B is also 20 min faster.")


def test_why_not_rounds_the_gap_in_minutes():
    for seconds, expected in ((20, "Arrives at the same time."), (40, "Arrives 1 min later.")):
        routes = [_route("A", 10000), _route("B", 10000 + seconds)]
        out = explain(Recommendation(0, 1, None), routes, TZ)
        assert out["why_not"][0]["text"] == expected
    routes = [_route("A", 10000), _route("B", 9960)]
    assert explain(Recommendation(0, 1, None), routes, TZ)["why_not"][0]["text"] == "Arrives 1 min sooner."

"""The whole plan on recorded Kansas City to Denver responses (TomTom and Open-Meteo)."""

import base64

import pytest

from planner import explain, ranking
from planner.rules import Level
from tests.recorded import build_kc_den

LEVELS = {lv.name.lower() for lv in Level}


@pytest.fixture(scope="module")
def kc_den() -> dict:
    return build_kc_den()


def test_three_routes_with_checkpoints_every_25_miles(kc_den: dict) -> None:
    assert len(kc_den["routes"]) == 3
    for r in kc_den["routes"]:
        cps = r["checkpoints"]
        assert [c["mile"] for c in cps[:3]] == [0, 25, 50]
        assert cps[-1]["mile"] == pytest.approx(r["distance_mi"], abs=0.1)
        assert {c["level"] for c in cps} <= LEVELS
        assert cps[0]["eta_utc"] == kc_den["trip"]["departure_utc"]
        assert cps[-1]["eta_utc"] == r["arrival_utc"]


def test_summary_miles_never_exceed_the_route(kc_den: dict) -> None:
    for r in kc_den["routes"]:
        s = r["summary"]
        assert s["no_travel_mi"] + s["severe_mi"] + s["high_mi"] <= r["distance_mi"] + 0.1
        assert 0 <= s["avg_risk"] <= 4


def test_recommendation_matches_the_summaries(kc_den: dict) -> None:
    summaries = [
        ranking.Summary(
            no_travel_mi=r["summary"]["no_travel_mi"],
            severe_mi=r["summary"]["severe_mi"],
            high_mi=r["summary"]["high_mi"],
            moderate_mi=r["summary"]["moderate_mi"],
            avg_risk=r["summary"]["avg_risk"],
            max_level=Level.LOW,
            duration_s=r["duration_s"],
        )
        for r in kc_den["routes"]
    ]
    assert kc_den["recommendation"]["route_id"] == ranking.recommend(summaries).index


def test_recommendation_is_explained(kc_den: dict) -> None:
    rec, routes = kc_den["recommendation"], kc_den["routes"]
    assert set(rec) == {
        "route_id", "runner_up_id", "decided_by", "time_vs_runner_up_s",
        "headline", "reason", "why_not", "close_call",
    }  # fmt: skip
    assert len(rec["why_not"]) == len(routes) - 1
    assert rec["headline"] == f"Take {routes[rec['route_id']]['name']}"
    assert all("moderate_mi" in r["summary"] for r in routes)


def test_heatmap_has_one_byte_per_node_per_hour(kc_den: dict) -> None:
    h = kc_den["heatmap"]
    assert h["hours"] == 49
    assert h["start_utc"] == kc_den["trip"]["departure_utc"]
    mask = base64.b64decode(h["mask"])
    assert len(mask) == h["nx"] * h["ny"]
    assert sum(mask) == kc_den["weather"]["locations"] <= 200
    for kind, ch in h["channels"].items():
        data = base64.b64decode(ch["data"])
        assert len(data) == h["hours"] * h["ny"] * h["nx"], kind
    assert max(base64.b64decode(h["channels"]["risk"]["data"])) <= 4


def test_route_lines_are_simplified_and_time_zone_is_central(kc_den: dict) -> None:
    for r in kc_den["routes"]:
        assert 100 < len(r["geometry"]) < 3500
    assert kc_den["trip"]["origin_tz"] == "America/Chicago"


def test_text_uses_the_viewer_zone_not_the_origin_zone(monkeypatch: pytest.MonkeyPatch) -> None:
    zones = []
    real = explain.explain
    monkeypatch.setattr(
        explain, "explain", lambda rec, facts, tz: zones.append(str(tz)) or real(rec, facts, tz)
    )
    body = build_kc_den("America/Denver")
    assert zones == ["America/Denver"]
    assert body["trip"]["viewer_tz"] == "America/Denver"
    assert body["trip"]["origin_tz"] == "America/Chicago"
    assert build_kc_den()["trip"]["viewer_tz"] == "UTC"


def test_checkpoint_etas_count_from_the_exact_departure(kc_den: dict) -> None:
    # The router gets the departure floored to 15 minutes; ETAs must not.
    assert kc_den["routes"][0]["checkpoints"][0]["eta_utc"] == kc_den["trip"]["departure_utc"]

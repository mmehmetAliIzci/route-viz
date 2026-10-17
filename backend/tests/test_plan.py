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
        "headline", "reason", "why_not", "close_call", "leave_later",
    }  # fmt: skip
    assert rec["leave_later"] is None  # the recorded day was clear, so waiting changes nothing
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


def test_a_forecast_without_direction_sends_no_direction(kc_den: dict) -> None:
    def strip(hourly: dict) -> None:
        hourly.pop("wind_direction_10m", None)

    body = build_kc_den(patch_hourly=strip)
    assert "demo" not in body and "demo" not in kc_den
    assert body["weather"]["model"] == "icon_seamless"
    assert all("wind_dir_deg" not in c for r in body["routes"] for c in r["checkpoints"])
    assert set(body["heatmap"]["channels"]) == {"risk", "wind", "rain", "snow"}


def test_a_forecast_with_direction_sends_it_on_checkpoints_and_heatmap() -> None:
    def from_west(hourly: dict) -> None:
        hourly["wind_direction_10m"] = [268.0] * len(hourly["time"])

    body = build_kc_den(patch_hourly=from_west)
    assert {c["wind_dir_deg"] for r in body["routes"] for c in r["checkpoints"]} == {268}
    h = body["heatmap"]
    ch = h["channels"]["wind_dir"]
    assert ch["scale"] == 2.0
    mask = base64.b64decode(h["mask"])
    data = base64.b64decode(ch["data"])
    assert len(data) == h["hours"] * h["ny"] * h["nx"]
    assert {b for k, b in enumerate(data) if mask[k % len(mask)]} == {134}
    assert {b for k, b in enumerate(data) if not mask[k % len(mask)]} == {0}


@pytest.fixture(scope="module")
def kc_den_wind() -> dict:
    return build_kc_den(demo="wind")


def test_demo_plan_uses_synthetic_weather_without_open_meteo(kc_den: dict, kc_den_wind: dict) -> None:
    assert kc_den_wind["demo"] == ["wind"]
    assert kc_den_wind["weather"] == {
        "model": "demo",
        "source": "Demo weather (synthetic, not a forecast)",
        "grid_step_deg": kc_den["weather"]["grid_step_deg"],
        "locations": kc_den["weather"]["locations"],
    }
    assert kc_den_wind["heatmap"]["mask"] == kc_den["heatmap"]["mask"]  # the same lean layout
    assert [r["geometry"] for r in kc_den_wind["routes"]] == [r["geometry"] for r in kc_den["routes"]]
    levels = [c["level"] for r in kc_den_wind["routes"] for c in r["checkpoints"]]
    assert any(lv != "low" for lv in levels)


def test_demo_plan_has_wind_direction(kc_den_wind: dict) -> None:
    h = kc_den_wind["heatmap"]
    ch = h["channels"]["wind_dir"]
    assert ch["scale"] == 2.0
    data = base64.b64decode(ch["data"])
    assert len(data) == h["hours"] * h["ny"] * h["nx"]
    mask = base64.b64decode(h["mask"])
    on = [b for k, b in enumerate(data) if mask[k % (h["nx"] * h["ny"])]]
    assert all(90 <= b <= 135 for b in on)  # 180 to 270 degrees, around south-west
    for r in kc_den_wind["routes"]:
        for c in r["checkpoints"]:
            assert isinstance(c["wind_dir_deg"], int) and 0 <= c["wind_dir_deg"] <= 359


def test_demo_recommendation_matches_the_summaries(kc_den_wind: dict) -> None:
    test_recommendation_matches_the_summaries(kc_den_wind)
    test_recommendation_is_explained(kc_den_wind)
    test_summary_miles_never_exceed_the_route(kc_den_wind)


def test_leave_later_is_null_or_an_improvement_with_a_fixed_shape() -> None:
    # The demo front sweeps the whole corridor, so a trip meets it whenever it leaves; the field
    # is then null. When it is not null it must beat the current departure on No Travel miles.
    body = build_kc_den(demo="wind")
    waiting = body["recommendation"]["leave_later"]
    best = next(r for r in body["routes"] if r["id"] == body["recommendation"]["route_id"])
    if waiting is not None:
        assert waiting["shift_h"] in (3, 6, 12, 24)
        assert waiting["no_travel_mi"] <= best["summary"]["no_travel_mi"]
        assert set(waiting) == {"shift_h", "departure_utc", "no_travel_mi", "severe_mi", "high_mi", "max_level"}

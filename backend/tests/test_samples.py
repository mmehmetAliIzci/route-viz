"""Saved trips keep the same explained recommendation the live plan would give."""

import json
from copy import deepcopy
from pathlib import Path

import pytest

from planner import samples
from scripts.refresh_explanations import refresh

FRONTEND_FIXTURE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "test" / "plan-kc-den.json"
PATHS = [*sorted(samples.SAMPLES_DIR.glob("*.json")), FRONTEND_FIXTURE]


@pytest.mark.parametrize(
    ("sample_id", "reason"),
    [
        ("kansas-city-denver", "Same weather, 1 h 21 min faster."),
        ("chicago-nashville", "Same weather, 42 min faster."),
    ],
)
def test_saved_trips_were_recorded_in_clear_weather_with_wind_direction(sample_id: str, reason: str) -> None:
    """Recorded 2026-10-17: both trips saw only low risk, so the faster route wins outright."""
    body = samples.get(sample_id)
    rec = body["recommendation"]
    assert rec["route_id"] == 0
    assert rec["decided_by"] == "duration"
    assert rec["close_call"] is False
    assert rec["reason"] == reason
    assert "wind_dir" in body["heatmap"]["channels"]
    assert all("wind_dir_deg" in c for r in body["routes"] for c in r["checkpoints"])


@pytest.mark.parametrize("path", PATHS, ids=lambda p: Path(p).stem)
def test_saved_plan_is_fresh(path: Path) -> None:
    """A plan whose stored explanation differs from a refresh was not refreshed after a copy change."""
    stored = json.loads(path.read_text())
    assert refresh(deepcopy(stored)) == stored, f"run scripts/refresh_explanations.py for {path.name}"


def test_a_saved_plan_can_be_explained_in_another_zone() -> None:
    stored = samples.get("kansas-city-denver")
    before = deepcopy(stored)
    denver = samples.in_zone(stored, "America/Denver")
    assert stored == before  # the shared copy is untouched
    assert denver["trip"]["viewer_tz"] == "America/Denver"
    assert samples.in_zone(stored, None)["trip"]["viewer_tz"] == stored["trip"]["origin_tz"]
    assert samples.in_zone(stored, None)["recommendation"] == stored["recommendation"]
    # The recording is clear weather, so its text carries no clock time. Give the runner-up
    # one moderate hazard: the hour in its "why not" line must then follow the zone.
    rainy = deepcopy(stored)
    runner_up = rainy["routes"][stored["recommendation"]["runner_up_id"]]
    runner_up["checkpoints"][5] |= {"level": "moderate", "cause": "rain"}
    chicago = samples.in_zone(rainy, None)["recommendation"]
    denver = samples.in_zone(rainy, "America/Denver")["recommendation"]
    assert chicago["route_id"] == denver["route_id"] == stored["recommendation"]["route_id"]
    hazards = [[w["hazard"] for w in rec["why_not"]] for rec in (chicago, denver)]
    assert all("Moderate rain at mile 125 around " in (h[0] or "") for h in hazards)
    assert hazards[0] != hazards[1]


def test_unknown_zone_is_rejected() -> None:
    with pytest.raises(ValueError):
        samples.in_zone(samples.get("kansas-city-denver"), "Mars/Olympus")


@pytest.mark.parametrize("sample_id", ["kansas-city-denver", "chicago-nashville"])
def test_a_saved_plan_can_be_rescored_against_demo_weather(sample_id: str) -> None:
    stored = samples.get(sample_id)
    before = deepcopy(stored)
    wind = samples.with_demo(stored, "wind", None)
    assert stored == before  # the shared copy is untouched
    assert wind["demo"] == ["wind"]
    assert wind["sample"] == stored["sample"]
    assert wind["trip"] == stored["trip"] | {"viewer_tz": stored["trip"]["origin_tz"]}
    assert wind["weather"]["source"] == "Demo weather (synthetic, not a forecast)"
    for new, old in zip(wind["routes"], stored["routes"], strict=True):
        for key in ("id", "name", "distance_mi", "duration_s", "arrival_utc", "geometry"):
            assert new[key] == old[key], key
        assert [(c["mile"], c["lon"], c["lat"], c["eta_utc"]) for c in new["checkpoints"]] == [
            (c["mile"], c["lon"], c["lat"], c["eta_utc"]) for c in old["checkpoints"]
        ]
        assert all("wind_dir_deg" in c for c in new["checkpoints"])
    levels = [[c["level"] for c in r["checkpoints"]] for r in wind["routes"]]
    assert levels != [[c["level"] for c in r["checkpoints"]] for r in stored["routes"]]
    assert {lv for r in levels for lv in r} >= {"moderate", "high", "no_travel"}
    assert samples.with_demo(stored, "wind", "America/Denver")["trip"]["viewer_tz"] == "America/Denver"


def test_wind_and_rain_together_score_the_worse_of_the_two() -> None:
    stored = samples.get("kansas-city-denver")
    both = samples.with_demo(stored, ("wind", "rain"), None)
    assert both["demo"] == ["wind", "rain"]
    wind = samples.with_demo(stored, "wind", None)
    rain = samples.with_demo(stored, "rain", None)
    rank = {"low": 0, "moderate": 1, "high": 2, "severe": 3, "no_travel": 4}
    for b, w, r in zip(both["routes"], wind["routes"], rain["routes"], strict=True):
        for cb, cw, cr in zip(b["checkpoints"], w["checkpoints"], r["checkpoints"], strict=True):
            assert cb["wind_mph"] == cw["wind_mph"] and cb["rain_in_hr"] == cr["rain_in_hr"]
            assert rank[cb["level"]] == max(rank[cw["level"]], rank[cr["level"]])


def test_demo_rescoring_rejects_unknown_input() -> None:
    stored = samples.get("kansas-city-denver")
    with pytest.raises(ValueError):
        samples.with_demo(stored, "wind", "Mars/Olympus")
    with pytest.raises(ValueError):
        samples.with_demo(stored, "hail", None)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        samples.with_demo(stored, (), None)

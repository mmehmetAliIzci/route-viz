"""Saved trips keep the same explained recommendation the live plan would give."""

import json
from copy import deepcopy
from pathlib import Path

import pytest

from planner import samples
from scripts.refresh_explanations import refresh

FRONTEND_FIXTURE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "test" / "plan-kc-den.json"
PATHS = [*sorted(samples.SAMPLES_DIR.glob("*.json")), FRONTEND_FIXTURE]


def test_saved_kansas_city_denver_is_a_close_call() -> None:
    rec = samples.get("kansas-city-denver")["recommendation"]
    assert rec["route_id"] == 1
    assert rec["decided_by"] == "avg_risk"
    assert rec["close_call"] is True
    assert rec["reason"] == (
        "Same weather as I-70 W / I-470 W. I-80 W / I-76 W scores slightly lower "
        "only because it is longer. I-70 W / I-470 W is 1 h 14 min faster."
    )


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
    assert denver["recommendation"] != stored["recommendation"]


def test_unknown_zone_is_rejected() -> None:
    with pytest.raises(ValueError):
        samples.in_zone(samples.get("kansas-city-denver"), "Mars/Olympus")


@pytest.mark.parametrize("sample_id", ["kansas-city-denver", "chicago-nashville"])
def test_a_saved_plan_can_be_rescored_against_demo_weather(sample_id: str) -> None:
    stored = samples.get(sample_id)
    before = deepcopy(stored)
    wind = samples.with_demo(stored, "wind", None)
    assert stored == before  # the shared copy is untouched
    assert wind["demo"] == "wind"
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


def test_demo_rescoring_rejects_unknown_input() -> None:
    stored = samples.get("kansas-city-denver")
    with pytest.raises(ValueError):
        samples.with_demo(stored, "wind", "Mars/Olympus")
    with pytest.raises(ValueError):
        samples.with_demo(stored, "hail", None)  # type: ignore[arg-type]

"""The recorded Kansas City to Denver trip, built into a plan without any network."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from planner import http, plan

FIX = Path(__file__).parent / "fixtures"


def kc_den_trip(tomtom: dict) -> plan.Trip:
    return plan.Trip(
        origin=plan.Place("Kansas City, MO", -94.5786, 39.0997),
        destination=plan.Place("Denver, CO", -104.9903, 39.7392),
        departure=datetime.fromisoformat(tomtom["_recorded"]["departure_utc"]),
        load_lb=tomtom["_recorded"]["load_lb"],
        spacing_mi=25,
    )


def build_kc_den(viewer_tz: str = "UTC") -> dict[str, Any]:
    tomtom = json.loads((FIX / "tomtom_route_kc_den.json").read_text())
    grid = json.loads((FIX / "open_meteo_kc_den_grid.json").read_text())

    def fake_get(provider: str, url: str, params: dict, deadline: object = None) -> object:
        return tomtom if provider == "tomtom" else grid

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(http, "get_json", fake_get)
        return plan.build(kc_den_trip(tomtom), api_key="unused", viewer_tz=viewer_tz)

"""The recorded Kansas City to Denver trip, built into a plan without any network."""

import json
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from planner import http, plan, routing, weather
from planner.demo import Scenario

FIX = Path(__file__).parent / "fixtures"


def kc_den_trip(tomtom: dict) -> plan.Trip:
    return plan.Trip(
        origin=plan.Place("Kansas City, MO", -94.5786, 39.0997),
        destination=plan.Place("Denver, CO", -104.9903, 39.7392),
        departure=datetime.fromisoformat(tomtom["_recorded"]["departure_utc"]),
        load_lb=tomtom["_recorded"]["load_lb"],
        spacing_mi=25,
    )


def build_kc_den(
    viewer_tz: str = "UTC",
    demo: Scenario | None = None,
    patch_hourly: Callable[[dict], None] | None = None,
) -> dict[str, Any]:
    """With `demo`, any Open-Meteo call fails the build: demo weather must not fetch.

    `patch_hourly` may change each location's recorded `hourly` block before it is parsed.
    """
    tomtom = json.loads((FIX / "tomtom_route_kc_den.json").read_text())
    grid = json.loads((FIX / "open_meteo_kc_den_grid.json").read_text())
    for location in grid if patch_hourly else []:
        patch_hourly(location["hourly"])

    # The recording holds every grid node in route_grid's order; a chunked request gets the
    # bodies for the coordinates it asked for.
    lines = [r.geometry for r in routing.parse(tomtom)]
    lay = weather.layout(lines)
    order = {
        (f"{lay.south + (k // lay.nx) * lay.step:.4f}", f"{lay.west + (k % lay.nx) * lay.step:.4f}"): n
        for n, k in enumerate(sorted(lay.nodes))
    }

    def fake_get(provider: str, url: str, params: dict, deadline: object = None) -> object:
        if provider == "tomtom":
            return tomtom
        if demo is not None:
            raise AssertionError(f"demo plan called {provider}")
        asked = zip(params["latitude"].split(","), params["longitude"].split(","), strict=True)
        return [grid[order[coord]] for coord in asked]

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(http, "get_json", fake_get)
        return plan.build(kc_den_trip(tomtom), api_key="unused", viewer_tz=viewer_tz, demo=demo)

"""Builds a plan for a trip: routes, checkpoints, levels, summaries, recommendation and heatmap."""

import base64
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache
from typing import Any

from timezonefinder import TimezoneFinder

from planner import demo as demo_weather
from planner import explain, ranking, routing, rules, sampling, weather
from planner.http import Deadline
from planner.sampling import LonLat

SIMPLIFY_MI = 0.25  # route lines sent to the browser keep a point at least this often
BUDGET_S = 25  # a plan that takes longer fails as plan_timeout
HEATMAP_HOURS = 49  # hours 0 to 48

log = logging.getLogger("planner")

# Heatmap channels: one byte per node per hour, value = round(quantity / scale), capped at 255.
# wind_dir (degrees the wind blows from, 0..180 bytes) is sent only when the grid has direction.
HEATMAP_SCALES = {"risk": 1.0, "wind": 0.5, "rain": 0.005, "snow": 0.02, "wind_dir": 2.0}
OPTIONAL_CHANNELS = {"wind_dir"}
DEMO_SOURCE = "Demo weather (synthetic, not a forecast)"


@dataclass(frozen=True)
class Place:
    label: str
    lon: float
    lat: float


@dataclass(frozen=True)
class Trip:
    origin: Place
    destination: Place
    departure: datetime  # timezone-aware
    load_lb: int
    spacing_mi: int


@dataclass(frozen=True)
class RouteShape:
    """A route before weather: what scoring needs, with `geometry` already simplified for output."""

    index: int
    name: str
    distance_mi: float
    duration_s: float
    arrival: datetime
    geometry: list[LonLat]
    checkpoints: list[sampling.Checkpoint]


def build(
    trip: Trip,
    api_key: str,
    viewer_tz: str = "UTC",
    deadline: Deadline | None = None,
    demo: demo_weather.Scenario | None = None,
) -> dict[str, Any]:
    """The plan for a trip, its text in the viewer's time zone (an IANA name).

    With `demo`, the weather is a synthetic front (planner/demo.py) and Open-Meteo is not called.
    """
    started = time.monotonic()
    explain.zone(viewer_tz)  # fail on a bad zone before any provider call
    deadline = deadline or Deadline.after(BUDGET_S)
    o, d = trip.origin, trip.destination
    found = routing.routes((o.lon, o.lat), (d.lon, d.lat), trip.departure, trip.load_lb, api_key, deadline)

    shapes = [
        RouteShape(
            index=i,
            name=r.name,
            distance_mi=r.distance_mi,
            duration_s=r.duration_s,
            arrival=trip.departure + timedelta(seconds=r.duration_s),
            geometry=simplify(r.geometry),
            checkpoints=sampling.checkpoints(r.geometry, r.profile, trip.spacing_mi, trip.departure),
        )
        for i, r in enumerate(found)
    ]
    lines = [r.geometry for r in found]
    if demo is not None:
        grid = demo_weather.grid(weather.layout(lines), trip.departure, HEATMAP_HOURS, demo)
    else:
        last_eta = max(c.eta for s in shapes for c in s.checkpoints)
        end = max(last_eta, trip.departure + timedelta(hours=HEATMAP_HOURS - 1))
        grid = weather.route_grid(lines, trip.departure, end, deadline)

    body = {
        "trip": {
            "origin": _place_json(o),
            "destination": _place_json(d),
            "departure_utc": _iso(trip.departure),
            "load_lb": trip.load_lb,
            "spacing_mi": trip.spacing_mi,
            "origin_tz": origin_tz(o.lon, o.lat),
            "viewer_tz": viewer_tz,
        },
        **score(trip, shapes, grid, viewer_tz, demo),
    }
    if demo is not None:
        body["demo"] = demo
    log.info("plan_built ms=%d routes=%d", round((time.monotonic() - started) * 1000), len(found))
    return body


def score(
    trip: Trip,
    shapes: Sequence[RouteShape],
    grid: weather.Grid,
    viewer_tz: str = "UTC",
    demo: demo_weather.Scenario | None = None,
) -> dict[str, Any]:
    """The routes, recommendation, weather and heatmap sections for routes read against `grid`.

    Uses the trip's departure and load. Raises ValueError for an unknown `viewer_tz`.
    """
    tz = explain.zone(viewer_tz)
    routes_out, summaries, facts = [], [], []
    for shape in shapes:
        rows, scored, hazards = [], [], []
        for c in shape.checkpoints:
            w = grid.at(c.lon, c.lat, c.eta)
            a = rules.classify(w.wind_mph, w.rain_in_hr, w.snow_in_hr, trip.load_lb)
            scored.append(ranking.Scored(a.level, c.owned_mi))
            if a.level > rules.Level.LOW:
                hazards.append(explain.Hazard(a.level, a.cause, c.mile, c.eta, c.owned_mi))
            rows.append(_checkpoint_json(c, w, a))
        summary = ranking.summarize(scored, shape.duration_s)
        summaries.append(summary)
        facts.append(explain.RouteFacts(shape.name, shape.duration_s, summary, hazards))
        routes_out.append(_route_json(shape, rows, summary))

    if demo is not None:
        source = {"model": "demo", "source": DEMO_SOURCE}
    else:
        source = {"model": weather.MODEL, "source": "Open-Meteo (CC BY 4.0)"}
    return {
        "routes": routes_out,
        "recommendation": explain.explain(ranking.recommend(summaries), facts, tz),
        "weather": {**source, "grid_step_deg": grid.step, "locations": len(grid.series)},
        "heatmap": encode_heatmap(grid, trip.load_lb),
    }


def encode_heatmap(grid: weather.Grid, load_lb: int) -> dict[str, Any]:
    kinds = [k for k in HEATMAP_SCALES if k not in OPTIONAL_CHANNELS or grid.has_direction]
    channels = {kind: bytearray() for kind in kinds}
    for hour in range(HEATMAP_HOURS):
        for w in grid.frame(hour):
            if w is None:
                for kind in channels:
                    channels[kind].append(0)
                continue
            level = rules.classify(w.wind_mph, w.rain_in_hr, w.snow_in_hr, load_lb).level
            values = {
                "risk": int(level),
                "wind": w.wind_mph,
                "rain": w.rain_in_hr,
                "snow": w.snow_in_hr,
                "wind_dir": w.dir_deg or 0.0,
            }
            for kind in kinds:
                channels[kind].append(min(255, max(0, round(values[kind] / HEATMAP_SCALES[kind]))))
    return {
        "west": grid.west,
        "south": grid.south,
        "step_deg": grid.step,
        "nx": grid.nx,
        "ny": grid.ny,
        "hours": HEATMAP_HOURS,
        "start_utc": _iso(grid.start),
        "layout": "hour, then row south to north, then column west to east",
        # 1 where a node was fetched; 0 nodes are off the corridor and drawn transparent
        "mask": base64.b64encode(bytes(int(k in grid.series) for k in range(grid.nx * grid.ny))).decode(),
        "channels": {
            kind: {"scale": HEATMAP_SCALES[kind], "data": base64.b64encode(bytes(data)).decode()}
            for kind, data in channels.items()
        },
    }


@cache
def _tz_finder() -> TimezoneFinder:
    return TimezoneFinder()


def origin_tz(lon: float, lat: float) -> str:
    return _tz_finder().timezone_at(lng=lon, lat=lat) or "UTC"


def simplify(geometry: list[LonLat]) -> list[LonLat]:
    """Drop points closer than SIMPLIFY_MI to the last kept one; always keep both ends."""
    cum = sampling.cumulative_miles(geometry)
    kept, last = [geometry[0]], 0.0
    for p, m in zip(geometry[1:-1], cum[1:-1], strict=True):
        if m - last >= SIMPLIFY_MI:
            kept.append(p)
            last = m
    kept.append(geometry[-1])
    return kept


def _route_json(r: RouteShape, checkpoints: list[dict], s: ranking.Summary) -> dict[str, Any]:
    return {
        "id": r.index,
        "name": r.name,
        "distance_mi": round(r.distance_mi, 1),
        "duration_s": round(r.duration_s),
        "arrival_utc": _iso(r.arrival),
        "geometry": [[round(lon, 5), round(lat, 5)] for lon, lat in r.geometry],
        "checkpoints": checkpoints,
        "summary": {
            "no_travel_mi": round(s.no_travel_mi, 1),
            "severe_mi": round(s.severe_mi, 1),
            "high_mi": round(s.high_mi, 1),
            "moderate_mi": round(s.moderate_mi, 1),
            "avg_risk": round(s.avg_risk, 2),
            "max_level": _level(s.max_level),
        },
    }


def _checkpoint_json(c: sampling.Checkpoint, w: weather.Weather, a: rules.Assessment) -> dict[str, Any]:
    out = {
        "mile": round(c.mile, 1),
        "lon": round(c.lon, 5),
        "lat": round(c.lat, 5),
        "eta_utc": _iso(c.eta),
        "wind_mph": round(w.wind_mph, 1),
        "gust_mph": round(w.gust_mph, 1),
        "rain_in_hr": round(w.rain_in_hr, 3),
        "snow_in_hr": round(w.snow_in_hr, 2),
        "level": _level(a.level),
        "cause": a.cause,
    }
    if w.dir_deg is not None:
        out["wind_dir_deg"] = round(w.dir_deg) % 360
    return out


def _place_json(p: Place) -> dict[str, Any]:
    return {"label": p.label, "lon": p.lon, "lat": p.lat}


def _level(level: rules.Level) -> str:
    return level.name.lower()


def _iso(t: datetime) -> str:
    return t.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")

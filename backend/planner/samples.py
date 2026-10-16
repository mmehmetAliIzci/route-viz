"""Saved trips: real plans recorded earlier, served when a live plan is not possible.

Each file in data/samples/<id>.json is a plan exactly as /api/plan returned it, plus a
"sample" object with its id, label and recording time.
"""

import json
from copy import deepcopy
from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from planner import explain, ranking, sampling
from planner.rules import Level

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "data" / "samples"


@cache
def _load_all() -> dict[str, dict[str, Any]]:
    plans = {}
    for path in sorted(SAMPLES_DIR.glob("*.json")):
        body = json.loads(path.read_text())
        plans[body["sample"]["id"]] = body
    return plans


def listing() -> list[dict[str, str]]:
    return [p["sample"] for p in _load_all().values()]


def get(sample_id: str) -> dict[str, Any] | None:
    return _load_all().get(sample_id)


def refresh(body: dict[str, Any], tz: ZoneInfo | None = None) -> dict[str, Any]:
    """Set routes[].summary.moderate_mi and recommendation from the stored checkpoints.

    The text is written in `tz`, the origin's zone when None. Changes `body` and returns it.
    Raises ValueError when the recommended route would change.
    """
    tz = tz or explain.zone(body["trip"]["origin_tz"])
    summaries, facts = [], []
    for route in body["routes"]:
        cps = route["checkpoints"]
        owned = sampling.owned_miles([c["mile"] for c in cps])
        scored, hazards = [], []
        for c, mi in zip(cps, owned, strict=True):
            level = Level[c["level"].upper()]
            scored.append(ranking.Scored(level, mi))
            if level > Level.LOW:
                eta = datetime.fromisoformat(c["eta_utc"])
                hazards.append(explain.Hazard(level, c["cause"], c["mile"], eta, mi))
        summary = ranking.summarize(scored, route["duration_s"])
        summaries.append(summary)
        facts.append(explain.RouteFacts(route["name"], route["duration_s"], summary, hazards))

    story = explain.explain(ranking.recommend(summaries), facts, tz)
    stored = body.get("recommendation", {}).get("route_id")
    if story["route_id"] != stored:
        raise ValueError(f"recommended route would change from {stored} to {story['route_id']}")

    for route, summary in zip(body["routes"], summaries, strict=True):
        route["summary"]["moderate_mi"] = round(summary.moderate_mi, 1)
    body["recommendation"] = story
    return body


def in_zone(body: dict[str, Any], tz_name: str | None) -> dict[str, Any]:
    """A copy of a saved plan explained in the time zone `tz_name` (origin's when None).

    Sets trip.viewer_tz. Raises ValueError for an unknown zone.
    """
    name = tz_name or body["trip"]["origin_tz"]
    out = refresh(deepcopy(body), explain.zone(name))
    out["trip"]["viewer_tz"] = name
    return out

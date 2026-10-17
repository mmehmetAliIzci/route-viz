"""Plain-language reasons for the recommended route.

Pure text and arithmetic: no I/O, no Django. The copy here is the product
copy, so change it with care.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from planner.ranking import LEVEL_WEIGHTS, Recommendation, Summary
from planner.rules import Cause, Level


@dataclass(frozen=True)
class Hazard:
    """A checkpoint above Low."""

    level: Level
    cause: Cause
    mile: float
    eta: datetime
    owned_mi: float


@dataclass(frozen=True)
class RouteFacts:
    name: str
    duration_s: float
    summary: Summary
    hazards: list[Hazard]  # in mile order


_LEVEL_WORDS: dict[Level, str] = {
    Level.LOW: "Low",
    Level.MODERATE: "Moderate",
    Level.HIGH: "High",
    Level.SEVERE: "Severe",
    Level.NO_TRAVEL: "No Travel",
}

# The levels the risk-score sentence compares, worst first, with the Summary field holding their miles.
_COMPARED: list[tuple[Level, str]] = [
    (Level.NO_TRAVEL, "no_travel_mi"),
    (Level.SEVERE, "severe_mi"),
    (Level.HIGH, "high_mi"),
    (Level.MODERATE, "moderate_mi"),
]


def zone(name: str) -> ZoneInfo:
    """The IANA time zone called `name`; ValueError when there is none."""
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        raise ValueError(f"Unknown time zone: {name}") from None


def _duration(seconds: float) -> str:
    minutes = round(abs(seconds) / 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours} h {minutes} min" if hours else f"{minutes} min"


def _clock(moment: datetime, tz: ZoneInfo) -> str:
    # Round in UTC so a DST change never shifts the minute.
    rounded = (moment + timedelta(seconds=30)).replace(second=0, microsecond=0)
    local = rounded.astimezone(tz)
    return f"{local.hour % 12 or 12}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'}"


def _where(hazard: Hazard, tz: ZoneInfo) -> str:
    return (
        f"{_LEVEL_WORDS[hazard.level]} {hazard.cause} at mile {round(hazard.mile)} "
        f"around {_clock(hazard.eta, tz)}"
    )


def _mi(miles: float) -> str:
    """Whole miles, or 'under 1' when it would round to 0."""
    return str(round(miles)) if round(miles) else "under 1"


def _minutes(delta_s: float) -> int:
    return round(delta_s / 60)


def _time_change(delta_s: float) -> str:
    """' Adds 46 min.' / ' Saves 10 min.' / '' for a signed best-minus-runner gap."""
    if _minutes(delta_s) > 0:
        return f" Adds {_duration(delta_s)}."
    if _minutes(delta_s) < 0:
        return f" Saves {_duration(delta_s)}."
    return ""


def _reason(
    rec: Recommendation, best: RouteFacts, runner: RouteFacts | None, tz: ZoneInfo
) -> tuple[str, bool]:
    """The reason text and whether it is a close call."""
    if runner is None or rec.runner_up is None:
        return "Only route available.", False
    if rec.decided_by is None:
        return f"Tied with {runner.name} on every criterion.", False

    delta_s = best.duration_s - runner.duration_s
    a, b = round(best.summary.risk_score), round(runner.summary.risk_score)

    if rec.decided_by == "risk_score":
        # Miles the winner saves (+) or adds (-) at each level, and the weighted points they are worth.
        gaps = [
            (level, getattr(runner.summary, field) - getattr(best.summary, field))
            for level, field in _COMPARED
        ]
        saved = [(level, miles, miles * LEVEL_WEIGHTS[level]) for level, miles in gaps]
        level, miles, _ = max(saved, key=lambda x: x[2])
        text = (
            f"Less dangerous weather than {runner.name} ({a} vs {b} risk points): "
            f"{_mi(miles)} fewer mi of {_LEVEL_WORDS[level]} weather."
        )
        cost_level, cost_miles, cost_points = min(saved, key=lambda x: x[2])
        if cost_points < 0:
            more = f"{_mi(-cost_miles)} more mi of {_LEVEL_WORDS[cost_level]} weather"
            text += f" It has {more}, which counts for less."
        return text + _time_change(delta_s), False

    # duration
    if best.summary.risk_score == runner.summary.risk_score:
        return f"Same weather, {_faster(delta_s)}.", False
    return f"About the same weather as {runner.name} ({a} vs {b} risk points), {_faster(delta_s)}.", True


def _faster(delta_s: float) -> str:
    """'20 min faster', or a seconds-level phrase when the gap rounds to 0 minutes."""
    if _minutes(delta_s) < 0:
        return f"{_duration(delta_s)} faster"
    return "a few seconds faster" if delta_s < 0 else "no slower"


def _why_not(route: RouteFacts, best: RouteFacts, tz: ZoneInfo) -> tuple[str, str | None]:
    """The 'why not' text and its hazard sentence, None when the route has no hazards."""
    delta_s = route.duration_s - best.duration_s
    if _minutes(delta_s) < 0:
        text = f"Arrives {_duration(delta_s)} sooner."
    elif _minutes(delta_s) > 0:
        text = f"Arrives {_duration(delta_s)} later."
    else:
        text = "Arrives at the same time."
    hazard = None
    if route.hazards:
        # Highest level wins; max() keeps the earliest among ties.
        worst = max(route.hazards, key=lambda h: h.level)
        hazard = f"{_where(worst, tz)}."
        text += f" {hazard}"
    return text, hazard


def explain(rec: Recommendation, routes: Sequence[RouteFacts], tz: ZoneInfo) -> dict[str, Any]:
    best = routes[rec.index]
    runner = routes[rec.runner_up] if rec.runner_up is not None else None
    reason, close_call = _reason(rec, best, runner, tz)
    return {
        "route_id": rec.index,
        "runner_up_id": rec.runner_up,
        "decided_by": rec.decided_by,
        "time_vs_runner_up_s": round(best.duration_s - runner.duration_s) if runner else 0,
        "headline": f"Take {best.name}",
        "reason": reason,
        "why_not": [
            {"route_id": i, "text": text, "hazard": hazard}
            for i, r in enumerate(routes)
            if i != rec.index
            for text, hazard in [_why_not(r, best, tz)]
        ],
        "close_call": close_call,
    }

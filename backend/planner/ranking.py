"""Route summaries and the PDF recommendation order.

PDF order: fewest Severe miles, fewest High miles, lowest average risk,
shortest travel time. One addition: No Travel miles are compared first,
so a route with No Travel conditions never beats one without.

Average risk is the mile-weighted mean of checkpoint levels
(Low 0, Moderate 1, High 2, Severe 3, No Travel 4).
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

from planner.rules import Level


@dataclass(frozen=True)
class Scored:
    """A checkpoint's level and the miles it stands for."""

    level: Level
    owned_mi: float


@dataclass(frozen=True)
class Summary:
    no_travel_mi: float
    severe_mi: float
    high_mi: float
    moderate_mi: float
    avg_risk: float
    max_level: Level
    duration_s: float


Criterion = Literal["no_travel_mi", "severe_mi", "high_mi", "avg_risk", "duration"]


@dataclass(frozen=True)
class Recommendation:
    """Best route, the runner-up, and the first criterion that separated them."""

    index: int
    runner_up: int | None
    decided_by: Criterion | None


def summarize(scored: Sequence[Scored], duration_s: float) -> Summary:
    def miles_at(level: Level) -> float:
        return sum(s.owned_mi for s in scored if s.level == level)

    total = sum(s.owned_mi for s in scored)
    weighted = sum(int(s.level) * s.owned_mi for s in scored)
    return Summary(
        no_travel_mi=miles_at(Level.NO_TRAVEL),
        severe_mi=miles_at(Level.SEVERE),
        high_mi=miles_at(Level.HIGH),
        moderate_mi=miles_at(Level.MODERATE),
        avg_risk=weighted / total if total else 0.0,
        max_level=max((s.level for s in scored), default=Level.LOW),
        duration_s=duration_s,
    )


# (criterion, key) in priority order. Miles round to 0.1 and risk to 0.01 so
# float noise never decides a tie.
_CRITERIA: list[tuple[Criterion, Callable[[Summary], float]]] = [
    ("no_travel_mi", lambda s: round(s.no_travel_mi, 1)),
    ("severe_mi", lambda s: round(s.severe_mi, 1)),
    ("high_mi", lambda s: round(s.high_mi, 1)),
    ("avg_risk", lambda s: round(s.avg_risk, 2)),
    ("duration", lambda s: round(s.duration_s)),
]


def _sort_key(s: Summary) -> tuple:
    return tuple(key(s) for _, key in _CRITERIA)


def recommend(summaries: Sequence[Summary]) -> Recommendation:
    """Best route by the PDF order, with the criterion that beat the runner-up."""
    if not summaries:
        raise ValueError("no routes to rank")
    order = sorted(range(len(summaries)), key=lambda i: _sort_key(summaries[i]))
    best = order[0]
    if len(order) == 1:
        return Recommendation(best, None, None)

    runner = order[1]
    for criterion, key in _CRITERIA:
        if key(summaries[best]) != key(summaries[runner]):
            return Recommendation(best, runner, criterion)
    return Recommendation(best, runner, None)

"""Route summaries and the recommendation.

Each route gets risk points: its owned miles at each level times that level's weight, summed.
The lowest score wins, except that scores within a near-tie of each other are decided by
travel time. This departs from the assessment's ordered list on purpose: a strict order lets
one extra Severe mile outweigh 130 extra High miles.

Average risk is the mile-weighted mean of checkpoint levels
(Low 0, Moderate 1, High 2, Severe 3, No Travel 4). It is shown, not ranked on.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from planner.rules import Level

# Risk points per owned mile, each level three times the one below.
LEVEL_WEIGHTS: dict[Level, int] = {
    Level.LOW: 0,
    Level.MODERATE: 1,
    Level.HIGH: 3,
    Level.SEVERE: 9,
    Level.NO_TRAVEL: 27,
}
NEAR_TIE_POINTS = 10  # scores this close are a tie whatever their size
NEAR_TIE_SHARE = 0.05  # on big scores, a tie is within this share of the higher one


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
    risk_score: float
    max_level: Level
    duration_s: float


Criterion = Literal["risk_score", "duration"]


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
        risk_score=round(sum(LEVEL_WEIGHTS[s.level] * s.owned_mi for s in scored), 1),
        max_level=max((s.level for s in scored), default=Level.LOW),
        duration_s=duration_s,
    )


def near_tied(a: float, b: float) -> bool:
    """Whether two risk scores are too close to rank on risk alone."""
    gap = round(abs(a - b), 1)
    return gap <= round(max(NEAR_TIE_POINTS, NEAR_TIE_SHARE * max(a, b)), 1)


def recommend(summaries: Sequence[Summary]) -> Recommendation:
    """The route with the least risk, or the quickest of those near-tied with it; and the runner-up."""
    if not summaries:
        raise ValueError("no routes to rank")
    # Scores and seconds round so float noise never decides a tie.
    scores = [round(s.risk_score, 1) for s in summaries]
    seconds = [round(s.duration_s) for s in summaries]

    def pick(candidates: list[int]) -> int:
        """The quickest route near-tied with the lowest score among `candidates`."""
        lowest = min(scores[i] for i in candidates)
        tied = [i for i in candidates if near_tied(scores[i], lowest)]
        return min(tied, key=lambda i: (seconds[i], scores[i], i))

    everyone = list(range(len(summaries)))
    best = pick(everyone)
    if len(everyone) == 1:
        return Recommendation(best, None, None)

    runner = pick([i for i in everyone if i != best])
    if not near_tied(scores[best], scores[runner]):
        return Recommendation(best, runner, "risk_score")
    if scores[best] == scores[runner] and seconds[best] == seconds[runner]:
        return Recommendation(best, runner, None)
    return Recommendation(best, runner, "duration")

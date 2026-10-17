"""Would leaving later help? The recommended route rescored at later departures on the same grid.

The forecast grid already covers 48 hours, so trying later departures costs no provider call:
every checkpoint keeps its position and its travel time from the origin, only the clock moves.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from planner import ranking, rules, sampling, weather
from planner.rules import Level

SHIFTS_H = (3, 6, 12, 24)  # how much later to try, smallest first
WORTH_WAITING_FROM = Level.HIGH  # below this the current departure is fine as it is


@dataclass(frozen=True)
class LaterDeparture:
    shift_h: int
    departure: datetime
    summary: ranking.Summary


def leave_later(
    checkpoints: list[sampling.Checkpoint],
    duration_s: float,
    grid: weather.Grid,
    load_lb: int,
    departure: datetime,
    now: ranking.Summary,
) -> LaterDeparture | None:
    """The smallest later departure with a lower risk score than `now`, and not a near-tie with it.

    None when the route is already Moderate or better, or when no shift the grid still
    covers improves on it.
    """
    if now.max_level < WORTH_WAITING_FROM or not checkpoints:
        return None
    last_eta = max(c.eta for c in checkpoints)
    for hours in SHIFTS_H:
        delta = timedelta(hours=hours)
        if last_eta + delta > grid.end():
            break  # the forecast does not reach that far
        scored = []
        for c in checkpoints:
            w = grid.at(c.lon, c.lat, c.eta + delta)
            scored.append(
                ranking.Scored(
                    rules.classify(w.wind_mph, w.rain_in_hr, w.snow_in_hr, load_lb).level, c.owned_mi
                )
            )
        later = ranking.summarize(scored, duration_s)
        if later.risk_score < now.risk_score and not ranking.near_tied(later.risk_score, now.risk_score):
            return LaterDeparture(hours, departure + delta, later)
    return None

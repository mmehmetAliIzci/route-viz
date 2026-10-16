"""Risk and load rules from the assessment PDF.

Band edges: a value equal to a lower bound belongs to the higher band
(25 mph is Moderate, 0.25 in/hr is High). The PDF writes No Travel as
"≥55" for wind but ">1.00" and ">3.0" for rain and snow, so 1.00 in/hr
rain and 3.0 in/hr snow are still Severe.
"""

from dataclasses import dataclass
from enum import IntEnum
from typing import Literal


class Level(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


Cause = Literal["wind", "rain", "snow"]


@dataclass(frozen=True)
class Assessment:
    level: Level
    cause: Cause | None  # None when the level is Low


def wind_level(mph: float, load_lb: float) -> Level:
    if mph >= 55:
        return Level.NO_TRAVEL
    if mph >= 45:
        return Level.NO_TRAVEL if load_lb > 30_000 else Level.SEVERE
    if mph >= 35:
        return Level.SEVERE if load_lb > 40_000 else Level.HIGH
    if mph >= 25:
        return Level.MODERATE
    return Level.LOW


def rain_level(in_hr: float) -> Level:
    if in_hr > 1.00:
        return Level.NO_TRAVEL
    if in_hr >= 0.50:
        return Level.SEVERE
    if in_hr >= 0.25:
        return Level.HIGH
    if in_hr >= 0.10:
        return Level.MODERATE
    return Level.LOW


def snow_level(in_hr: float) -> Level:
    if in_hr > 3.0:
        return Level.NO_TRAVEL
    if in_hr >= 2.0:
        return Level.SEVERE
    if in_hr >= 1.0:
        return Level.HIGH
    if in_hr >= 0.5:
        return Level.MODERATE
    return Level.LOW


def classify(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Assessment:
    """Worst level across wind, rain and snow. Ties name the first cause in that order."""
    candidates: list[tuple[Level, Cause]] = [
        (wind_level(wind_mph, load_lb), "wind"),
        (rain_level(rain_in_hr), "rain"),
        (snow_level(snow_in_hr), "snow"),
    ]
    level, cause = max(candidates, key=lambda c: c[0])  # max keeps the first of equal keys
    return Assessment(level, cause if level > Level.LOW else None)

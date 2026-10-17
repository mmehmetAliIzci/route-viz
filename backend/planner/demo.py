"""Demo weather: a deterministic synthetic front on the same lean grid a forecast would use.

Not a forecast. It exists so the app can show every risk level on any trip, any day.
One front, a Gaussian band, sweeps along the corridor's longer axis from just outside
one edge at hour 0 to just outside the far edge at the last hour. Its centre line is
tilted across the corridor, so parallel routes meet it at different times.
"""

import math
from datetime import datetime
from typing import Literal

from planner import weather

Scenario = Literal["wind", "rain", "snow"]
SCENARIOS: tuple[Scenario, ...] = ("wind", "rain", "snow")
Scenarios = tuple[Scenario, ...]  # one or more, in SCENARIOS order, no repeats


def normalize(scenario: "Scenario | Scenarios") -> Scenarios:
    """One scenario or several as a tuple in SCENARIOS order. ValueError when unknown or empty."""
    names = (scenario,) if isinstance(scenario, str) else tuple(scenario)
    if not names or any(n not in SCENARIOS for n in names):
        raise ValueError(f"unknown demo scenario: {scenario}")
    return tuple(s for s in SCENARIOS if s in names)


def parse(text: str) -> Scenarios:
    """Scenarios from a request value such as "wind,rain". ValueError when unknown or empty."""
    names = [part.strip() for part in text.split(",") if part.strip()]
    unknown = [n for n in names if n not in SCENARIOS]
    if unknown or not names:
        raise ValueError(f"Unknown demo weather. Use any of: {', '.join(SCENARIOS)}, comma-separated.")
    return tuple(s for s in SCENARIOS if s in names)


MARGIN = 0.1  # the front centre starts and ends this far outside the corridor (fraction of its length)
HALF_WIDTH = 0.25  # distance at which the band is at half strength (fraction of the corridor length)
TILT = 0.2  # the centre line leans this far along the corridor between its two sides
GUST_FACTOR = 1.3


def grid(layout: weather.Layout, start: datetime, hours: int, scenario: Scenario | Scenarios) -> weather.Grid:
    """Hourly synthetic weather for every node in `layout`, hour 0 at `start`.

    Several scenarios ride the same front: wind and rain together make a storm whose risk at
    each point is the worse of the two, which is how the rules combine them.
    """
    scenarios = normalize(scenario)
    where = {k: (layout.west + (k % layout.nx) * layout.step, layout.south + (k // layout.nx) * layout.step)
             for k in layout.nodes}  # fmt: skip
    lons = [lon for lon, _ in where.values()]
    lats = [lat for _, lat in where.values()]
    # Compare extents in ground distance, so a degree of longitude counts for less up north.
    shrink = math.cos(math.radians((min(lats) + max(lats)) / 2))
    along_lon = (max(lons) - min(lons)) * shrink >= max(lats) - min(lats)

    def normalized(lon: float, lat: float) -> tuple[float, float]:
        """(along, across) in [0, 1] over the corridor's longer and shorter axes."""
        x = (lon - min(lons)) / max(max(lons) - min(lons), layout.step)
        y = (lat - min(lats)) / max(max(lats) - min(lats), layout.step)
        return (x, y) if along_lon else (y, x)

    t0 = int(start.timestamp())
    series = {}
    for k, (lon, lat) in where.items():
        along, across = normalized(lon, lat)
        band = [_band(along, across, h, hours) for h in range(hours)]
        series[k] = _series(scenarios, band, across, t0)
    return weather.Grid(layout.west, layout.south, layout.step, layout.nx, layout.ny, start, series)


def _band(along: float, across: float, hour: int, hours: int) -> float:
    """Front strength at a point, 1 on the centre line, 0.5 at HALF_WIDTH from it."""
    progress = hour / max(hours - 1, 1)
    centre = -MARGIN + (1 + 2 * MARGIN) * progress + TILT * (2 * across - 1)
    d = (along - centre) / HALF_WIDTH
    return math.exp(-math.log(2) * d * d)


def _series(scenarios: Scenarios, band: list[float], across: float, t0: int) -> weather.Series:
    n = len(band)
    if "wind" in scenarios:
        wind = [8 + (52 - 8) * b for b in band]
        # From the south-west, veering smoothly across the corridor so streamlines curve.
        direction = 225 + 30 * math.sin(math.pi * (across - 0.5))
    elif "rain" in scenarios:
        wind, direction = [12.0] * n, 180.0  # a steady southerly under the rain
    else:
        wind, direction = [15.0] * n, 315.0  # a north-westerly carrying the snow
    return weather.Series(
        t0=t0,
        wind_mph=wind,
        gust_mph=[w * GUST_FACTOR for w in wind],
        rain_in_hr=[0.02 + (0.85 - 0.02) * b for b in band] if "rain" in scenarios else [0.0] * n,
        snow_in_hr=[2.6 * b for b in band] if "snow" in scenarios else [0.0] * n,
        dir_deg=[direction] * n,
    )

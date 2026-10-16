"""Checkpoints every N miles along a route, with the truck's ETA at each.

Checkpoints sit at mile 0, N, 2N, ... and at the destination. Each one
"owns" the miles halfway to its neighbours, so owned miles add up to the
route length and the short last gap is not over-counted.

ETA comes from a time profile: (mile, seconds since departure) pairs from
the router, one per maneuver. Between two pairs the truck is assumed to
hold a constant speed.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

EARTH_RADIUS_MI = 3958.8

LonLat = tuple[float, float]
TimeProfile = list[tuple[float, float]]  # (mile, seconds since departure), mile ascending


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    lon: float
    lat: float
    eta: datetime
    owned_mi: float


def haversine_mi(a: LonLat, b: LonLat) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def cumulative_miles(geometry: list[LonLat]) -> list[float]:
    miles = [0.0]
    for a, b in zip(geometry, geometry[1:], strict=False):
        miles.append(miles[-1] + haversine_mi(a, b))
    return miles


def point_at(geometry: list[LonLat], cum: list[float], mile: float) -> LonLat:
    """Linear interpolation between the two vertices around `mile`."""
    for i in range(1, len(cum)):
        if cum[i] >= mile:
            seg = cum[i] - cum[i - 1]
            t = 0.0 if seg == 0 else (mile - cum[i - 1]) / seg
            (lon0, lat0), (lon1, lat1) = geometry[i - 1], geometry[i]
            return lon0 + t * (lon1 - lon0), lat0 + t * (lat1 - lat0)
    return geometry[-1]


def seconds_at(profile: TimeProfile, mile: float) -> float:
    """Linear interpolation in the profile; clamps outside its first and last mile."""
    if mile <= profile[0][0]:
        return profile[0][1]
    for (m0, t0), (m1, t1) in zip(profile, profile[1:], strict=False):
        if mile <= m1:
            return t0 if m1 == m0 else t0 + (mile - m0) / (m1 - m0) * (t1 - t0)
    return profile[-1][1]


def owned_miles(marks: Sequence[float]) -> list[float]:
    """Half the gap to each neighbour; the two ends own only one side."""
    return [
        ((mile - marks[i - 1]) / 2 if i > 0 else 0.0)
        + ((marks[i + 1] - mile) / 2 if i + 1 < len(marks) else 0.0)
        for i, mile in enumerate(marks)
    ]


def checkpoints(
    geometry: list[LonLat], profile: TimeProfile, spacing_mi: float, departure: datetime
) -> list[Checkpoint]:
    if len(geometry) < 2:
        raise ValueError("route geometry needs at least two points")
    if spacing_mi <= 0:
        raise ValueError("spacing_mi must be positive")
    if not profile:
        raise ValueError("time profile is empty")

    cum = cumulative_miles(geometry)
    total = cum[-1]
    marks = [i * spacing_mi for i in range(math.floor(total / spacing_mi) + 1)]
    if total - marks[-1] > 1e-9:
        marks.append(total)

    result = []
    for mile, owned in zip(marks, owned_miles(marks), strict=True):
        lon, lat = point_at(geometry, cum, mile)
        eta = departure + timedelta(seconds=seconds_at(profile, mile))
        result.append(Checkpoint(mile=mile, lon=lon, lat=lat, eta=eta, owned_mi=owned))
    return result

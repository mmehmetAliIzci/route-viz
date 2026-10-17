"""Hourly forecasts from Open-Meteo on one lean grid around the routes (docs/adr/0001).

Units are requested metric and converted here. Open-Meteo's `rain`, `showers` and
`snowfall` are sums over the preceding hour, so the value stamped 15:00 is the
rate from 14:00 to 15:00; it is treated as the rate at 14:30. Wind is instantaneous
at the stamp. Values between stamps are interpolated linearly.

Wind direction is meteorological (degrees the wind blows FROM, 0 = north) and optional:
older recordings lack it, and then it is None. Direction is interpolated through the
wind vector (u, v), never by averaging degrees, so 350 and 10 meet at 0, not 180.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from planner.http import Deadline, ProviderError, cached_json

URL = "https://api.open-meteo.com/v1/forecast"
MODEL = "icon_seamless"  # DWD ICON, the model Zoom Earth shows
VARIABLES = ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "rain", "showers", "snowfall"]
MAX_LOCATIONS = 1000  # per request
MPH_PER_KMH = 0.621371
IN_PER_MM = 1 / 25.4
IN_PER_CM = 1 / 2.54


@dataclass(frozen=True)
class Weather:
    wind_mph: float
    gust_mph: float
    rain_in_hr: float
    snow_in_hr: float
    dir_deg: float | None = None  # where the wind blows from, 0-359; None when unknown


@dataclass(frozen=True)
class Series:
    """One location's hourly forecast in PDF units. `t0` is the first stamp (unix seconds)."""

    t0: int
    wind_mph: list[float]
    gust_mph: list[float]
    rain_in_hr: list[float]
    snow_in_hr: list[float]
    dir_deg: list[float] | None = None  # None when the forecast had no direction

    def at(self, when: datetime) -> Weather:
        h = (when.timestamp() - self.t0) / 3600
        direction = None
        if self.dir_deg is not None:
            i, f = _index(len(self.dir_deg), h)
            pairs = [(self.dir_deg[i], self.wind_mph[i], 1 - f)]
            if f:
                pairs.append((self.dir_deg[i + 1], self.wind_mph[i + 1], f))
            direction = mean_direction(pairs)
        return Weather(
            wind_mph=_lerp(self.wind_mph, h),
            gust_mph=_lerp(self.gust_mph, h),
            rain_in_hr=_lerp(self.rain_in_hr, h + 0.5),  # stamp T is the hour ending at T
            snow_in_hr=_lerp(self.snow_in_hr, h + 0.5),
            dir_deg=direction,
        )


def _index(n: int, h: float) -> tuple[int, float]:
    """The stamp at or before fractional index h and the fraction past it, clamped to the ends."""
    if n == 1:
        return 0, 0.0
    h = min(max(h, 0.0), n - 1.0)
    i = min(int(h), n - 2)
    return i, h - i


def _lerp(values: list[float], h: float) -> float:
    """Value at fractional index h, clamped to the ends."""
    i, f = _index(len(values), h)
    return values[i] if not f else values[i] + f * (values[i + 1] - values[i])


def mean_direction(parts: Sequence[tuple[float, float, float]]) -> float:
    """Weighted mean of (direction_deg, speed, weight) through the wind vector, in [0, 360).

    Calm winds carry no direction of their own, so when the speed-weighted vectors cancel
    (or every speed is 0) the plain unit-vector mean is used instead.
    """
    for use_speed in (True, False):
        u = v = 0.0
        for deg, speed, w in parts:
            r = math.radians(deg)
            m = speed if use_speed else 1.0
            u -= w * m * math.sin(r)
            v -= w * m * math.cos(r)
        if math.hypot(u, v) > 1e-9:
            deg = math.degrees(math.atan2(-u, -v)) % 360
            return deg if deg < 360 else 0.0  # a hair below 0 wraps to exactly 360.0
    return parts[0][0] % 360 if parts else 0.0


def hour_window(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    """Whole UTC hours covering [start, end], with one spare hour each side for interpolation."""
    first = start.astimezone(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    last = end.astimezone(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(hours=2)
    return first, last


def fetch_series(
    locations: Sequence[tuple[float, float]],
    start: datetime,
    end: datetime,
    deadline: Deadline | None = None,
) -> list[Series]:
    """Hourly series for each (lon, lat), covering [start, end]. One request per 1,000 locations."""
    first, last = hour_window(start, end)
    out: list[Series] = []
    for i in range(0, len(locations), MAX_LOCATIONS):
        chunk = locations[i : i + MAX_LOCATIONS]
        params = {
            "latitude": ",".join(f"{lat:.4f}" for _, lat in chunk),
            "longitude": ",".join(f"{lon:.4f}" for lon, _ in chunk),
            "hourly": ",".join(VARIABLES),
            "models": MODEL,
            "start_hour": first.strftime("%Y-%m-%dT%H:%M"),
            "end_hour": last.strftime("%Y-%m-%dT%H:%M"),
            "timezone": "GMT",
            "timeformat": "unixtime",
        }
        body = cached_json("open_meteo", URL, params, deadline)
        out.extend(parse(body if isinstance(body, list) else [body]))
    return out


def parse(bodies: list[dict[str, Any]]) -> list[Series]:
    return [_series(b["hourly"]) for b in bodies]


def _series(hourly: dict[str, Any]) -> Series:
    def col(name: str, factor: float) -> list[float]:
        values = hourly.get(name)
        if values is None or any(v is None for v in values):
            raise ProviderError("weather_missing", f"Forecast is missing {name} for part of the route")
        return [v * factor for v in values]

    rain = col("rain", IN_PER_MM)
    showers = col("showers", IN_PER_MM)
    direction = hourly.get("wind_direction_10m")  # optional: older recordings lack it
    if direction is not None and any(v is None for v in direction):
        direction = None
    return Series(
        t0=int(hourly["time"][0]),
        wind_mph=col("wind_speed_10m", MPH_PER_KMH),
        gust_mph=col("wind_gusts_10m", MPH_PER_KMH),
        rain_in_hr=[r + s for r, s in zip(rain, showers, strict=True)],
        snow_in_hr=col("snowfall", IN_PER_CM),
        dir_deg=None if direction is None else [float(v) % 360 for v in direction],
    )


@dataclass(frozen=True)
class Grid:
    """Forecast on a lon/lat lattice; only nodes near the routes are fetched.

    Node (i, j) sits at (west + i*step, south + j*step); index k = j*nx + i.
    """

    west: float
    south: float
    step: float
    nx: int
    ny: int
    start: datetime  # hour 0 is the departure itself
    series: dict[int, Series]  # fetched nodes only

    def at(self, lon: float, lat: float, when: datetime) -> Weather:
        """Bilinear in space between the four nodes around (lon, lat), linear in time."""
        x = (lon - self.west) / self.step
        y = (lat - self.south) / self.step
        i, j = min(int(x), self.nx - 2), min(int(y), self.ny - 2)
        fx, fy = x - i, y - j
        corners = [
            (i, j, (1 - fx) * (1 - fy)),
            (i + 1, j, fx * (1 - fy)),
            (i, j + 1, (1 - fx) * fy),
            (i + 1, j + 1, fx * fy),
        ]
        parts = []
        for ci, cj, w in corners:
            node = self.series.get(cj * self.nx + ci)
            if node is None:
                raise ProviderError("weather_missing", "No forecast grid around part of the route")
            parts.append((node.at(when), w))
        direction = None
        if all(p.dir_deg is not None for p, _ in parts):
            direction = mean_direction([(p.dir_deg, p.wind_mph, w) for p, w in parts if w > 0])
        return Weather(
            wind_mph=sum(p.wind_mph * w for p, w in parts),
            gust_mph=sum(p.gust_mph * w for p, w in parts),
            rain_in_hr=sum(p.rain_in_hr * w for p, w in parts),
            snow_in_hr=sum(p.snow_in_hr * w for p, w in parts),
            dir_deg=direction,
        )

    @property
    def has_direction(self) -> bool:
        """True when every fetched node carries wind direction."""
        return bool(self.series) and all(s.dir_deg is not None for s in self.series.values())

    def frame(self, hour: int) -> list[Weather | None]:
        """Every node at departure + hour, row-major; None where nothing was fetched."""
        when = self.start + timedelta(hours=hour)
        return [self.series[k].at(when) if k in self.series else None for k in range(self.nx * self.ny)]


STEPS_DEG = (0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 1.0)
MAX_NODES = 200


@dataclass(frozen=True)
class Layout:
    west: float
    south: float
    step: float
    nx: int
    ny: int
    nodes: frozenset[int]


def layout(lines: Sequence[Sequence[tuple[float, float]]], max_nodes: int = MAX_NODES) -> Layout:
    """The finest step whose route nodes fit the budget.

    Nodes are the four corners of every cell a route passes through (so any point on a
    route can be interpolated), plus a ring of neighbours when the budget allows.
    """
    for step in STEPS_DEG:
        corners = _route_nodes(lines, step, ring=False)
        if len(corners.nodes) > max_nodes:
            continue
        ringed = _route_nodes(lines, step, ring=True)
        return ringed if len(ringed.nodes) <= max_nodes else corners
    return _route_nodes(lines, STEPS_DEG[-1], ring=False)


def _route_nodes(lines: Sequence[Sequence[tuple[float, float]]], step: float, ring: bool) -> Layout:
    lons = [lon for line in lines for lon, _ in line]
    lats = [lat for line in lines for _, lat in line]
    west = (math.floor(min(lons) / step) - 1) * step
    south = (math.floor(min(lats) / step) - 1) * step
    nx = math.floor((max(lons) - west) / step) + 3
    ny = math.floor((max(lats) - south) / step) + 3
    reach = range(-1, 3) if ring else range(0, 2)
    nodes: set[int] = set()
    for line in lines:
        for (lon0, lat0), (lon1, lat1) in zip(line, line[1:], strict=False):
            # sample each segment finely enough not to skip a cell
            n = max(1, math.ceil(max(abs(lon1 - lon0), abs(lat1 - lat0)) / (step / 4)))
            for t in range(n + 1):
                lon, lat = lon0 + (lon1 - lon0) * t / n, lat0 + (lat1 - lat0) * t / n
                i, j = int((lon - west) / step), int((lat - south) / step)
                for di in reach:
                    for dj in reach:
                        ii, jj = i + di, j + dj
                        if 0 <= ii < nx and 0 <= jj < ny:
                            nodes.add(jj * nx + ii)
    return Layout(round(west, 6), round(south, 6), step, nx, ny, frozenset(nodes))


def route_grid(
    lines: Sequence[Sequence[tuple[float, float]]],
    start: datetime,
    end: datetime,
    deadline: Deadline | None = None,
) -> Grid:
    """Fetch the lean grid around the routes, covering [start, end]."""
    lay = layout(lines)
    ks = sorted(lay.nodes)
    locations = [(lay.west + (k % lay.nx) * lay.step, lay.south + (k // lay.nx) * lay.step) for k in ks]
    series = fetch_series(locations, start, end, deadline)
    return Grid(lay.west, lay.south, lay.step, lay.nx, lay.ny, start, dict(zip(ks, series, strict=True)))

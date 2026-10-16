"""Three truck routes from TomTom Calculate Route, with a time profile for ETAs.

The router gets gross weight: load weight plus an assumed empty truck.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from planner.http import Deadline, ProviderError, cached_json
from planner.sampling import LonLat, TimeProfile, cumulative_miles

URL = "https://api.tomtom.com/routing/1/calculateRoute/{locations}/json"
EMPTY_TRUCK_LB = 35_000
KG_PER_LB = 0.45359237
DEPARTURE_BUCKET = timedelta(minutes=15)


@dataclass(frozen=True)
class Route:
    name: str  # main roads, e.g. "I-70 / I-35"
    geometry: list[LonLat]
    distance_mi: float
    duration_s: float
    profile: TimeProfile


def depart_at(departure: datetime, now: datetime) -> str:
    """The next 15-minute mark (UTC) at or after the departure, or "now" once that mark has passed.

    TomTom refuses a departAt in the past, and rounding keeps one cached answer per bucket.
    """
    step = DEPARTURE_BUCKET.total_seconds()
    mark = datetime.fromtimestamp(-(-departure.timestamp() // step) * step, UTC)
    return "now" if mark <= now else mark.isoformat(timespec="seconds")


def request_params(
    departure: datetime, load_lb: float, api_key: str, now: datetime | None = None
) -> dict[str, Any]:
    return {
        "key": api_key,
        "travelMode": "truck",
        "vehicleCommercial": "true",
        "vehicleWeight": round((load_lb + EMPTY_TRUCK_LB) * KG_PER_LB),
        "maxAlternatives": 2,
        "routeType": "fastest",
        "traffic": "true",
        "departAt": depart_at(departure, now or datetime.now(UTC)),
        "instructionsType": "coded",
    }


def routes(
    origin: LonLat,
    dest: LonLat,
    departure: datetime,
    load_lb: float,
    api_key: str,
    deadline: Deadline | None = None,
) -> list[Route]:
    (olon, olat), (dlon, dlat) = origin, dest
    url = URL.format(locations=f"{olat},{olon}:{dlat},{dlon}")
    body = cached_json("tomtom", url, request_params(departure, load_lb, api_key), deadline)
    return parse(body)


def parse(body: dict[str, Any]) -> list[Route]:
    raw = body.get("routes") or []
    if not raw:
        raise ProviderError("no_route", "No truck route found between these places")
    return [_route(r) for r in raw]


def _route(r: dict[str, Any]) -> Route:
    geometry = [(p["longitude"], p["latitude"]) for leg in r["legs"] for p in leg["points"]]
    duration = float(r["summary"]["travelTimeInSeconds"])
    cum = cumulative_miles(geometry)
    instructions = r.get("guidance", {}).get("instructions", [])

    profile: TimeProfile = [(0.0, 0.0)]
    for ins in sorted(instructions, key=lambda i: i["pointIndex"]):
        _append(profile, (cum[ins["pointIndex"]], float(ins["travelTimeInSeconds"])))
    _append(profile, (cum[-1], duration))

    return Route(
        name=_name(instructions, cum),
        geometry=geometry,
        # Geometry length, not TomTom's lengthInMeters (about 0.2 percent apart), so a
        # route's owned miles add up to the distance the UI shows.
        distance_mi=cum[-1],
        duration_s=duration,
        profile=profile,
    )


def _append(profile: TimeProfile, point: tuple[float, float]) -> None:
    """Keep the profile ascending in both miles and seconds; drop exact repeats."""
    last = profile[-1]
    if point != last and point[0] >= last[0] and point[1] >= last[1]:
        profile.append(point)


def _name(instructions: list[dict[str, Any]], cum: list[float]) -> str:
    """The two road numbers the route spends the most miles on after a maneuver."""
    miles: Counter[str] = Counter()
    ordered = sorted(instructions, key=lambda i: i["pointIndex"])
    for ins, nxt in zip(ordered, ordered[1:], strict=False):
        for road in ins.get("roadNumbers", [])[:1]:
            miles[road] += cum[nxt["pointIndex"]] - cum[ins["pointIndex"]]
    top = [road for road, _ in miles.most_common(2)]
    return " / ".join(top) if top else "Local roads"

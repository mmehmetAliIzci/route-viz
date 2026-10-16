"""US place search for the trip form (TomTom Fuzzy Search in typeahead mode)."""

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from planner.http import get_json

URL = "https://api.tomtom.com/search/2/search/{query}.json"


@dataclass(frozen=True)
class Place:
    label: str
    lon: float
    lat: float


def search(text: str, api_key: str, limit: int = 5) -> list[Place]:
    params = {"key": api_key, "typeahead": "true", "countrySet": "US", "limit": limit}
    body = get_json("tomtom", URL.format(query=quote(text.strip(), safe="")), params)
    return parse(body)


def parse(body: dict[str, Any]) -> list[Place]:
    places = []
    for r in body.get("results", []):
        label = r.get("poi", {}).get("name") or r.get("address", {}).get("freeformAddress")
        pos = r.get("position")
        if label and pos:
            places.append(Place(label=label, lon=pos["lon"], lat=pos["lat"]))
    return places

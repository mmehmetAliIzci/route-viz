"""Record trimmed TomTom responses as test fixtures. Run from backend/: uv run python scripts/record_tomtom.py

Calls the live API with the key from ../.env. Keeps only the fields the parsers read,
so fixtures stay small and hold nothing but route data.
"""

import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from planner import geocode, routing  # noqa: E402
from planner.http import get_json  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
KANSAS_CITY = (-94.5786, 39.0997)
DENVER = (-104.9903, 39.7392)


def trim_routes(body: dict) -> dict:
    keep_ins = ("pointIndex", "travelTimeInSeconds", "routeOffsetInMeters", "roadNumbers")
    return {
        "routes": [
            {
                "summary": {k: r["summary"][k] for k in ("lengthInMeters", "travelTimeInSeconds")},
                "legs": [{"points": leg["points"]} for leg in r["legs"]],
                "guidance": {
                    "instructions": [
                        {k: i[k] for k in keep_ins if k in i} for i in r["guidance"]["instructions"]
                    ]
                },
            }
            for r in body["routes"]
        ]
    }


def trim_search(body: dict) -> dict:
    return {"results": [{k: r[k] for k in ("poi", "address", "position") if k in r} for r in body["results"]]}


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    key = os.environ["TOMTOM_API_KEY"]
    depart = (datetime.now(UTC) + timedelta(days=1)).replace(hour=14, minute=0, second=0, microsecond=0)

    (olon, olat), (dlon, dlat) = KANSAS_CITY, DENVER
    url = routing.URL.format(locations=f"{olat},{olon}:{dlat},{dlon}")
    body = trim_routes(get_json("tomtom", url, routing.request_params(depart, 38_000, key)))
    body["_recorded"] = {
        "trip": "Kansas City to Denver",
        "departure_utc": depart.isoformat(),
        "load_lb": 38_000,
    }
    (OUT / "tomtom_route_kc_den.json").write_text(json.dumps(body))

    search = trim_search(
        get_json(
            "tomtom",
            geocode.URL.format(query="Kansas%20Ci"),
            {"key": key, "typeahead": "true", "countrySet": "US", "limit": 5},
        )
    )
    (OUT / "tomtom_search_kansas_ci.json").write_text(json.dumps(search, indent=1))

    for f in OUT.glob("tomtom_*.json"):
        assert key not in f.read_text(), f"key leaked into {f.name}"
        print(f.name, f.stat().st_size, "bytes")


if __name__ == "__main__":
    main()

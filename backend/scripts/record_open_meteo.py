"""Record Open-Meteo responses for the Kansas City to Denver fixture trip. Run from backend/:
uv run python scripts/record_open_meteo.py

Routes come from the recorded TomTom fixture; only Open-Meteo is called live (no key needed).
Writes tests/fixtures/open_meteo_kc_den_grid.json (the lean route grid), trimmed to `hourly`.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")  # the provider cache needs settings
from planner import http, plan  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


def main() -> None:
    tomtom = json.loads((FIXTURES / "tomtom_route_kc_den.json").read_text())
    rec = tomtom["_recorded"]
    calls: list[list[dict]] = []
    real_get = http.get_json

    def fake_get(provider: str, url: str, params: dict, deadline: http.Deadline | None = None) -> object:
        if provider == "tomtom":
            return tomtom
        body = real_get(provider, url, params, deadline)
        bodies = body if isinstance(body, list) else [body]
        calls.append([{"hourly": b["hourly"]} for b in bodies])
        return body

    http.get_json = fake_get
    trip = plan.Trip(
        origin=plan.Place("Kansas City, MO", -94.5786, 39.0997),
        destination=plan.Place("Denver, CO", -104.9903, 39.7392),
        departure=datetime.fromisoformat(rec["departure_utc"]),
        load_lb=rec["load_lb"],
        spacing_mi=25,
    )
    plan.build(trip, api_key="unused")
    [grid] = calls
    (FIXTURES / "open_meteo_kc_den_grid.json").write_text(json.dumps(grid))
    print("grid:", len(grid), "locations")


if __name__ == "__main__":
    main()

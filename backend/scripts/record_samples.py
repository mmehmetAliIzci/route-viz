"""Record the saved trips with live TomTom and Open-Meteo calls. Run from backend/:
uv run python scripts/record_samples.py

Writes data/samples/<id>.json. Uses about 200 Open-Meteo locations per trip.
"""

import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")  # the provider cache needs settings
from planner import plan, samples  # noqa: E402

TRIPS = [
    (
        "kansas-city-denver",
        plan.Place("Kansas City, MO", -94.5786, 39.0997),
        plan.Place("Denver, CO", -104.9903, 39.7392),
    ),
    (
        "chicago-nashville",
        plan.Place("Chicago, IL", -87.6244, 41.8756),
        plan.Place("Nashville, TN", -86.7816, 36.1627),
    ),
]


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    key = os.environ["TOMTOM_API_KEY"]
    now = datetime.now(UTC)
    departure = (now + timedelta(hours=2)).replace(minute=0, second=0, microsecond=0)
    samples.SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    for sample_id, origin, destination in TRIPS:
        trip = plan.Trip(origin, destination, departure, load_lb=38_000, spacing_mi=25)
        body = plan.build(trip, key)
        body["sample"] = {
            "id": sample_id,
            "label": f"{origin.label} to {destination.label}",
            "recorded_utc": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        }
        text = json.dumps(body, separators=(",", ":"))
        assert key not in text
        (samples.SAMPLES_DIR / f"{sample_id}.json").write_text(text)
        print(sample_id, len(text) // 1024, "KB", body["recommendation"]["reason"])


if __name__ == "__main__":
    main()

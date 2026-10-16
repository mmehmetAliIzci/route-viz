import json
from pathlib import Path

from planner import geocode

FIXTURE = Path(__file__).parent / "fixtures" / "tomtom_search_kansas_ci.json"


def test_typeahead_results_keep_order_and_coordinates() -> None:
    places = geocode.parse(json.loads(FIXTURE.read_text()))
    assert [p.label for p in places[:3]] == ["Kansas City, MO", "Kansas City, KS", "North Kansas City, MO"]
    assert (places[0].lat, places[0].lon) == (39.099792, -94.578559)


def test_results_without_position_or_label_are_skipped() -> None:
    body = {"results": [{"address": {"freeformAddress": "A"}}, {"position": {"lat": 1, "lon": 2}}]}
    assert geocode.parse(body) == []

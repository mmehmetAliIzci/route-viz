from datetime import UTC, datetime, timedelta

import pytest
from django.test import Client

from planner import geocode, http, plan
from planner.geocode import Place
from planner.http import ProviderError

KC = {"label": "Kansas City, MO", "lat": 39.0997, "lon": -94.5786}
DEN = {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903}


def body(**over: object) -> dict:
    soon = (datetime.now(UTC) + timedelta(hours=3)).isoformat().replace("+00:00", "Z")
    return {
        "origin": KC,
        "destination": DEN,
        "departure_utc": soon,
        "load_lb": 38000,
        "spacing_mi": 25,
    } | over


@pytest.fixture
def builds(monkeypatch: pytest.MonkeyPatch) -> list:
    calls: list = []

    def fake_build(trip: plan.Trip, api_key: str, viewer_tz: str = "UTC", demo: str | None = None) -> dict:
        calls.append((trip, viewer_tz, demo))
        return {"ok": True}

    monkeypatch.setattr(plan, "build", fake_build)
    return calls


def post(client: Client, data: dict) -> object:
    return client.post("/api/plan", data, content_type="application/json")


def test_valid_trip_is_built_every_time_the_providers_cache(client: Client, builds: list) -> None:
    data = body()
    assert post(client, data).json() == {"ok": True}
    assert post(client, data).json() == {"ok": True}
    assert len(builds) == 2
    assert builds[0][0].departure.tzinfo is not None
    assert builds[0][1] == "UTC"


def test_viewer_tz_is_passed_to_the_plan(client: Client, builds: list) -> None:
    assert post(client, body(viewer_tz="America/Denver")).status_code == 200
    assert builds[0][1] == "America/Denver"


@pytest.mark.parametrize("name", ["Mars/Olympus", "../etc/passwd", "", "America"])
def test_unknown_viewer_tz_is_rejected(client: Client, builds: list, name: str) -> None:
    resp = post(client, body(viewer_tz=name))
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_trip"
    assert "viewer_tz" in resp.json()["fields"]
    assert builds == []


@pytest.mark.parametrize(
    ("override", "field"),
    [
        ({"spacing_mi": 30}, "spacing_mi"),
        ({"load_lb": -1}, "load_lb"),
        ({"load_lb": 90_000}, "load_lb"),
        ({"departure_utc": "2026-10-16T14:00:00"}, "departure_utc"),
        ({"departure_utc": (datetime.now(UTC) + timedelta(hours=60)).isoformat()}, "departure_utc"),
        ({"origin": {"label": "London", "lat": 51.5, "lon": -0.12}}, "origin"),
        ({"destination": KC}, "non_field_errors"),
    ],
)
def test_bad_trips_are_rejected(client: Client, builds: list, override: dict, field: str) -> None:
    resp = post(client, body(**override))
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_trip"
    assert field in resp.json()["fields"]
    assert builds == []


@pytest.mark.parametrize(
    ("code", "http_status"),
    [
        ("no_route", 422),
        ("tomtom_quota", 503),
        ("open_meteo_quota", 503),
        ("weather_missing", 502),
        ("plan_timeout", 504),
    ],
)
def test_provider_errors_map_to_status(
    client: Client, monkeypatch: pytest.MonkeyPatch, code: str, http_status: int
) -> None:
    def failing(trip: plan.Trip, api_key: str, viewer_tz: str = "UTC", demo: str | None = None) -> dict:
        raise ProviderError(code, "nope")

    monkeypatch.setattr(plan, "build", failing)
    resp = post(client, body())
    assert resp.status_code == http_status
    assert resp.json()["error"] == code
    if code.endswith("_quota"):
        assert resp.json()["message"] == "The weather or routing service is busy. Try again in a minute."


def test_plan_over_budget_is_a_504(client: Client, monkeypatch: pytest.MonkeyPatch) -> None:
    """A real build whose clock is already past the deadline: no provider is called."""
    monkeypatch.setattr(plan, "BUDGET_S", -1)

    def fail(*args: object, **kwargs: object) -> object:
        raise AssertionError("no request expected")

    monkeypatch.setattr(http.requests, "get", fail)
    resp = post(client, body())
    assert resp.status_code == 504
    assert resp.json() == {
        "error": "plan_timeout",
        "message": "Planning took too long. Try again, or pick a saved trip.",
    }


def test_plan_is_throttled_to_10_a_minute_with_the_app_error_shape(client: Client, builds: list) -> None:
    assert [post(client, body()).status_code for _ in range(10)] == [200] * 10
    resp = post(client, body())
    assert resp.status_code == 429
    assert resp.json() == {
        "error": "rate_limited",
        "message": "Too many requests. Wait a moment and try again.",
    }
    assert int(resp["Retry-After"]) > 0
    assert len(builds) == 10


def test_geocode_is_throttled_to_60_a_minute_and_samples_are_not(
    client: Client, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(geocode, "search", lambda q, key: [])
    assert [client.get("/api/geocode?q=kansas").status_code for _ in range(60)] == [200] * 60
    resp = client.get("/api/geocode?q=kansas")
    assert resp.status_code == 429 and resp.json()["error"] == "rate_limited"
    assert all(client.get("/api/samples").status_code == 200 for _ in range(70))
    assert all(client.get("/api/samples/chicago-nashville").status_code == 200 for _ in range(70))


def test_geocode(client: Client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(geocode, "search", lambda q, key: [Place("Kansas City, MO", -94.58, 39.1)])
    assert client.get("/api/geocode?q=kan").json() == {
        "results": [{"label": "Kansas City, MO", "lat": 39.1, "lon": -94.58}]
    }
    assert client.get("/api/geocode?q=ka").status_code == 400


def test_saved_trips_are_listed_and_served(client: Client) -> None:
    listed = client.get("/api/samples").json()["samples"]
    assert {s["id"] for s in listed} == {"kansas-city-denver", "chicago-nashville"}
    body = client.get("/api/samples/kansas-city-denver").json()
    assert body["sample"]["label"] == "Kansas City, MO to Denver, CO"
    assert len(body["routes"]) >= 1 and "heatmap" in body


def test_unknown_saved_trip_is_404(client: Client) -> None:
    resp = client.get("/api/samples/nowhere")
    assert resp.status_code == 404
    assert resp.json()["error"] == "sample_not_found"


def test_saved_trip_is_explained_in_the_requested_zone(client: Client) -> None:
    default = client.get("/api/samples/kansas-city-denver").json()
    assert default["trip"]["viewer_tz"] == default["trip"]["origin_tz"]
    tokyo = client.get("/api/samples/kansas-city-denver?tz=Asia/Tokyo").json()
    assert tokyo["trip"]["viewer_tz"] == "Asia/Tokyo"
    assert tokyo["routes"] == default["routes"]
    assert client.get("/api/samples/kansas-city-denver").json() == default  # nothing stuck to the saved copy


def test_saved_trip_rejects_an_unknown_zone(client: Client) -> None:
    resp = client.get("/api/samples/kansas-city-denver?tz=Mars/Olympus")
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_tz"


def test_demo_is_passed_to_the_plan(client: Client, builds: list) -> None:
    assert post(client, body(demo="snow")).status_code == 200
    assert post(client, body(demo="rain,wind")).status_code == 200  # any order in, SCENARIOS order out
    assert post(client, body()).status_code == 200
    assert [b[2] for b in builds] == [("snow",), ("wind", "rain"), None]


def test_unknown_demo_is_rejected(client: Client, builds: list) -> None:
    resp = post(client, body(demo="hail"))
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_trip"
    assert "demo" in resp.json()["fields"]
    assert builds == []


def test_saved_trip_with_demo_weather(client: Client) -> None:
    saved = client.get("/api/samples/kansas-city-denver").json()
    resp = client.get("/api/samples/kansas-city-denver?demo=wind&tz=America/Denver")
    assert resp.status_code == 200
    wind = resp.json()
    assert wind["demo"] == ["wind"]
    assert client.get("/api/samples/kansas-city-denver?demo=wind,snow").json()["demo"] == ["wind", "snow"]
    assert wind["weather"]["model"] == "demo"
    assert wind["trip"]["viewer_tz"] == "America/Denver"
    assert wind["sample"] == saved["sample"]
    assert [r["id"] for r in wind["routes"]] == [r["id"] for r in saved["routes"]]
    assert "wind_dir" in wind["heatmap"]["channels"]
    assert "demo" not in client.get("/api/samples/kansas-city-denver").json()


def test_saved_trip_rejects_an_unknown_demo(client: Client) -> None:
    resp = client.get("/api/samples/kansas-city-denver?demo=hail")
    assert resp.status_code == 400
    assert resp.json() == {
        "error": "invalid_demo",
        "message": "Unknown demo weather. Use any of: wind, rain, snow, comma-separated.",
    }
    assert (
        client.get("/api/samples/kansas-city-denver?demo=wind&tz=Mars/Olympus").json()["error"]
        == "invalid_tz"
    )

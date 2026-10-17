"""HTTP API: POST /api/plan, GET /api/geocode and saved trips (optionally ?demo=wind,rain).

Errors are {"error": code, "message": text}.
"""

import hashlib
import logging
import math
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.cache import cache
from rest_framework import serializers, status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.exceptions import Throttled
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import exception_handler

from planner import demo, explain, geocode, plan, samples
from planner.http import CACHE_S, ProviderError

log = logging.getLogger("planner")
MAX_AHEAD = timedelta(hours=48)
GRACE_PAST = timedelta(hours=1)  # a departure entered a few minutes ago is still fine
# Contiguous United States, generously rounded
US_LAT = (24.0, 50.0)
US_LON = (-125.5, -66.5)


class PlaceIn(serializers.Serializer):
    label = serializers.CharField(max_length=200)
    lat = serializers.FloatField(min_value=US_LAT[0], max_value=US_LAT[1])
    lon = serializers.FloatField(min_value=US_LON[0], max_value=US_LON[1])


class TripIn(serializers.Serializer):
    origin = PlaceIn()
    destination = PlaceIn()
    departure_utc = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=0, max_value=80_000)
    spacing_mi = serializers.ChoiceField(choices=[10, 25, 50])
    viewer_tz = serializers.CharField(required=False, default="UTC", max_length=64)
    # "wind", or several at once as "wind,rain"
    demo = serializers.CharField(required=False, allow_null=True, default=None, max_length=32)

    def validate_demo(self, value: str | None) -> "demo.Scenarios | None":  # quoted: `demo` is the field here
        if value is None:
            return None
        try:
            return demo.parse(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from None

    def validate_viewer_tz(self, value: str) -> str:
        try:
            explain.zone(value)
        except ValueError:
            raise serializers.ValidationError(
                "Unknown time zone. Use an IANA name, e.g. America/Denver."
            ) from None
        return value

    def validate_departure_utc(self, value: datetime) -> datetime:
        raw = str(self.initial_data.get("departure_utc", ""))
        if not (raw.endswith("Z") or "+" in raw[10:] or "-" in raw[10:]):
            raise serializers.ValidationError("Departure needs a time zone, e.g. 2026-10-16T14:00:00Z.")
        now = datetime.now(UTC)
        if value < now - GRACE_PAST or value > now + MAX_AHEAD:
            raise serializers.ValidationError("Departure must be between now and 48 hours from now.")
        return value.astimezone(UTC)

    def validate(self, data: dict) -> dict:
        o, d = data["origin"], data["destination"]
        if math.hypot(o["lat"] - d["lat"], o["lon"] - d["lon"]) < 0.02:
            raise serializers.ValidationError("Origin and destination are the same place.")
        return data


class PlanThrottle(AnonRateThrottle):
    scope = "plan"


class GeocodeThrottle(AnonRateThrottle):
    scope = "geocode"


def api_exception_handler(exc: Exception, context: dict) -> Response | None:
    """DRF's handler, except a throttled request gets the app's error shape."""
    if isinstance(exc, Throttled):
        resp = error("rate_limited", "Too many requests. Wait a moment and try again.", 429)
        if exc.wait is not None:
            resp["Retry-After"] = str(math.ceil(exc.wait))
        return resp
    return exception_handler(exc, context)


def error(code: str, message: str, http_status: int, **extra: object) -> Response:
    return Response({"error": code, "message": message, **extra}, status=http_status)


def provider_error(exc: ProviderError) -> Response:
    if exc.code == "no_route":
        return error(exc.code, str(exc), status.HTTP_422_UNPROCESSABLE_ENTITY)
    if exc.code == "plan_timeout":
        return error(
            exc.code,
            "Planning took too long. Try again, or pick a saved trip.",
            status.HTTP_504_GATEWAY_TIMEOUT,
        )
    if exc.code.endswith("_quota"):
        return error(
            exc.code,
            "The weather or routing service is busy. Try again in a minute.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return error(exc.code, str(exc), status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
@throttle_classes([PlanThrottle])
def plan_view(request: Request) -> Response:
    form = TripIn(data=request.data)
    if not form.is_valid():
        fields = {k: [str(m) for m in v] for k, v in form.errors.items()}
        first = next(iter(fields.values()))[0]
        return error("invalid_trip", first, status.HTTP_400_BAD_REQUEST, fields=fields)

    v = form.validated_data
    trip = plan.Trip(
        origin=plan.Place(**v["origin"]),
        destination=plan.Place(**v["destination"]),
        departure=v["departure_utc"],
        load_lb=v["load_lb"],
        spacing_mi=int(v["spacing_mi"]),
    )
    try:
        body = plan.build(trip, settings.TOMTOM_API_KEY, v["viewer_tz"], demo=v["demo"])
    except ProviderError as exc:
        log.warning("plan_failed code=%s", exc.code)
        return provider_error(exc)
    return Response(body)


@api_view(["GET"])
@throttle_classes([GeocodeThrottle])
def geocode_view(request: Request) -> Response:
    q = request.query_params.get("q", "").strip()
    if len(q) < 3 or len(q) > 100:
        return error("invalid_query", "Type at least 3 characters.", status.HTTP_400_BAD_REQUEST)
    key = "geocode:" + hashlib.sha256(q.lower().encode()).hexdigest()
    if (cached := cache.get(key)) is not None:
        log.info("provider_call provider=tomtom status=- ms=0 cache=hit")
    else:
        try:
            places = geocode.search(q, settings.TOMTOM_API_KEY)
        except ProviderError as exc:
            return provider_error(exc)
        cached = [{"label": p.label, "lat": p.lat, "lon": p.lon} for p in places]
        cache.set(key, cached, CACHE_S)
    return Response({"results": cached})


@api_view(["GET"])
def samples_view(request: Request) -> Response:
    return Response({"samples": samples.listing()})


@api_view(["GET"])
def sample_view(request: Request, sample_id: str) -> Response:
    body = samples.get(sample_id)
    if body is None:
        return error("sample_not_found", "There is no saved trip with this id.", status.HTTP_404_NOT_FOUND)
    tz = request.query_params.get("tz")
    requested = request.query_params.get("demo")
    scenarios: demo.Scenarios | None = None
    if requested is not None:
        try:
            scenarios = demo.parse(requested)
        except ValueError as exc:
            return error("invalid_demo", str(exc), status.HTTP_400_BAD_REQUEST)
    try:
        if scenarios is not None:
            return Response(samples.with_demo(body, scenarios, tz))
        return Response(samples.in_zone(body, tz))
    except ValueError as exc:
        return error("invalid_tz", str(exc), status.HTTP_400_BAD_REQUEST)
    except ProviderError as exc:
        return provider_error(exc)

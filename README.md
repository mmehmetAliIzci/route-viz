# Truck weather routes

A React + Django app that helps a truck driver pick a route by the weather the truck will meet. Enter origin, destination, departure time and load weight; the app gets three truck routes, checks the weather at checkpoints every 10, 25 or 50 miles at the time the truck passes each one, scores them with the assessment's risk and load rules, and recommends one. A corridor heatmap with a 0 to 48 hour slider shows risk, wind, rain or snow around the routes; the wind layer also animates particles along the wind direction. A demo weather switch rescored any trip against a synthetic storm, so every risk level can be shown on a calm day.

## Run it locally

Needs Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 24 with pnpm, and a TomTom API key.

```bash
cp .env.example .env   # then set TOMTOM_API_KEY in .env
```

Backend (port 8000):

```bash
cd backend && uv sync && uv run python manage.py runserver 127.0.0.1:8000
```

Frontend (port 5173, proxies `/api` to the backend):

```bash
cd frontend && pnpm install && pnpm dev
```

Open http://127.0.0.1:5173. Without a TomTom key, the two saved trips under the form still work.

## Deploy

`vercel.json` deploys one Vercel project with two services: the Vite build for the page and Django for `/api/*`. Set `TOMTOM_API_KEY`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, `DJANGO_ALLOWED_HOSTS` (the `.vercel.app` host) and `DJANGO_NUM_PROXIES=1`; `SENTRY_DSN` is optional.

## Checks

```bash
cd backend && uv run pytest -q && uv run ruff check .
cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Tests never call TomTom or Open-Meteo; they run on recorded responses in `backend/tests/fixtures/`.

**API contract.** `backend/tests/test_contract.py` builds a plan from those recordings and checks it against `frontend/src/test/plan-contract.json`; `frontend/src/api/planContract.test.ts` parses the same file with the frontend's Zod schemas and fails if a field is lost or changed. After changing the plan's shape, refresh the file with `UPDATE_CONTRACT=1 uv run pytest tests/test_contract.py` from `backend/`, then fix whichever side fails.

## Logs and errors

The API logs one line per provider call (`provider_call provider= status= ms= cache=hit|miss`) and per plan (`plan_built ms= routes=`) to stdout, with no URLs or keys. Set `SENTRY_DSN` to send errors to Sentry; without it Sentry stays off.

## How it works

1. **Routes.** TomTom Calculate Route in truck mode returns up to three routes. TomTom's time at each maneuver gives the ETA profile along each route.
2. **Checkpoints.** One every N miles from the origin, plus the destination. Each checkpoint stands for half the gap to its neighbours ("owned miles"), so a route's owned miles add up to its length.
3. **Weather.** One Open-Meteo request (DWD ICON model) for a grid of points around the routes: the corners of every grid cell a route passes through. The grid step is the finest that keeps it at about 200 points. Checkpoints read this grid at their ETA (bilinear in space, linear in time); the heatmap draws the same grid. Wind direction comes along as a fifth heatmap channel and is interpolated through its components, so it never turns the long way round through north. The wind layer streams particles along it.
4. **Risk.** Each checkpoint's level is the worst of its wind, rain and snow levels from the assessment table, with the load rules applied to wind.
5. **Recommendation.** Routes are ranked by No Travel miles, then the assessment's order: Severe miles, High miles, average risk, travel time. The reason names the criterion that beat the runner-up.

All scoring happens in Python (`backend/planner/`); the frontend only displays it.

**Demo weather.** `POST /api/plan` with `"demo": "wind" | "rain" | "snow"`, or `GET /api/samples/<id>?demo=wind`, swaps the forecast for one synthetic front (`backend/planner/demo.py`) on the same grid a forecast would use. It sweeps the corridor over the 48 hours and crosses every risk level. Checkpoints, levels, ranking, the recommendation text and the heatmap all come from it, and the plan carries `"demo"` and a weather source of "Demo weather (synthetic, not a forecast)". The weather card's Demo weather switch drives it. It is a demo aid, never a forecast.

## Assumptions

- **Load weight** is cargo. TomTom gets cargo plus an assumed 35,000 lb empty truck.
- **Continuous driving.** No rest stops; ETAs are TomTom's travel times, spread between maneuvers at constant speed.
- **No Travel first.** A route with any No Travel miles never beats one without. This goes beyond the assessment's order.
- **Band edges.** A value on a boundary belongs to the higher band (25 mph is Moderate). No Travel starts at 55 mph wind but above 1.00 in/hr rain and 3.0 in/hr snow, as written in the assessment.
- **Rain** is Open-Meteo `rain + showers`; **snow** is `snowfall` (fresh snow depth); **wind** is sustained 10 m wind. Gusts are shown but not scored.
- **Average risk** counts Low as 0 up to No Travel as 4, weighted by owned miles.
- **Grid detail.** Checkpoint weather is interpolated between grid points about 25 to 40 km apart, so very local storms can be smoothed out.
- **Times.** Departure is entered in the viewer's time zone and stored as UTC. Every time the app shows, including the times in the recommendation text, is in the viewer's time zone: the browser sends it as `viewer_tz` with a plan and as `?tz=` for a saved trip.
- **US only**, departure within the next 48 hours.

## Limits

- Open-Meteo's free tier allows 600 locations a minute and 10,000 a day; a plan uses about 150 to 200. If a provider limit is hit, the app says so and offers the saved trips.
- **Caching.** Provider answers are cached for 30 minutes, not whole plans. TomTom routes are keyed by origin, destination, load and departure rounded up to the next 15 minutes, so every departure in that window shares one routing call; ETAs still count from the exact departure. Open-Meteo answers are keyed by the request, which is already whole hours. Place search is cached by query.
- **Accepted limitation: the cache and rate limits are per process.** They use Django's in-memory cache. On Vercel each function instance has its own, so a cold instance starts empty and the real limit across instances is higher than the numbers below. A shared cache such as Redis would fix both; for a proof of concept it is not worth the extra service.
- **Rate limits.** `/api/plan` allows 10 requests a minute per IP and `/api/geocode` 60; over that the API answers 429 `rate_limited` with `Retry-After`. Behind a proxy (Vercel), set `DJANGO_NUM_PROXIES=1` so the limit keys on the client IP and not the proxy's.
- **Time budget.** A plan must finish in 25 seconds. Each provider call gets what is left of that budget as its timeout; when it runs out the API answers 504 `plan_timeout`. Routing and weather cannot run in parallel, because the weather grid is built from the route shapes.
- Saved trips (`backend/data/samples/`) are real plans recorded on 2026-10-15, before wind direction was requested, so their wind layer shows no particles until they are re-recorded with `uv run python scripts/record_samples.py` from `backend/` (needs a TomTom key). Demo weather on a saved trip always has direction.
- The map (MapLibre, about 1 MB) loads in its own chunk after the form, so the first screen does not wait for it.
- No end-to-end browser tests yet.

## Data and credits

- Routes and place search: [TomTom](https://developer.tomtom.com/) (key required, server side only).
- Weather: [Open-Meteo](https://open-meteo.com/), DWD ICON model, CC BY 4.0. The free API is for non-commercial use.
- Basemap: [OpenFreeMap](https://openfreemap.org/) Positron in the light theme and Dark in the dark theme, © OpenMapTiles, data © OpenStreetMap contributors.

## Repository

```
backend/    Django + DRF API. planner/ holds rules, sampling, ranking, routing, weather, plan
frontend/   Vite + React + TypeScript, MapLibre, shadcn/ui
docs/adr/   architecture decisions
GLOSSARY.md the terms used in code and docs
```

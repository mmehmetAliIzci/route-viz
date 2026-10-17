"""The content of the docs page, as a list of blocks that docs/site/build.py renders to HTML."""

import json
from pathlib import Path

from . import diagrams as D

ROOT = Path(__file__).resolve().parents[2]
TITLE = "Truck Weather Routes"
BRIEF = "Pick the safest truck route by the weather the truck will actually drive through."


def lines(path, a, b):
    return "\n".join((ROOT / path).read_text().splitlines()[a - 1 : b])


def diagram(id_, caption, html, css):
    return {"type": "diagram", "id": id_, "caption": caption, "html": html, "css": css}


def annotated(id_, filename, code, annotations):
    return {"type": "code", "id": id_, "filename": filename, "code": code, "annotations": annotations}


def table(id_, columns, rows):
    return {"type": "table", "id": id_, "columns": columns, "rows": rows}


def image(src, alt, caption=None):
    return {"type": "image", "src": src, "alt": alt, "caption": caption}


def columns(id_, cols):
    return {"type": "columns", "id": id_, "columns": [(label, body if isinstance(body, dict) else md(body)) for label, body in cols]}


def endpoint(id_, method, path, summary, description=None, params=(), request=None, responses=()):
    return {"type": "endpoint", "id": id_, "method": method, "path": path, "summary": summary,
            "description": description, "params": list(params), "request": request, "responses": list(responses)}


def datamodel(id_, entities, relations):
    return {"type": "datamodel", "id": id_, "entities": entities, "relations": relations}


def filetree(id_, title, entries):
    return {"type": "filetree", "id": id_, "title": title, "entries": entries}


def callout(id_, tone, text):
    return {"type": "callout", "id": id_, "tone": tone, "text": text.strip()}


def md(text):
    return {"type": "md", "text": text.strip()}


BLOCKS = []


def P(block):
    BLOCKS.append(md(block) if isinstance(block, str) else block)



P("""
## In one minute

**The problem.** A truck driver has a few routes to choose from. Map apps pick the fastest one. For a heavy truck the weather matters just as much: strong side wind, heavy rain or snow can make a road dangerous or unsafe to drive.

**What the app does.** The driver enters where they start, where they are going, when they leave and how heavy the cargo is. The app finds up to three truck routes, works out *when* the truck will be at each point of each route, checks the forecast for that point *at that time*, and recommends the safest route with one sentence saying why.

**Built with.** A Python backend (Django) does all the work. A React website shows the result on a map, on a laptop or a phone. About 5,500 lines of app code, with automated tests on both sides.
""")
P(image("desktop.jpg", "The app on a laptop", "Kansas City to Denver on a laptop. Left: the recommended route and why. Right: the three routes on the map, the recommended one coloured by the weather it meets."))

P("### Words used on this page\n")
P(table("glossary", ["Word", "What it means here"], [
    ["Route", "One way to drive from start to destination. The app compares up to three."],
    ["I-70 W, US-36 W", "US highway names. **I-70** is Interstate 70, **US-36** is the smaller US Highway 36, and **W** means westbound. A route is named after the two highways it uses most, for example **I-70 W / I-670 W**."],
    ["Checkpoint", "A point on the route where the weather is checked: every 10, 25 or 50 miles."],
    ["ETA", "Estimated time of arrival: when the truck reaches a checkpoint, counted from departure."],
    ["Level", "How dangerous the weather is at a checkpoint: Low, Moderate, High, Severe or No Travel."],
    ["No Travel", "The worst level. The truck should not drive through it."],
    ["Owned miles", "The stretch of road one checkpoint speaks for (explained with a picture below)."],
    ["Heatmap", "The coloured weather layer on the map, for any hour in the next 48 hours."],
    ["Demo weather", "A made-up storm the app can lay over any trip, so every risk level can be shown on a calm day."],
    ["TomTom", "The map company whose service provides the truck routes and drive times."],
    ["Open-Meteo", "A free weather service with hour-by-hour forecasts."],
]))

# ---------- Screens ----------
P("""
## What the driver sees

The screenshots below are the real app, on the saved Kansas City to Denver trip with the demo storm switched on so that every kind of weather shows up. Times appear in the viewer's own time zone; these were taken in GMT+8.

### The answer comes first

The green card answers three questions at a glance: **which road**, **when you arrive**, and **the worst thing on the way**. Here: take I-70 W / I-670 W, arrive at 12:09 AM, and expect No Travel wind for the last 67 miles into Denver. The small print explains the choice: it has the least No Travel weather of the three routes, and with a 38,000 lb load, wind over 45 mph counts as No Travel.

If another road is at least an hour faster, the card adds a red note saying how much time it would save and how much extra bad weather it would cost.
""")
P(columns("phone-shots", [
    ("The answer card", image("verdict-card.jpg", "Phone: the recommendation card")),
    ("The map, route up", image("phone-route-up-rain.jpg", "Phone: map with the route running up the screen")),
]))
P("""
### Reading the map

- The **recommended route** is drawn thick. Only the stretches with bad weather are coloured, yellow through dark purple; clear road stays green. One label marks the worst point: *No travel wind · 11:17 PM*.
- The **other routes** are grey, each with a pill saying how much longer it takes (+1 h 21 min, +3 h 12 min). Tapping a pill selects that route.
- **Start** and the destination pin mark the trip's ends.
- On a phone the map turns so the trip runs **up the screen**, like a car navigation app. The round button under the layer rail switches back to north up.

### Weather layers and the forecast slider

The rail on the right switches the weather layer: **Risk**, **Wind**, **Rain**, **Snow** or **Off**. The card at the bottom has a colour key and a slider for the next 48 hours; the play button sweeps through them. Wind, rain and snow are animated: wind as streaks moving with the wind's direction, rain as falling streaks, snow as drifting flakes. Heavier weather means more and faster movement.
""")
P(columns("weather-shots", [
    ("Wind", image("wind-streaks.jpg", "Wind layer with moving streaks")),
    ("Rain", image("phone-route-up-rain.jpg", "Rain layer with falling streaks")),
    ("Snow", image("snow-flakes.jpg", "Snow layer with drifting flakes")),
]))
P(image("heatmap-sweep.gif", "The forecast slider playing through 48 hours", "The play button sweeping the forecast: the storm moves across the routes hour by hour."))
P("""
### Settings

Settings hold the checkpoint spacing (10, 25 or 50 miles), the **demo weather** switch, and light or dark theme. Demo weather can combine wind, rain and snow; with none selected the app uses the real forecast.
""")
P(columns("settings-shot", [
    ("The settings sheet", image("settings-demo-storms.jpg", "Settings with demo weather")),
    ("What demo weather is for", "Real weather is often calm, which makes for a dull demo. Demo weather sweeps a made-up storm across the area around the routes. Everything else is real: the same routes, the same rules, the same scoring. The app always labels it *Demo weather: synthetic storm, not a forecast*."),
]))

# ---------- Time ----------
P("""
## The core idea: weather at the hour the truck arrives

Most route tools look at the weather *now*. A truck leaving Kansas City at 3 AM reaches Denver around 11 AM, so what matters is the forecast for each stretch of road **at the hour the truck gets there**. TomTom gives the truck's time at every turn of the route, which gives an ETA for every point. Each checkpoint is then checked against the forecast for its ETA.
""")
P(diagram("time-aware", "A storm over mile 430 during the first three hours is gone by the time the truck arrives, about six hours in, so the app rates that stretch Low. Checking the weather 'now' would have flagged it.", *D.time_aware()))
P("""**How to read this chart.** Left to right is distance along the route; bottom to top is time since the truck left. The black line is the truck: it gets further as time passes, and each dot is a checkpoint. The red blob is a storm in the forecast, over miles 380 to 480 but only for the first three hours. A check of the weather *right now* would warn about mile 430 (the red ✕). The truck reaches mile 430 about six hours in, when the storm has passed.

One simplification: the app assumes the driver does not stop for breaks.
""")

# ---------- Request ----------
P("""
## How a request flows

When the driver presses the button, the website sends the trip to the backend and waits for one answer: the **plan**. Only the backend talks to TomTom and the weather service, so the access key stays secret.

Read the picture from left to right. The backend first checks that one person is not sending too many requests (**rate limit**), then that the trip makes sense (**validate**: in the US, leaving within 48 hours). Then `plan.build()` does the work within 40 seconds. Answers from TomTom and the weather service are kept for 30 minutes (**cache**), so a repeated trip does not ask them again. Each red label is the answer the driver gets if that step fails.
""")
P(diagram("architecture", "One request in, one plan out. All scoring happens in the backend; the website checks that the answer has the expected shape and draws it.", *D.request_path()))

# ---------- Pipeline ----------
P("""
## How a plan is built

`plan.build()` runs six steps, each in its own small, tested module. The arrows say what data moves from one step to the next.
""")
P(diagram("pipeline", "The six steps inside plan.build(). One weather grid feeds both the checkpoints and the 48-hour heatmap, so the map and the scores always agree.", *D.pipeline()))

P("""
### Checkpoints and owned miles

**The question:** "How many miles of this route have dangerous weather?" That is what routes are compared on. But the weather is only checked at points, not along every inch of road.

**The idea:** each checkpoint is like a weather station that speaks for the road around it, from halfway back to the previous checkpoint to halfway forward to the next. That stretch is its **owned miles**. Adding up the owned miles of every checkpoint with High weather gives the route's "High miles".

**Why not just count checkpoints?** Because the last gap is usually short. On a 60 mile trip with a checkpoint every 25 miles, checkpoints sit at miles 0, 25, 50 and the destination at 60. The destination speaks for only the last 5 miles. Counted like the others, a shower at the very end would look as bad as 25 miles of rain on open road.
""")
P(diagram("owned-miles", "A 60 mile trip with a checkpoint every 25 miles. Each bracket is the road one checkpoint speaks for; together they cover the 60 miles exactly once.", *D.owned_miles()))
P(table("owned-example", ["If High weather is found at…", "High miles for the route"], [
    ["only the checkpoint at mile 25", "25 miles (it speaks for miles 12.5 to 37.5)"],
    ["only the destination at mile 60", "5 miles (it speaks for miles 55 to 60)"],
    ["both", "30 miles"],
]))

P("""
### One lean weather grid

The free weather service limits how many places can be asked about per minute. So the app lays an imaginary grid over the map, keeps only the grid points close to a route, and asks about those: about 150 to 200 points per trip, sent as small batches of 50 in parallel so a long trip still plans in seconds.

To get the weather at a checkpoint, the app blends the four grid points around it, giving more weight to the closer ones. Forecasts come in whole hours, so an ETA of 15:20 blends the 15:00 and 16:00 forecasts, mostly 15:00. The same grid draws the heatmap.
""")
P(diagram("lean-grid", "Left: only the grid points near the route are fetched. Right: a checkpoint's weather is blended from the four corners of its cell, then between the two hourly forecasts around its ETA.", *D.lean_grid()))

# ---------- Rules ----------
P("""
## Risk rules

The rules come from the assignment brief. Wind, rain and snow each get a level from this table, and the checkpoint takes the **worst** of the three. Rain and snow are in inches per hour. A value exactly on an edge goes to the higher level.
""")
P(table("risk-table", ["Level", "Wind (mph)", "Rain (in/hr)", "Snow (in/hr)"], [
    ["Low", "under 25", "under 0.10", "under 0.5"],
    ["Moderate", "25 to 35", "0.10 to 0.25", "0.5 to 1.0"],
    ["High", "35 to 45", "0.25 to 0.50", "1.0 to 2.0"],
    ["Severe", "45 to 55", "0.50 to 1.00", "2.0 to 3.0"],
    ["No Travel", "55 or more", "over 1.00", "over 3.0"],
]))
P("\n**Heavier trucks are stricter about wind.** Over 40,000 lb, wind of 35 to 45 mph counts as Severe instead of High. Over 30,000 lb, wind of 45 to 55 mph counts as No Travel instead of Severe. That is why the 38,000 lb truck above treats wind over 45 mph as No Travel.\n")
P(annotated("rules-code", "backend/planner/rules.py", lines("backend/planner/rules.py", 31, 75), [
    {"lines": "4-7", "label": "Load rules", "note": "The only place cargo weight changes a level."},
    {"lines": "37-45", "label": "Worst wins", "note": "Each kind of weather is rated on its own and the checkpoint takes the worst. The cause is kept, so the app can say 'No Travel wind at mile 475'."},
]))

P("""
### How the brief's rules are applied

The thresholds and load rules above are the assignment brief's, applied exactly. Two gaps in the brief needed a decision:

- **Shared edges.** The brief lists rain as "0.10–0.25" for Moderate and "0.25–0.50" for High, so 0.25 belongs to both. Here a value on an edge always goes to the higher, safer level. Wind is treated the same way: anything from 25 up to (not including) 35 mph is Moderate.
- **"≥" and ">".** The brief writes No Travel as "≥55 mph" for wind but ">1.00" and ">3.0" for rain and snow. That is followed as written, so exactly 1.00 in/hr of rain is Severe and exactly 55 mph of wind is No Travel.
""")

# ---------- Ranking ----------
P("""
## How the best route is picked

Routes are compared one question at a time, like a tie-breaker:

1. Fewest miles of **No Travel** weather
2. Fewest **Severe** miles
3. Fewest **High** miles
4. Lowest **average risk**
5. Shortest **drive**

The brief's order is questions 2 to 5. **Question 1 is an addition:** the brief's list does not mention No Travel at all, so read literally, a route with 100 miles of No Travel weather and no Severe miles would beat a route with a single Severe mile. Putting No Travel first prevents that.

The first question where the routes differ decides, and it becomes the sentence on the card. These are the three routes for Kansas City to Denver, with the demo storm:
""")
P(table("kc-den-routes", ["Route", "In plain words", "Distance", "Drive time", "No Travel miles"], [
    ["I-70 W / I-670 W", "The direct way: west across Kansas on Interstate 70", "605 mi", "8 h 9 min", "67"],
    ["I-80 W / I-76 W", "North first, west across Nebraska on Interstate 80, then down to Denver", "684 mi", "9 h 30 min", "221"],
    ["US-36 W / US-34 W", "Smaller US highways in between", "661 mi", "11 h 21 min", "100"],
]))
P(diagram("ranking-ladder", "The first question already separates the two best routes: 67 against 100 miles of No Travel weather. The card says so: '33 fewer miles of No Travel weather than US-36 W / US-34 W. Saves 3 h 12 min.'", *D.ranking_ladder()))
P("""
On the real forecast for the same day the weather was calm on all three routes. Every weather question tied, so the drive time decided: *Same weather, 1 h 21 min faster.*

**The trade-off note.** The order puts bad weather before time, so a route can win while being hours slower. When another road is at least an hour faster, the card says so in red, with the time saved and the extra bad weather, so the driver can make an informed choice.
""")
P("""
### What "average risk" means

Average risk is one number for how risky a whole route is. Every mile of road gets the score of the checkpoint that speaks for it, and the scores are averaged over the route's length.
""")
P(table("risk-scores", ["Level", "Score per mile"], [["Low", "0"], ["Moderate", "1"], ["High", "2"], ["Severe", "3"], ["No Travel", "4"]]))
P("""
**A small example.** A 100 mile route with 60 miles of Low, 25 miles of Moderate and 15 miles of High weather: 60 × 0 + 25 × 1 + 15 × 2 = 55 points, over 100 miles, is an average risk of **0.55**. A route that is clear all the way scores 0; one that is No Travel all the way scores 4.

**On the real trip.** I-70 W / I-670 W under the demo storm: 67 × 4 + 50 × 3 + 75 × 2 + 50 × 1 = 619 points over 605 miles, an average risk of **1.02**.

**A quirk of averaging.** The same 25 Moderate and 15 High miles on a 200 mile route give 55 ÷ 200 = **0.28**. The bad road is the same, just spread over more miles, so longer routes look slightly better. That is why average risk only comes fourth: it decides only between routes with exactly the same No Travel, Severe and High miles.
""")
P(annotated("ranking-code", "backend/planner/ranking.py", lines("backend/planner/ranking.py", 66, 94), [
    {"lines": "1-9", "label": "The questions, in order", "note": "No Travel first, then the brief's order. Numbers are rounded so tiny differences never decide."},
    {"lines": "25-29", "label": "What decided", "note": "The first question where the winner and runner-up differ. It becomes the reason on the card."},
]))

# ---------- Limits ----------
P("""
## Caching, limits and failures

Answers from TomTom and Open-Meteo are kept for 30 minutes. For TomTom, departures are rounded up to the next 15 minutes, so several people planning the same trip in the same quarter hour share one request. Each trip's ETAs still count from its own exact departure.
""")
P(diagram("cache-bucket", "Three departures between 14:00 and 14:15 share one TomTom request for 14:15; the departure at 14:21 starts the next quarter hour.", *D.cache_bucket()))
P(table("limits-table", ["Safeguard", "Rule", "If it trips"], [
    ["Rate limit", "10 trips and 60 place searches per minute per person", "429: wait and try again"],
    ["Validation", "US only, leaving within 48 hours, a known time zone", "400: the form says what is wrong"],
    ["Time limit", "40 seconds for the whole plan", "504: try again or open a saved trip"],
    ["Provider limit", "TomTom or Open-Meteo is busy", "503: the app offers the saved trips"],
]))
P("""
**Known limitation:** the cache and the rate limit live in each server's memory. On a hosting platform that runs several copies of the backend, each copy has its own. A shared store such as Redis would fix that; for a proof of concept it is not worth the extra service.
""")

# ---------- API ----------
P("## API\n\nThe website and backend talk through four JSON endpoints. Errors always look like `{\"error\": code, \"message\": text}`.\n")
trip_example = json.dumps({
    "origin": {"label": "Kansas City, MO", "lat": 39.0997, "lon": -94.5786},
    "destination": {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903},
    "departure_utc": "2026-10-17T08:00:00Z",
    "load_lb": 38000,
    "spacing_mi": 25,
    "viewer_tz": "America/Chicago",
    "demo": "wind,rain",
}, indent=2)
P(endpoint("api-plan", "POST", "/api/plan", "Plan a trip", "Runs the whole pipeline and returns one plan.", [
    {"name": "origin, destination", "in": "body", "type": "{label, lat, lon}", "required": True, "description": "Places in the contiguous US."},
    {"name": "departure_utc", "in": "body", "type": "ISO 8601 time", "required": True, "description": "Between now and 48 hours from now."},
    {"name": "load_lb", "in": "body", "type": "integer", "required": True, "description": "Cargo weight, 0 to 80,000 lb."},
    {"name": "spacing_mi", "in": "body", "type": "10 | 25 | 50", "required": True, "description": "Checkpoint spacing."},
    {"name": "viewer_tz", "in": "body", "type": "time zone name", "description": "Times in the text use this zone. Default UTC."},
    {"name": "demo", "in": "body", "type": "wind,rain,snow", "description": "Use a demo storm instead of the forecast."},
], {"contentType": "application/json", "example": trip_example}, [
    {"status": "200", "description": "The plan: routes, checkpoints, summaries, recommendation and heatmap"},
    {"status": "400", "description": "invalid_trip or invalid_demo"},
    {"status": "422", "description": "no_route: no truck route between the two places"},
    {"status": "429", "description": "rate_limited"},
    {"status": "503", "description": "a provider is busy"},
    {"status": "504", "description": "plan_timeout: over 40 seconds"},
]))
P(endpoint("api-geocode", "GET", "/api/geocode", "Search places for the From and To fields", None, [
    {"name": "q", "in": "query", "type": "string", "required": True, "description": "3 to 100 characters."}], None, [
    {"status": "200", "description": "Matching places", "example": '{ "results": [{ "label": "Denver, CO", "lat": 39.74, "lon": -104.99 }] }'}]))
P(endpoint("api-samples", "GET", "/api/samples", "List saved trips", "Two real plans recorded on 2026-10-17, so the app works without a TomTom key.", [], None, [
    {"status": "200", "description": "Saved trips", "example": '{ "samples": [{ "id": "kansas-city-denver", "label": "Kansas City, MO to Denver, CO" }] }'}]))
P(endpoint("api-sample", "GET", "/api/samples/{sample_id}", "Open a saved trip", None, [
    {"name": "sample_id", "in": "path", "type": "slug", "required": True},
    {"name": "tz", "in": "query", "type": "time zone name", "description": "Re-explains the trip in this zone."},
    {"name": "demo", "in": "query", "type": "wind,rain,snow", "description": "Re-scores the trip under a demo storm."}], None, [
    {"status": "200", "description": "Same shape as POST /api/plan"},
    {"status": "404", "description": "sample_not_found"}]))

# ---------- Payload ----------
P("\n## The plan the backend returns\n\nThere is no database. Everything the website shows comes from this one JSON answer, defined in the backend and checked on arrival by matching schemas in the website. An automated test keeps the two sides in step.\n")
entities = [
    {"id": "plan", "name": "Plan", "fields": [
        {"name": "trip", "type": "Trip"}, {"name": "routes", "type": "Route[] (1 to 3)"},
        {"name": "recommendation", "type": "Recommendation"}, {"name": "weather", "type": "{model, source, grid_step_deg, locations}"},
        {"name": "heatmap", "type": "Heatmap"}]},
    {"id": "trip", "name": "Trip", "fields": [
        {"name": "origin / destination", "type": "Place"}, {"name": "departure_utc", "type": "string"},
        {"name": "load_lb", "type": "number"}, {"name": "spacing_mi", "type": "10|25|50"},
        {"name": "origin_tz / viewer_tz", "type": "string"}]},
    {"id": "route", "name": "Route", "fields": [
        {"name": "id", "type": "number", "pk": True}, {"name": "name", "type": "string"},
        {"name": "distance_mi / duration_s", "type": "number"}, {"name": "arrival_utc", "type": "string"},
        {"name": "geometry", "type": "[lon, lat][]"}, {"name": "checkpoints", "type": "Checkpoint[]"}, {"name": "summary", "type": "Summary"}]},
    {"id": "checkpoint", "name": "Checkpoint", "fields": [
        {"name": "mile, lon, lat", "type": "number"}, {"name": "eta_utc", "type": "string"},
        {"name": "wind_mph, gust_mph", "type": "number"}, {"name": "wind_dir_deg", "type": "number"},
        {"name": "rain_in_hr, snow_in_hr", "type": "number"}, {"name": "level", "type": "Level"},
        {"name": "cause", "type": "wind|rain|snow", "nullable": True}]},
    {"id": "summary", "name": "Summary", "fields": [
        {"name": "no_travel_mi, severe_mi, high_mi, moderate_mi", "type": "number"},
        {"name": "avg_risk", "type": "number"}, {"name": "max_level", "type": "Level"}]},
    {"id": "recommendation", "name": "Recommendation", "fields": [
        {"name": "route_id", "type": "number", "fk": "Route.id"}, {"name": "runner_up_id", "type": "number", "fk": "Route.id", "nullable": True},
        {"name": "decided_by", "type": "question", "nullable": True}, {"name": "headline, reason", "type": "string"},
        {"name": "why_not", "type": "per other route"}]},
    {"id": "heatmap", "name": "Heatmap", "fields": [
        {"name": "west, south, step_deg, nx, ny", "type": "number"}, {"name": "hours", "type": "49"},
        {"name": "mask", "type": "base64"}, {"name": "channels", "type": "risk, wind, rain, snow, wind_dir"}]},
]
relations = [
    {"from": "plan", "to": "trip", "kind": "1-1"}, {"from": "plan", "to": "route", "kind": "1-n"},
    {"from": "route", "to": "checkpoint", "kind": "1-n"}, {"from": "route", "to": "summary", "kind": "1-1"},
    {"from": "plan", "to": "recommendation", "kind": "1-1"}, {"from": "plan", "to": "heatmap", "kind": "1-1"},
]
P(datamodel("plan-model", entities, relations))
P("The heatmap is packed as one byte per grid point per hour per layer, so 49 hours of five weather layers fit in a small download.\n")

# ---------- Website ----------
P("""
## How the website is put together

- `PlannerScreen.tsx` holds everything the page remembers: the trip, the plan, the selected route, the forecast hour and the weather layer.
- `PlannerDesktop.tsx` and `PlannerPhone.tsx` only arrange those pieces: a side panel next to the map on a laptop, a map with a pull-up sheet on a phone.
- `VerdictCard.tsx` is the green answer card; `RouteRows.tsx` lists the other routes.
- `LayerRail.tsx`, `LayerLegend.tsx` and `TimeControl.tsx` are the layer buttons, the colour key and the 48-hour slider.
- `map/useMapLibre.ts` sets up the map step by step; `map/windParticles.ts` animates wind, rain and snow.
- `model/planView.ts` turns the raw plan into the words and times on screen.

The map library (MapLibre, about 1 MB) loads after the form, so the first screen appears quickly.
""")

# ---------- Files ----------
P("## Where things live\n")
tree = [
    {"path": "backend/planner/views.py", "note": "The four endpoints, validation, rate limits, error answers"},
    {"path": "backend/planner/plan.py", "note": "Runs the pipeline and builds the plan"},
    {"path": "backend/planner/routing.py", "note": "TomTom truck routes and drive times"},
    {"path": "backend/planner/sampling.py", "note": "Checkpoints and owned miles"},
    {"path": "backend/planner/weather.py", "note": "The weather grid, fetched in parallel batches"},
    {"path": "backend/planner/demo.py", "note": "The made-up demo storm"},
    {"path": "backend/planner/rules.py", "note": "Risk levels and load rules from the brief"},
    {"path": "backend/planner/ranking.py", "note": "Route summaries and the tie-breaker order"},
    {"path": "backend/planner/explain.py", "note": "The plain-language sentences"},
    {"path": "backend/data/samples/", "note": "Two recorded real trips"},
    {"path": "backend/tests/", "note": "Backend tests, on recorded TomTom and Open-Meteo answers"},
    {"path": "frontend/src/api/planApi.ts", "note": "Calls the backend and checks every answer"},
    {"path": "frontend/src/planner/", "note": "The screens, cards, rail, slider and settings"},
    {"path": "frontend/src/planner/map/", "note": "Map setup, route colouring, markers, weather animation"},
    {"path": "frontend/src/planner/model/", "note": "Turns the plan into what the screen shows"},
]
P(filetree("files", "Repository map", tree))

# ---------- Decisions ----------
P("## Design decisions\n")
P(table("decisions", ["Decision", "Why"], [
    ["All risk scoring happens in the backend", "One implementation and one set of tests, so the map and the scores can never disagree."],
    ["Weather at the truck's ETA, not now", "The weather that matters is the weather the truck drives into."],
    ["One lean weather grid around the routes", "About 150 to 200 points per trip keeps the free weather service usable."],
    ["Colour only the dangerous stretches", "Clear road draws nothing extra, so the map stays readable."],
    ["Map first on the phone, route running up the screen", "The map is the product; panels stay small and out of the way."],
    ["Demo weather, clearly labelled", "Every risk level can be shown on any day without pretending it is a forecast."],
    ["Times in the viewer's own zone", "Departure, arrival and hazard times match the clock of the person reading them."],
]))
P(callout("limits", "info", "**Limits:** US only, departures within 48 hours, continuous driving with no rest stops, weather blended from grid points 25 to 40 km apart (very local storms can be smoothed out), and cache and rate limits that live per server."))

# ---------- Ideas ----------
P("""
## Ideas considered, not built

These came up while building the app. They are thought through but deliberately left out of this version.

### Waiting out No Travel weather

The rules treat No Travel as "do not drive through it". In real life a driver can also **wait**: park at a truck stop until the wind drops. Two ways the app could help:

- **Leave later.** Re-score the recommended route as if the truck left 3, 6, 12 or 24 hours later, and suggest the smallest delay that avoids the worst weather. This is cheap: the forecast grid already covers 48 hours and every checkpoint keeps its travel time from the start, so only the clock moves and no new weather request is needed.
- **Stop partway.** Drive to the last checkpoint before the bad stretch, wait there, then continue: every later ETA moves back by the wait. US truck drivers must also take a 10-hour break after 11 hours of driving, so a real version would line waits up with those required breaks.

### A weighted score instead of a fixed order

A weighted score (for example "a Severe mile costs 3 points, an hour of driving 5") would let a small weather difference lose to a big time saving. It was left out because the brief gives an order, not weights; every weight would be a judgment call; and "33 fewer miles of No Travel weather" is a clearer reason for a driver than "412 points against 437". The red trade-off note covers the case where the order picks a much slower road.
""")

P("""## Running it

```bash
cp .env.example .env   # add a TomTom key
cd backend && uv sync && uv run python manage.py runserver 127.0.0.1:8000
cd frontend && pnpm install && pnpm dev   # http://127.0.0.1:5173
```

Without a TomTom key, the two saved trips still work, with or without demo weather.
""")


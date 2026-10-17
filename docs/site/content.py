"""The content of the docs page, as a list of blocks that docs/site/build.py renders to HTML."""

import json
from pathlib import Path

from . import diagrams as D

ROOT = Path(__file__).resolve().parents[2]
TITLE = "Truck Weather Routes"
BRIEF = "Pick the safest truck route by the weather the truck will actually drive through."


def lines(path, a, b):
    return "\n".join((ROOT / path).read_text().splitlines()[a - 1 : b])


def ranking_excerpt():
    """The weights, the near-tie rule and recommend() from ranking.py, with notes."""
    src = (ROOT / "backend/planner/ranking.py").read_text().splitlines()
    w0 = next(i for i, l in enumerate(src) if l.startswith("LEVEL_WEIGHTS")) - 1  # include its comment
    w1 = next(i for i, l in enumerate(src) if l.startswith("NEAR_TIE_SHARE")) + 1
    r0 = next(i for i, l in enumerate(src) if l.startswith("def near_tied"))
    code = src[w0:w1] + ["", "# ..."] + src[r0:]

    def at(pattern):
        return next(i for i, l in enumerate(code, 1) if pattern in l)

    weights_end = at("NEAR_TIE_POINTS") - 1
    return "\n".join(code), [
        {"lines": f"1-{weights_end}", "label": "The weights", "note": "Points per mile for each level, three times apart."},
        {"lines": f"{at('NEAR_TIE_POINTS')}-{at('NEAR_TIE_SHARE')}", "label": "Close enough to call a tie", "note": "Within 10 points, or 5% of the higher score, drive time decides."},
        {"lines": f"{at('def pick')}-{at('return min(tied')}", "label": "Picking the route", "note": "Among the routes near-tied with the lowest score, the quickest wins."},
    ]


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
    if isinstance(block, str):
        if not block.strip():
            return
        block = md(block)
    BLOCKS.append(block)



P("""
## In one minute

**The problem.** A truck driver has a few routes to choose from. Map apps pick the fastest one. For a heavy truck the weather matters just as much. Strong side wind, heavy rain or snow can make a road dangerous or unsafe to drive.

**What the app does.** The driver enters where they start, where they are going, when they leave and how heavy the cargo is. The app finds up to three truck routes, works out *when* the truck will be at each point of each route, checks the forecast for that point *at that time*, and recommends the safest route with one sentence saying why.

**Built with.** A Python backend (Django) does all the work. A React website shows the result on a map, on a laptop or a phone. The app is about 5,500 lines of code, with automated tests on both sides.
""")
P(image("desktop.jpg", "The app on a laptop", "Kansas City to Denver on a laptop. The left panel shows the recommended route and why it won. The map shows the three routes, with the recommended one coloured by the weather it meets."))

P("### Words used on this page\n")
P(table("glossary", ["Word", "What it means here"], [
    ["Route", "One way to drive from start to destination. The app compares up to three."],
    ["I-70 W, US-36 W", "US highway names. I-70 is Interstate 70, US-36 is the smaller US Highway 36, and W means westbound. The app names each route after the two highways it uses most, for example I-70 W / I-670 W."],
    ["Checkpoint", "A point on the route where the app checks the weather, every 10, 25 or 50 miles."],
    ["ETA", "Estimated time of arrival. When the truck reaches a checkpoint, counted from departure."],
    ["Level", "How dangerous the weather is at a checkpoint. The five levels are Low, Moderate, High, Severe and No Travel."],
    ["No Travel", "The worst level. The truck should not drive through it."],
    ["Owned miles", "The stretch of road one checkpoint covers. A picture below explains it."],
    ["Risk points", "One number for how much bad weather a route has. Every mile scores points by its level, and the points add up. The fewest points wins."],
    ["Heatmap", "The coloured weather layer on the map, for any hour in the next 48 hours."],
    ["Demo weather", "A made-up storm the app can put over any trip, so every risk level shows up even on a calm day."],
    ["TomTom", "The map company whose service gives the truck routes and drive times."],
    ["Open-Meteo", "A free weather service with hour-by-hour forecasts."],
]))

# ---------- Screens ----------
P("""
## What the driver sees

The screenshots below show the real app on the saved Kansas City to Denver trip. The demo storm is on, so every kind of weather shows up. The app shows times in the viewer's own time zone, and these screenshots were taken in GMT+8.

### The answer comes first

The green card answers three questions at a glance. Which road, when you arrive, and the worst thing on the way. Here the answer is to take I-70 W / I-670 W, arrive at 12:09 AM, and expect No Travel wind for the last 67 miles into Denver. The small print explains the choice and the wind rule for this load. With 38,000 lb of cargo, wind over 45 mph counts as No Travel.

Two notes can appear under the answer.

- **A faster road.** If another road is at least an hour faster, a red note says how much time it saves and how much extra bad weather it adds.
- **Leaving later.** If waiting avoids some of the bad weather, a clock note suggests the smallest delay. It reads like *Leave 6 h later, at 9:00 AM: no No Travel weather (now 67 mi).* The section "Leaving later" below explains how.
""")
P(columns("phone-shots", [
    ("The answer card", image("verdict-card.jpg", "Phone: the recommendation card")),
    ("The map, route up", image("phone-route-up-rain.jpg", "Phone: map with the route running up the screen")),
]))
P("""
### Reading the map

- The recommended route is the thick line. Only the stretches with bad weather get a colour, from yellow to dark purple. Clear road stays green. One label marks the worst point, here *No travel wind · 11:17 PM*.
- The other routes are grey. Each has a pill that says how much longer it takes, here +1 h 21 min and +3 h 12 min. Tapping a pill selects that route.
- A Start ring and a destination pin mark the ends of the trip.
- On a phone the map turns so the trip runs up the screen, like a car navigation app. The round button under the layer rail switches back to north up.

### Weather layers and the forecast slider

The rail on the right switches the weather layer between Risk, Wind, Rain, Snow and Off. The card at the bottom has a colour key and a slider for the next 48 hours. The play button moves the slider through them. Wind, rain and snow move on the map. Wind shows as streaks that follow the wind's direction, rain as falling streaks and snow as drifting flakes. Heavier weather means more of them, moving faster.
""")
P(columns("weather-shots", [
    ("Wind", image("wind-streaks.jpg", "Wind layer with moving streaks")),
    ("Rain", image("phone-route-up-rain.jpg", "Rain layer with falling streaks")),
    ("Snow", image("snow-flakes.jpg", "Snow layer with drifting flakes")),
]))
P(image("heatmap-sweep.gif", "The forecast slider playing through 48 hours", "The play button moves through the forecast, and the storm crosses the routes hour by hour."))
P("""
### Settings

Settings hold the checkpoint spacing of 10, 25 or 50 miles, the demo weather switch, and the light or dark theme. Demo weather can combine wind, rain and snow. With none selected, the app uses the real forecast.
""")
P(columns("settings-shot", [
    ("The settings sheet", image("settings-demo-storms.jpg", "Settings with demo weather")),
    ("What demo weather is for", "Real weather is often calm, which makes for a dull demo. Demo weather moves a made-up storm across the area around the routes. The routes, the rules and the scoring stay real. The app always labels it *Demo weather: synthetic storm, not a forecast*."),
]))

# ---------- Time ----------
P("""
## Weather at the hour the truck arrives

Most route tools look at the weather *now*. A truck that leaves Kansas City at 3 AM reaches Denver around 11 AM, so what matters is the forecast for each stretch of road at the hour the truck gets there. TomTom gives the truck's time at every turn of the route, and the app works out an ETA for every point from it. The app then checks each checkpoint against the forecast for its ETA.
""")
P(diagram("time-aware", "A storm sits over mile 430 for the first three hours. The truck gets there about six hours in, after the storm has gone, so the app rates that stretch Low. A check of the weather now would have flagged it.", *D.time_aware()))
P("""**How to read this chart.** Distance along the route runs left to right, and time since the truck left runs bottom to top. The black line is the truck. It gets further as time passes, and each dot is a checkpoint. The red blob is a storm in the forecast. It covers miles 380 to 480, but only for the first three hours. A check of the weather right now would warn about mile 430, marked with a red ✕. The truck reaches mile 430 about six hours in, after the storm has passed.

The app assumes the driver does not stop for breaks.
""")

# ---------- Request ----------
P("""
## How a request flows

When the driver presses the button, the website sends the trip to the backend and waits for one answer, the plan. Only the backend talks to TomTom and the weather service, so the access key stays secret.

Read the picture from left to right. The backend first checks that one person is not sending too many requests. Then it checks that the trip makes sense, which means a place in the US and a departure within 48 hours. Then `plan.build()` does the work, with a limit of 40 seconds. The backend keeps answers from TomTom and the weather service for 30 minutes, so a repeated trip does not ask them again. Each red label is the error the driver gets if that step fails.
""")
P(diagram("architecture", "One request in, one plan out. The backend does all the scoring. The website checks that the answer has the expected shape and draws it.", *D.request_path()))

# ---------- Pipeline ----------
P("""
## How a plan is built

`plan.build()` runs six steps. Each step is a small module with its own tests. The labels on the arrows name the data that moves from one step to the next.
""")
P(diagram("pipeline", "The six steps inside plan.build(). One weather grid feeds both the checkpoints and the 48-hour heatmap, so the map and the scores always agree.", *D.pipeline()))

P("""
### Checkpoints and owned miles

Routes are compared on how many miles of each kind of bad weather they have. The app only checks the weather at checkpoints, though, not along every mile of road.

So each checkpoint covers the road around it, from halfway back to the previous checkpoint to halfway forward to the next. That stretch is its owned miles. Add up the owned miles of every checkpoint with High weather and you get the route's High miles.

**Why not just count checkpoints?** Because the last gap is usually short. On a 60 mile trip with a checkpoint every 25 miles, checkpoints sit at miles 0, 25 and 50, plus the destination at 60. The destination covers only the last 5 miles. If it counted like the others, a shower at the very end would weigh as much as 25 miles of rain on open road.
""")
P(diagram("owned-miles", "A 60 mile trip with a checkpoint every 25 miles. Each bracket is the road one checkpoint covers. Together the brackets cover the 60 miles exactly once.", *D.owned_miles()))
P(table("owned-example", ["If High weather is found at…", "High miles for the route"], [
    ["only the checkpoint at mile 25", "25 miles, because it covers miles 12.5 to 37.5"],
    ["only the destination at mile 60", "5 miles, because it covers miles 55 to 60"],
    ["both", "30 miles"],
]))

P("""
### One lean weather grid

The free weather service limits how many places you can ask about per minute. So the app puts an imaginary grid over the map, keeps only the grid points close to a route, and asks about those. That is about 150 to 200 points per trip. The app sends them in batches of 50 at the same time, so a long trip still plans in seconds.

To get the weather at a checkpoint, the app blends the four grid points around it and gives more weight to the closer ones. Forecasts come in whole hours, so an ETA of 15:20 blends the 15:00 and 16:00 forecasts, mostly 15:00. The heatmap uses the same grid.
""")
P(diagram("lean-grid", "On the left, the app fetches only the grid points near the route. On the right, it blends a checkpoint's weather from the four corners of its cell, then between the two hourly forecasts around its ETA.", *D.lean_grid()))

# ---------- Rules ----------
P("""
## Risk rules

The rules come from the assignment brief. Wind, rain and snow each get a level from this table, and the checkpoint takes the worst of the three. Rain and snow are in inches per hour. Each range starts at its first number and stops just below the next level.
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
    {"lines": "37-45", "label": "Worst wins", "note": "The app rates each kind of weather on its own and keeps the worst. It also keeps the cause, so it can say 'No Travel wind at mile 475'."},
]))

P("""
### Values on a boundary

The brief's table leaves a few values unclear. The app puts a value on a boundary into the more dangerous level, unless the brief says "over".
""")
P(table("boundaries", ["Value", "What the brief's table says", "Level the app uses"], [
    ["Rain of exactly 0.25 in/hr", "Moderate is 0.10 to 0.25 and High is 0.25 to 0.50, so it fits both", "High"],
    ["Wind of 34.5 mph", "Moderate is 25 to 34 and High is 35 to 44, so it fits neither", "Moderate, which covers everything below 35"],
    ["Rain of exactly 1.00 in/hr", "No Travel is over 1.00", "Severe"],
    ["Wind of exactly 55 mph", "No Travel is 55 or more", "No Travel"],
]))
P("""""")

# ---------- Ranking ----------
KC_DEMO = [
    ("I-70 W / I-670 W", "Kansas · 605 mi · 8 h 9 min", {"No Travel": 67.3, "Severe": 50, "High": 75, "Moderate": 50}),
    ("US-36 W / US-34 W", "Small highways · 661 mi · 11 h 21 min", {"No Travel": 100, "Severe": 123.1, "High": 50, "Moderate": 75}),
    ("I-80 W / I-76 W", "Nebraska · 684 mi · 9 h 30 min", {"No Travel": 221.1, "Severe": 50, "High": 50, "Moderate": 50}),
]
P("""
## How the best route is picked

Every route gets risk points. Each mile of road scores points for the weather level of the checkpoint that covers it, and the app adds them up over the whole route. **The route with the fewest points wins.**
""")
P(table("risk-weights", ["Level", "Points per mile", "Same as"], [
    ["Low", "0", ""],
    ["Moderate", "1", ""],
    ["High", "3", "3 Moderate miles"],
    ["Severe", "9", "3 High miles"],
    ["No Travel", "27", "3 Severe miles"],
]))
P("""
Each level counts three times the one below it. Worse weather weighs much more, but a lot of milder weather still counts.

When two routes are within 10 points or 5% of each other, the shorter drive wins. On calm days every route scores 0, so the drive time decides.

Here are the three routes for Kansas City to Denver under the demo storm.
""")
P(diagram("risk-points", "The Kansas route has the fewest risk points, so it wins. The card explains it as 33 fewer miles of No Travel weather than the runner-up, and the route is also 3 h 12 min faster.", *D.risk_points(KC_DEMO)))
P("""
### Why points instead of a fixed order

The brief gives an ordered list of preferences. Fewest Severe miles first, then fewest High miles, then lowest average risk, then shortest time. Read as a strict order, the first difference decides and nothing after it counts. That gives odd results.
""")
P(table("strict-vs-points", ["Route", "Severe miles", "High miles", "Risk points"], [
    ["Route A", "50", "130", "50 × 9 + 130 × 3 = 840"],
    ["Route B", "51", "0", "51 × 9 = 459"],
]))
P("""
A strict order picks route A, because 50 Severe miles is less than 51. But one extra mile of Severe weather should not outweigh 130 extra miles of High weather. Risk points pick route B.

Risk points keep the brief's priorities. Worse weather matters more, and time comes last. The difference is that the amount of weather counts too. Risk points also include No Travel miles, which the brief's list leaves out.

### Why a total, not an average

The brief's average risk divides the points by the route's length. That has two problems, and a total fixes both.

- **Longer routes look safer.** The same bad stretch on a longer route gives a lower average. A detour full of clear road would improve the score without avoiding any weather. A total gives a detour no discount.
- **The brief's scale is too flat.** Average risk scores Moderate 1, High 2, Severe 3 and No Travel 4. A mile you should not drive at all then counts only as much as two miles of heavy rain. Risk points put each level three times above the one below.

The app still reports each route's average risk, but it no longer decides anything.

**The trade-off note.** Bad weather still comes before time, so a route can win while it is hours slower. When another road is at least an hour faster, the card says so in red, with the time saved and the extra bad weather. The driver can then choose for themselves.
""")
P(annotated("ranking-code", "backend/planner/ranking.py", *ranking_excerpt()))
P("""
### Leaving later

The rules treat No Travel as weather you do not drive through, but a driver can also wait. So when the recommended route still meets High weather or worse, the app checks whether leaving 3, 6, 12 or 24 hours later helps. It suggests the smallest delay that lowers the route's risk points by more than a near-tie.

This costs nothing extra. The forecast grid already covers 48 hours, and every checkpoint keeps its distance and travel time from the start. Only the clock moves, so the app reads each checkpoint again at its later ETA without a new weather request. It skips delays the forecast does not reach, and if no delay helps, the card shows nothing.

""")

# ---------- Limits ----------
P("""
## Caching, limits and failures

The backend keeps answers from TomTom and Open-Meteo for 30 minutes. For TomTom it rounds departures up to the next 15 minutes, so people who plan the same trip in the same quarter hour share one request. Each trip's ETAs still count from its own exact departure.
""")
P(diagram("cache-bucket", "Three departures between 14:00 and 14:15 share one TomTom request for 14:15. The departure at 14:21 starts the next quarter hour.", *D.cache_bucket()))
P(table("limits-table", ["Safeguard", "Rule", "If it trips"], [
    ["Rate limit", "10 trips and 60 place searches per minute per person", "429: wait and try again"],
    ["Validation", "US only, leaving within 48 hours, a known time zone", "400: the form says what is wrong"],
    ["Time limit", "40 seconds for the whole plan", "504: try again or open a saved trip"],
    ["Provider limit", "TomTom or Open-Meteo is busy", "503: the app offers the saved trips"],
]))
P("""
**Known limitation.** The cache and the rate limit live in each server's memory. A hosting platform that runs several copies of the backend gives each copy its own. A shared store such as Redis would fix that, but for a proof of concept it is not worth the extra service.
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
P("\n## The plan the backend returns\n\nThere is no database. Everything the website shows comes from this one JSON answer. The backend defines it, and the website checks every answer against matching schemas. An automated test fails if the two sides drift apart.\n")
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
        {"name": "why_not", "type": "per other route"}, {"name": "leave_later", "type": "later departure", "nullable": True}]},
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
P("The heatmap uses one byte per grid point per hour per layer, so 49 hours of five weather layers fit in a small download.\n")

# ---------- Website ----------
P("""
## How the website is put together

- `PlannerScreen.tsx` holds everything the page remembers. That is the trip, the plan, the selected route, the forecast hour and the weather layer.
- `PlannerDesktop.tsx` and `PlannerPhone.tsx` only arrange those pieces. A laptop gets a side panel next to the map, and a phone gets a map with a pull-up sheet.
- `VerdictCard.tsx` is the green answer card, and `RouteRows.tsx` lists the other routes.
- `LayerRail.tsx`, `LayerLegend.tsx` and `TimeControl.tsx` are the layer buttons, the colour key and the 48-hour slider.
- `map/useMapLibre.ts` sets up the map step by step, and `map/windParticles.ts` animates wind, rain and snow.
- `model/planView.ts` turns the raw plan into the words and times on screen.

The map library, MapLibre, is about 1 MB. It loads after the form, so the first screen appears quickly.
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
    {"path": "backend/planner/later.py", "note": "Would leaving later help? The route re-scored at later departures"},
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
    ["Map first on the phone, route running up the screen", "The map is the product, so panels stay small and out of the way."],
    ["Rank by risk points, not a strict order", "The amount of bad weather counts, so one extra Severe mile cannot outweigh 130 High miles."],
    ["Suggest leaving later, using the forecast already fetched", "Waiting is often the real answer to No Travel weather, and checking it needs no extra weather request."],
    ["Demo weather, clearly labelled", "Every risk level shows up on any day, without pretending to be a forecast."],
    ["Times in the viewer's own zone", "Departure, arrival and hazard times match the clock of the person reading them."],
]))
P(callout("limits", "info", "**Limits.** The app covers the US only and departures within 48 hours. It assumes continuous driving with no rest stops. It blends weather from grid points 25 to 40 km apart, which can smooth out very local storms. The cache and rate limits live on each server separately."))

# ---------- Ideas ----------
P("""
## Ideas considered, not built

These came up while building the app. They are thought through but left out of this version on purpose.

### Stopping partway

Leaving later only moves the departure. A driver can also stop on the way. They drive to the last checkpoint before the bad stretch, wait at a truck stop there, then continue. The same grid could score that, because every later ETA moves back by the length of the wait. US truck drivers must also take a 10-hour break after 11 hours of driving. A real version would line waits up with those breaks, instead of suggesting stops a driver cannot legally make.

### Tuning the weights

The weights of 1, 3, 9 and 27 points per mile are a judgment that each level is three times as bad as the one below. Data from real trips, such as delays, incidents or the routes drivers chose, could tune them to match what experienced drivers prefer.
""")

P("""## Running it

```bash
cp .env.example .env   # add a TomTom key
cd backend && uv sync && uv run python manage.py runserver 127.0.0.1:8000
cd frontend && pnpm install && pnpm dev   # http://127.0.0.1:5173
```

Without a TomTom key, the two saved trips still work, with or without demo weather.
""")


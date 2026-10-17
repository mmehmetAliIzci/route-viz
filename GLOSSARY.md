# Route planning

A truck driver plans a trip and compares up to three routes by the weather the truck will meet along each one.

## Trip

**Trip**:
What the driver asks about: origin, destination, departure time, load weight and checkpoint spacing.
_Avoid_: Request, journey, query

**Load weight**:
The weight of the cargo in pounds, as the driver enters it. The load rules apply to this number.
_Avoid_: Weight, payload, gross weight

**Gross weight**:
Load weight plus an assumed empty-truck weight. Only the router sees it.
_Avoid_: Vehicle weight, total weight

**Departure**:
The moment the truck leaves the origin. Every ETA and every hour on the slider counts from it.
_Avoid_: Start time, now

## Routes

**Route**:
One way to drive from origin to destination, as the router returns it, with its distance and travel time. Shown as Route 1, 2, 3.
_Avoid_: Option, path, alternative

**Plan**:
The answer to a trip: its routes, their checkpoints and summaries, the recommendation and the heatmap.
_Avoid_: Result, response

**Checkpoint**:
A point on a route where the weather is checked at the truck's ETA. Checkpoints sit every spacing miles from the origin, plus one at the destination.
_Avoid_: Sample, waypoint, stop

**Spacing**:
The distance between checkpoints: 10, 25 or 50 miles.
_Avoid_: Interval, resolution

**ETA**:
When the truck reaches a checkpoint, counted from departure with no stops.
_Avoid_: Arrival time (that is the ETA at the destination only)

**Owned miles**:
The stretch of route a checkpoint stands for: half the gap to the checkpoint before it plus half the gap to the one after.
_Avoid_: Segment, weight

## Risk

**Level**:
How dangerous the weather is at one checkpoint: Low, Moderate, High, Severe or No Travel. The worst of the wind, rain and snow levels.
_Avoid_: Score, rating, severity

**Cause**:
Which of wind, rain or snow set a checkpoint's level. Low has no cause.
_Avoid_: Reason, driver, factor

**Load rule**:
A rule from the assessment that raises the wind level for heavy loads.
_Avoid_: Weight rule, override

**No Travel**:
The level at which the truck should not drive through. A route with any No Travel miles is never recommended over one without.
_Avoid_: Closed, blocked, unsafe

**Average risk**:
The mile-weighted mean of a route's checkpoint levels, counting Low as 0 and No Travel as 4.
_Avoid_: Risk score, mean level

**Summary**:
A route's No Travel, Severe and High miles, its average risk, worst level and travel time.
_Avoid_: Stats, metrics

**Recommendation**:
The route the ranking order picks, with one sentence saying which criterion beat the runner-up.
_Avoid_: Best route, winner, safest route

## Map

**Heatmap**:
Forecast weather drawn over the area around the routes for one hour, as risk or as wind, rain or snow.
_Avoid_: Overlay, weather layer, field

**Corridor**:
The rectangle around all routes, with a margin, that the heatmap covers.
_Avoid_: Area, bbox, region

**Hour**:
The slider position: whole hours after departure, 0 to 48.
_Avoid_: Time step, frame, forecast hour

**Wind direction**:
Where the wind blows from, as a compass bearing. The wind layer streams particles downwind from it.
_Avoid_: Heading, bearing, wind vector

**Demo weather**:
A made-up storm, one of wind, rain or snow, that sweeps the corridor and replaces the forecast for a plan so every level can be shown. Never a forecast.
_Avoid_: Mock weather, test mode, fake forecast, scenario

## Appearance

**Theme**:
Light or dark colours for the whole app, map included. System follows the device.
_Avoid_: Colors, day, night, dark mode

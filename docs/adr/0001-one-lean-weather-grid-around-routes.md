# One lean weather grid around the routes

Each plan fetches one Open-Meteo grid made only of nodes near the routes: the four corners of every grid cell a route passes through, plus one ring of neighbouring nodes. The step is the smallest of a few fixed sizes that keeps the grid at about 200 nodes or fewer. Checkpoints read their weather from this grid, and the heatmap draws it, with nodes away from the routes left transparent. Open-Meteo counts locations rather than hours, so a plan uses about 80 to 200 locations while keeping real weather everywhere, on the free tier.

## Considered options

- Separate point requests for every checkpoint plus a full bounding-box grid for the heatmap: about 410 locations, so only one plan per minute on the free tier.
- One forecast at the origin copied everywhere: one location, but every route sees the same weather and the heatmap is flat.

## Consequences

Checkpoint weather is interpolated between grid nodes, so it is coarser than a point request. The grid step is shown in the plan so the UI can say how fine the forecast is.

import {
  browserTimeZone,
  type DemoScenario,
  type Level,
  type Place,
  type Plan,
  type PlanCheckpoint,
  type PlanRoute,
} from '../../api/planApi'

// Projection from the API plan to what the route list and the map render. Both read only this.

export type LevelView = { key: Level; label: string; fill: string; ink: string; rank: number }

const WHITE = '#FFFFFF'
const INK = '#111418'

export const LEVELS: Record<Level, LevelView> = {
  low: { key: 'low', label: 'Clear', fill: '#2E7D4F', ink: WHITE, rank: 0 },
  moderate: { key: 'moderate', label: 'Moderate', fill: '#F2B705', ink: INK, rank: 1 },
  high: { key: 'high', label: 'High', fill: '#D9541E', ink: INK, rank: 2 },
  severe: { key: 'severe', label: 'Severe', fill: '#A3123F', ink: WHITE, rank: 3 },
  no_travel: { key: 'no_travel', label: 'No travel', fill: '#3E1F5C', ink: WHITE, rank: 4 },
}

// The colour of a route's clear stretches, and of the selected route's line overall.
export const LOW_ROUTE_COLOR = '#0A6B4B'

export type CheckpointView = {
  id: string
  lon: number
  lat: number
  mileLabel: string
  etaLabel: string // "Fri, 10:00 PM CDT"
  etaShort: string // "10:00 PM"
  level: LevelView
  causeLabel: string | null
  weatherLabel: string
}

export type VsRecommended = { label: string; tone: 'sooner' | 'later' | 'same' }

export type RouteView = {
  id: number
  name: string
  isRecommended: boolean
  isFastest: boolean
  vsRecommended: VsRecommended | null // null on the recommended route
  hazardLine: string | null // the worst hazard in words, or "Clear all the way"; null on the recommended route
  distanceLabel: string
  durationLabel: string
  arrivalLabel: string
  arrivalShort: string
  worst: LevelView
  geometry: [number, number][]
  checkpoints: CheckpointView[]
}

export type Verdict = {
  routeId: number
  headline: string
  reason: string
  closeCall: boolean
  arrivalLabel: string
}

export type PlanView = {
  tripLabel: string // "Kansas City, MO → Denver, CO · 38,000 lb"
  savedLabel: string | null // "Saved trip recorded Thu, Oct 15" for saved trips
  origin: Place
  destination: Place
  viewerTz: string // every time label is in this zone, not the origin's
  departureUtc: string
  routes: RouteView[]
  verdict: Verdict
  departureLabel: string
  forecastLabel: string // says "Demo weather" when the plan is synthetic
  demo: DemoScenario | null // the synthetic storm behind this plan; null for a real forecast
  bounds: [[number, number], [number, number]]
  travelBearing: number // compass heading from origin to destination, for a route-up map
}

export function buildPlanView(plan: Plan): PlanView {
  const tz = plan.trip.viewer_tz ?? browserTimeZone()
  const recommendedId = plan.recommendation.route_id
  const recommended = plan.routes.find((r) => r.id === recommendedId)
  if (!recommended) throw new Error(`The plan recommends route ${recommendedId}, which is not in the plan.`)
  const fastestId = plan.routes.reduce((best, r) => (r.duration_s < best.duration_s ? r : best)).id
  const routes = plan.routes.map((r) => routeView(r, plan.recommendation, recommended, fastestId, tz))
  return {
    tripLabel: `${plan.trip.origin.label} → ${plan.trip.destination.label} · ${plan.trip.load_lb.toLocaleString('en-US')} lb`,
    savedLabel: plan.sample ? `Saved trip, recorded ${formatDate(plan.sample.recorded_utc, tz)}` : null,
    origin: placeView(plan.trip.origin),
    destination: placeView(plan.trip.destination),
    viewerTz: tz,
    departureUtc: plan.trip.departure_utc,
    routes,
    verdict: {
      routeId: recommended.id,
      headline: plan.recommendation.headline,
      reason: plan.recommendation.reason,
      closeCall: plan.recommendation.close_call,
      arrivalLabel: formatClock(recommended.arrival_utc, tz),
    },
    departureLabel: formatTime(plan.trip.departure_utc, tz),
    forecastLabel: plan.demo ? demoLabel(plan.demo) : forecastLabel(plan.weather),
    demo: plan.demo ?? null,
    bounds: boundsOf(plan.routes),
    travelBearing: headingDeg(plan.trip.origin, plan.trip.destination),
  }
}

function placeView(p: Place): Place {
  return { label: p.label, lon: p.lon, lat: p.lat }
}

function routeView(
  r: PlanRoute,
  rec: Plan['recommendation'],
  recommended: PlanRoute,
  fastestId: number,
  tz: string,
): RouteView {
  const isRecommended = r.id === recommended.id
  return {
    id: r.id,
    name: r.name,
    isRecommended,
    isFastest: r.id === fastestId,
    vsRecommended: isRecommended ? null : vsRecommendedLabel(recommended.duration_s - r.duration_s),
    hazardLine: isRecommended ? null : (rec.why_not.find((w) => w.route_id === r.id)?.hazard ?? 'Clear all the way'),
    distanceLabel: `${Math.round(r.distance_mi)} mi`,
    durationLabel: formatDuration(r.duration_s),
    arrivalLabel: formatTime(r.arrival_utc, tz),
    arrivalShort: formatClock(r.arrival_utc, tz),
    worst: LEVELS[r.summary.max_level],
    geometry: r.geometry,
    checkpoints: r.checkpoints.map((c, i) => checkpointView(c, `${r.id}-${i}`, tz)),
  }
}

function checkpointView(c: PlanCheckpoint, id: string, tz: string): CheckpointView {
  return {
    id,
    lon: c.lon,
    lat: c.lat,
    mileLabel: `Mile ${Math.round(c.mile)}`,
    etaLabel: formatTime(c.eta_utc, tz),
    etaShort: formatClock(c.eta_utc, tz),
    level: LEVELS[c.level],
    causeLabel: c.cause ? c.cause.charAt(0).toUpperCase() + c.cause.slice(1) : null,
    weatherLabel: `Wind ${Math.round(c.wind_mph)} mph${c.wind_dir_deg === undefined ? '' : ` from ${compassPoint(c.wind_dir_deg)}`} (gusts ${Math.round(c.gust_mph)}) · Rain ${c.rain_in_hr.toFixed(2)} in/hr · Snow ${c.snow_in_hr.toFixed(1)} in/hr`,
  }
}

// deltaS = recommended duration - this route's duration; positive means this route arrives sooner.
export function vsRecommendedLabel(deltaS: number): VsRecommended {
  // Branch on whole minutes so a gap under 30 s never reads "0 min sooner".
  const minutes = Math.round(deltaS / 60)
  if (minutes > 0) return { label: `${formatDuration(deltaS)} sooner`, tone: 'sooner' }
  if (minutes < 0) return { label: `${formatDuration(-deltaS)} later`, tone: 'later' }
  return { label: 'Same time', tone: 'same' }
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h ${m} min` : `${m} min`
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(iso))
}

// "6:27 AM": a clock time with no weekday or zone.
export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))
}

function boundsOf(routes: PlanRoute[]): [[number, number], [number, number]] {
  const points = routes.flatMap((r) => r.geometry)
  const lons = points.map(([lon]) => lon)
  const lats = points.map(([, lat]) => lat)
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ]
}

// "+3 h · Fri, 12:00 PM CDT" for the slider, counted from departure.
export function hourLabel(plan: PlanView, hour: number): string {
  const whole = Math.round(hour)
  const at = new Date(Date.parse(plan.departureUtc) + whole * 3_600_000).toISOString()
  return `${whole === 0 ? 'Departure' : `+${whole} h`} · ${formatTime(at, plan.viewerTz)}`
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

// The 8-point compass name for a bearing in degrees: 0 is N, 45 is NE, rounded to the nearest point.
export function compassPoint(deg: number): string {
  const point = Math.round((((deg % 360) + 360) % 360) / 45) % COMPASS.length
  return COMPASS[point] ?? 'N'
}

// "Demo weather: a synthetic wind storm sweeping the corridor (not a forecast)"
function demoLabel(demo: DemoScenario): string {
  return `Demo weather: a synthetic ${demo} storm sweeping the corridor (not a forecast)`
}

// "ICON forecast on a 0.35° grid (about 39 km), 189 points"
function forecastLabel(w: Plan['weather']): string {
  const km = Math.round(w.grid_step_deg * 111)
  return `ICON forecast on a ${w.grid_step_deg}° grid (about ${km} km), ${w.locations} points`
}

function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(
    new Date(iso),
  )
}

// The name of the route the map currently shows.
export function selectedRouteName(plan: PlanView, routeId: number): string | undefined {
  return plan.routes.find((r) => r.id === routeId)?.name
}

// Initial great-circle heading from `a` to `b`, in degrees clockwise from north, in [0, 360).
export function headingDeg(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const toRad = Math.PI / 180
  const dLon = (b.lon - a.lon) * toRad
  const lat1 = a.lat * toRad
  const lat2 = b.lat * toRad
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) / toRad) + 360) % 360
}

export type RouteSegment = { color: string; coordinates: [number, number][] }

// The route line split by risk. Each checkpoint owns the stretch of road nearest to it: the
// boundary between two checkpoints is the midpoint of their nearest vertices. Neighbours with the
// same colour merge, and a boundary vertex belongs to both segments so the line has no gaps.
// Clear (Low) checkpoints use the route green rather than the level's own colour.
export function routeSegments(route: RouteView): RouteSegment[] {
  const { geometry, checkpoints } = route
  const last = geometry.length - 1
  if (checkpoints.length === 0 || last < 1) return [{ color: LOW_ROUTE_COLOR, coordinates: geometry }]

  // Nearest vertex per checkpoint, never moving backwards so a looping route keeps its order.
  let floor = 0
  const owned = checkpoints.map((c) => {
    floor = Math.max(floor, nearestVertex(geometry, c))
    return { index: floor, color: c.level.rank === 0 ? LOW_ROUTE_COLOR : c.level.fill }
  })

  const runs: { color: string; start: number; end: number }[] = []
  owned.forEach((c, i) => {
    const start = i === 0 ? 0 : Math.floor(((owned[i - 1]?.index ?? 0) + c.index) / 2)
    const end = i === owned.length - 1 ? last : Math.floor((c.index + (owned[i + 1]?.index ?? last)) / 2)
    const previous = runs[runs.length - 1]
    if (previous?.color === c.color) previous.end = end
    else runs.push({ color: c.color, start, end })
  })
  return runs
    .filter((r) => r.end > r.start) // two checkpoints on one vertex leave a stretch with no length
    .map((r) => ({ color: r.color, coordinates: geometry.slice(r.start, r.end + 1) }))
}

// Index of the geometry vertex closest to the checkpoint, with longitude scaled by cos(lat).
function nearestVertex(geometry: [number, number][], at: { lon: number; lat: number }): number {
  const kx = Math.cos((at.lat * Math.PI) / 180)
  let best = 0
  let bestD = Infinity
  geometry.forEach(([lon, lat], i) => {
    const d = ((lon - at.lon) * kx) ** 2 + (lat - at.lat) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

// The highest-level checkpoint above Low (the first on ties), or null when the route is clear.
export function worstHazard(route: RouteView): CheckpointView | null {
  let worst: CheckpointView | null = null
  for (const c of route.checkpoints) {
    if (c.level.rank > 0 && c.level.rank > (worst?.level.rank ?? 0)) worst = c
  }
  return worst
}

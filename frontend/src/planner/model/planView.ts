import { browserTimeZone, type Level, type Plan, type PlanCheckpoint, type PlanRoute } from '../../api/planApi'

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

export type CheckpointView = {
  id: string
  lon: number
  lat: number
  mileLabel: string
  etaLabel: string
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
  viewerTz: string // every time label is in this zone, not the origin's
  departureUtc: string
  routes: RouteView[]
  verdict: Verdict
  departureLabel: string
  forecastLabel: string
  bounds: [[number, number], [number, number]]
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
    forecastLabel: forecastLabel(plan.weather),
    bounds: boundsOf(plan.routes),
  }
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
    level: LEVELS[c.level],
    causeLabel: c.cause ? c.cause.charAt(0).toUpperCase() + c.cause.slice(1) : null,
    weatherLabel: `Wind ${Math.round(c.wind_mph)} mph (gusts ${Math.round(c.gust_mph)}) · Rain ${c.rain_in_hr.toFixed(2)} in/hr · Snow ${c.snow_in_hr.toFixed(1)} in/hr`,
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

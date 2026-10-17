import { z } from 'zod'

// Boundary with the Django API. Everything the app reads from the network passes these schemas.

const Level = z.enum(['low', 'moderate', 'high', 'severe', 'no_travel'])
export type Level = z.infer<typeof Level>

const Place = z.object({ label: z.string(), lat: z.number(), lon: z.number() })
export type Place = z.infer<typeof Place>

const Checkpoint = z.object({
  mile: z.number(),
  lon: z.number(),
  lat: z.number(),
  eta_utc: z.string(),
  wind_mph: z.number(),
  wind_dir_deg: z.number().optional(), // direction the wind blows from, 0-359; absent on older saved plans
  gust_mph: z.number(),
  rain_in_hr: z.number(),
  snow_in_hr: z.number(),
  level: Level,
  cause: z.enum(['wind', 'rain', 'snow']).nullable(),
})

const Route = z.object({
  id: z.number(),
  name: z.string(),
  distance_mi: z.number(),
  duration_s: z.number(),
  arrival_utc: z.string(),
  geometry: z.array(z.tuple([z.number(), z.number()])),
  checkpoints: z.array(Checkpoint),
  summary: z.object({
    no_travel_mi: z.number(),
    severe_mi: z.number(),
    high_mi: z.number(),
    moderate_mi: z.number(),
    avg_risk: z.number(),
    max_level: Level,
  }),
})

const Channel = z.object({ scale: z.number(), data: z.string() })

// Synthetic weather for demos: one front sweeping the corridor. The plan says so when it is in effect.
const DemoScenario = z.enum(['wind', 'rain', 'snow'])
export type DemoScenario = z.infer<typeof DemoScenario>

const SampleInfo = z.object({ id: z.string(), label: z.string(), recorded_utc: z.string() })
export type SampleInfo = z.infer<typeof SampleInfo>

const Plan = z
  .object({
    sample: SampleInfo.optional(), // present on saved trips only
    demo: z.array(DemoScenario).min(1).optional(), // present when the weather is synthetic demo weather, not a forecast
    trip: z.object({
      origin: Place,
      destination: Place,
      departure_utc: z.string(),
      load_lb: z.number(),
      spacing_mi: z.number(),
      origin_tz: z.string(),
      viewer_tz: z.string().optional(), // absent on older saved plans; the browser zone stands in
    }),
    routes: z.array(Route).min(1),
    recommendation: z.object({
      route_id: z.number(),
      runner_up_id: z.number().nullable(),
      decided_by: z.string().nullable(),
      time_vs_runner_up_s: z.number(),
      headline: z.string(),
      reason: z.string(),
      why_not: z.array(z.object({ route_id: z.number(), text: z.string(), hazard: z.string().nullable() })),
      close_call: z.boolean(),
    }),
    weather: z.object({
      model: z.string(),
      source: z.string(),
      grid_step_deg: z.number(),
      locations: z.number(),
    }),
    heatmap: z.object({
      west: z.number(),
      south: z.number(),
      step_deg: z.number(),
      nx: z.number(),
      ny: z.number(),
      hours: z.number(),
      start_utc: z.string(),
      layout: z.string(),
      mask: z.string(),
      // wind_dir: degrees the wind blows from, halved into one byte (scale 2); absent on older saved plans
      channels: z.object({ risk: Channel, wind: Channel, rain: Channel, snow: Channel, wind_dir: Channel.optional() }),
    }),
  })
  .refine(
    (p) => {
      const ids = new Set(p.routes.map((r) => r.id))
      const recId = p.recommendation.route_id
      return (
        ids.has(recId) && p.recommendation.why_not.every((w) => ids.has(w.route_id) && w.route_id !== recId)
      )
    },
    { message: 'The recommendation must name routes that are in the plan.' },
  )
export type Plan = z.infer<typeof Plan>
export type PlanRoute = z.infer<typeof Route>
export type PlanCheckpoint = z.infer<typeof Checkpoint>

export type TripInput = {
  origin: Place
  destination: Place
  departure_utc: string
  load_lb: number
  spacing_mi: 10 | 25 | 50
}

const ApiErrorBody = z.object({ error: z.string(), message: z.string() })

export class ApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function readJson(resp: Response): Promise<unknown> {
  const body: unknown = await resp.json().catch(() => null)
  if (!resp.ok) {
    const parsed = ApiErrorBody.safeParse(body)
    throw parsed.success
      ? new ApiError(parsed.data.error, parsed.data.message)
      : new ApiError('http_error', `The server answered ${resp.status}.`)
  }
  return body
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) throw new ApiError('bad_response', 'The server sent an answer the app does not understand.')
  return result.data
}

// The viewer's own IANA zone. Every time on screen is shown in it, wherever the trip starts.
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// `demo` asks for synthetic demo weather (one or more storms on one front) instead of the forecast;
// omit it or pass an empty list for a real plan.
export async function postPlan(trip: TripInput, demo?: DemoScenario[], signal?: AbortSignal): Promise<Plan> {
  const resp = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...trip, viewer_tz: browserTimeZone(), ...(demo?.length ? { demo: demo.join(',') } : {}) }),
    signal,
  })
  return parse(Plan, await readJson(resp))
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const resp = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal })
  return parse(z.object({ results: z.array(Place) }), await readJson(resp)).results
}

export async function listSamples(signal?: AbortSignal): Promise<SampleInfo[]> {
  const resp = await fetch('/api/samples', { signal })
  return parse(z.object({ samples: z.array(SampleInfo) }), await readJson(resp)).samples
}

export async function getSample(id: string, demo?: DemoScenario[]): Promise<Plan> {
  const params = new URLSearchParams({ tz: browserTimeZone() })
  if (demo?.length) params.set('demo', demo.join(','))
  const resp = await fetch(`/api/samples/${encodeURIComponent(id)}?${params}`)
  return parse(Plan, await readJson(resp))
}

export function parsePlan(body: unknown): Plan {
  return parse(Plan, body)
}

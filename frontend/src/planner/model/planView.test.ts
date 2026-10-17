import fixture from '../../test/plan-kc-den.json'
import { parsePlan } from '../../api/planApi'
import {
  LEVELS,
  LOW_ROUTE_COLOR,
  buildPlanView,
  compassPoint,
  formatClock,
  formatDuration,
  formatTime,
  hourLabel,
  routeSegments,
  vsRecommendedLabel,
  worstHazard,
  worstStretch,
  stretchSentence,
  loadNote,
  type CheckpointView,
  type RouteView,
} from './planView'

const plan = parsePlan(fixture)

describe('hazardLine', () => {
  it('describes each route by its worst stretch, and says clear when nothing is above Low', () => {
    const [first, ...rest] = plan.routes
    const stormy = {
      ...first!,
      checkpoints: first!.checkpoints.map((c, i) => (i >= 2 && i <= 4 ? { ...c, level: 'severe' as const, cause: 'rain' as const } : c)),
    }
    const view = buildPlanView({ ...plan, routes: [stormy, ...rest] })
    const route = view.routes.find((r) => r.id === first!.id)!
    expect(route.stretch?.level.key).toBe('severe')
    expect(route.stretch?.cause).toBe('rain')
    const cps = first!.checkpoints
    const owned = (cps[4]!.mile + cps[5]!.mile) / 2 - (cps[1]!.mile + cps[2]!.mile) / 2 // halfway to each neighbour
    expect(route.stretch?.miles).toBe(Math.round(owned))
    expect(route.stretchShort).toBe(`Severe rain, ${route.stretch?.miles} mi`)
    expect(view.routes.filter((r) => r.id !== first!.id).every((r) => r.stretchShort === 'Clear all the way')).toBe(true)
  })
})

describe('buildPlanView', () => {
  const view = buildPlanView(plan)

  it('marks exactly the recommended route', () => {
    expect(view.routes.filter((r) => r.isRecommended).map((r) => r.id)).toEqual([plan.recommendation.route_id])
  })

  it('shows times in the viewer time zone the plan names', () => {
    expect(view.viewerTz).toBe('America/Chicago') // the browser zone, pinned in test-setup
    expect(view.departureLabel).toBe('Fri, 9:00 AM CDT') // 14:00 UTC
    const denver = buildPlanView(parsePlan({ ...fixture, trip: { ...fixture.trip, viewer_tz: 'America/Denver' } }))
    expect(denver.viewerTz).toBe('America/Denver')
    expect(denver.departureLabel).toBe('Fri, 8:00 AM MDT')
    expect(denver.verdict.arrivalLabel).toBe(formatClock(plan.routes[0]!.arrival_utc, 'America/Denver'))
  })

  it('falls back to the browser time zone for a plan without viewer_tz', () => {
    expect(plan.trip.viewer_tz).toBeUndefined()
    const tokyo = buildPlanView(parsePlan({ ...fixture, trip: { ...fixture.trip, viewer_tz: 'Asia/Tokyo' } }))
    expect(tokyo.departureLabel).toBe('Fri, 11:00 PM GMT+9')
  })

  it('counts the slider hours in the viewer time zone', () => {
    const denver = buildPlanView(parsePlan({ ...fixture, trip: { ...fixture.trip, viewer_tz: 'America/Denver' } }))
    expect(hourLabel(denver, 0)).toBe('Departure · Fri, 8:00 AM MDT')
    expect(hourLabel(denver, 3)).toBe('+3 h · Fri, 11:00 AM MDT')
  })

  it('keeps one checkpoint view per checkpoint with its level colour', () => {
    plan.routes.forEach((r, i) => {
      expect(view.routes[i]?.checkpoints).toHaveLength(r.checkpoints.length)
    })
    expect(view.routes[0]?.checkpoints[0]?.mileLabel).toBe('Mile 0')
  })

  it('builds the verdict from the recommended route', () => {
    const recommended = plan.routes.find((r) => r.id === plan.recommendation.route_id)
    expect(view.verdict.routeId).toBe(plan.recommendation.route_id)
    expect(recommended).toBeDefined()
    expect(view.verdict.headline).toBe(plan.recommendation.headline)
    expect(view.verdict.whyLine).toBe('Same weather as I-80 W / I-76 W, 1 h 16 min faster.')
    expect(view.verdict.stretchLine).toBe('Clear all the way. Nothing above Low at any checkpoint.')
    expect(view.verdict.durationLabel).toBe(formatDuration(recommended?.duration_s ?? 0))
    expect(view.verdict.loadNote).toBeNull()
    expect(view.verdict.closeCall).toBe(plan.recommendation.close_call)
    expect(view.verdict.arrivalLabel).toBe(formatClock(recommended?.arrival_utc ?? '', view.viewerTz))
  })

  it('compares every other route with the recommended one, and the recommended one with nothing', () => {
    for (const r of view.routes) {
      if (r.isRecommended) {
        expect(r.vsRecommended).toBeNull()
      } else {
        expect(r.vsRecommended).not.toBeNull()
      }
    }
  })

  it('says whether each other route is sooner, later or the same, from the fixture durations', () => {
    const recommended = plan.routes.find((r) => r.id === plan.recommendation.route_id)
    expect(recommended).toBeDefined()
    for (const r of view.routes.filter((v) => !v.isRecommended)) {
      const route = plan.routes.find((p) => p.id === r.id)
      const delta = (recommended?.duration_s ?? 0) - (route?.duration_s ?? 0)
      const tone = delta > 0 ? 'sooner' : delta < 0 ? 'later' : 'same'
      expect(r.vsRecommended?.tone).toBe(tone)
    }
  })

  it('marks exactly one fastest route, the one with the smallest duration', () => {
    const fastest = view.routes.filter((r) => r.isFastest)
    expect(fastest).toHaveLength(1)
    const min = Math.min(...plan.routes.map((r) => r.duration_s))
    expect(plan.routes.find((r) => r.id === fastest[0]?.id)?.duration_s).toBe(min)
  })

  it('gives each route a short arrival in the viewer time zone', () => {
    view.routes.forEach((r, i) => {
      expect(r.arrivalShort).toBe(formatClock(plan.routes[i]?.arrival_utc ?? '', view.viewerTz))
    })
  })

  it('bounds cover every route', () => {
    const [[w, s], [e, n]] = view.bounds
    for (const [lon, lat] of plan.routes.flatMap((r) => r.geometry)) {
      expect(lon).toBeGreaterThanOrEqual(w)
      expect(lon).toBeLessThanOrEqual(e)
      expect(lat).toBeGreaterThanOrEqual(s)
      expect(lat).toBeLessThanOrEqual(n)
    }
  })
})

describe('labels', () => {
  it('formats durations', () => {
    expect(formatDuration(30_600)).toBe('8 h 30 min')
    expect(formatDuration(1_500)).toBe('25 min')
  })

  it('formats a time across a daylight saving change', () => {
    expect(formatTime('2026-11-01T06:30:00Z', 'America/Chicago')).toBe('Sun, 1:30 AM CDT')
    expect(formatTime('2026-11-01T07:30:00Z', 'America/Chicago')).toBe('Sun, 1:30 AM CST')
  })

  it('formats a clock time without weekday or zone', () => {
    expect(formatClock('2026-10-16T11:27:00Z', 'America/Chicago')).toBe('6:27 AM')
  })

  it('compares a route with the recommended one', () => {
    expect(vsRecommendedLabel(4465)).toEqual({ label: '−1 h 14 min', tone: 'sooner' })
    expect(vsRecommendedLabel(-6862)).toEqual({ label: '+1 h 54 min', tone: 'later' })
    expect(vsRecommendedLabel(0)).toEqual({ label: 'Same time', tone: 'same' })
  })

  it('treats a gap under half a minute as the same time', () => {
    expect(vsRecommendedLabel(20)).toEqual({ label: 'Same time', tone: 'same' })
    expect(vsRecommendedLabel(-20)).toEqual({ label: 'Same time', tone: 'same' })
    expect(vsRecommendedLabel(40)).toEqual({ label: '−1 min', tone: 'sooner' })
    expect(vsRecommendedLabel(-40)).toEqual({ label: '+1 min', tone: 'later' })
  })

  it('names the risk levels for drivers', () => {
    expect(LEVELS.low.label).toBe('Clear')
    expect(LEVELS.no_travel.label).toBe('No travel')
    expect(LEVELS.moderate.fill).toBe('#F2B705')
  })
})

describe('parsePlan', () => {
  it('rejects an answer with an unknown level', () => {
    const bad = structuredClone(fixture) as { routes: { checkpoints: { level: string }[] }[] }
    const first = bad.routes[0]?.checkpoints[0]
    if (first) first.level = 'extreme'
    expect(() => parsePlan(bad)).toThrow('does not understand')
  })
})

describe('a recommendation that does not match the routes', () => {
  it('is rejected by parsePlan when the recommended route is missing', () => {
    const bad = structuredClone(fixture) as { recommendation: { route_id: number } }
    bad.recommendation.route_id = 99
    expect(() => parsePlan(bad)).toThrow('does not understand')
  })

  it('is rejected when why_not names the recommended route or an unknown one', () => {
    const own = structuredClone(fixture) as {
      recommendation: { route_id: number; why_not: { route_id: number }[] }
    }
    const first = own.recommendation.why_not[0]
    if (first) first.route_id = own.recommendation.route_id
    expect(() => parsePlan(own)).toThrow('does not understand')
    const unknown = structuredClone(fixture) as { recommendation: { why_not: { route_id: number }[] } }
    const w = unknown.recommendation.why_not[0]
    if (w) w.route_id = 99
    expect(() => parsePlan(unknown)).toThrow('does not understand')
  })

  it('makes buildPlanView throw instead of picking route 0', () => {
    const broken = { ...plan, recommendation: { ...plan.recommendation, route_id: 99 } }
    expect(() => buildPlanView(broken)).toThrow('not in the plan')
  })
})

describe('saved trips', () => {
  it('labels a saved trip with its recording day in the viewer time zone', () => {
    const saved = parsePlan({ ...fixture, sample: { id: 'x', label: 'A to B', recorded_utc: '2026-10-15T04:30:00Z' } })
    expect(buildPlanView(saved).savedLabel).toBe('Saved trip, recorded Wed, Oct 14')
    expect(buildPlanView(plan).savedLabel).toBeNull()
  })
})

describe('demo weather', () => {
  it('says the weather is synthetic, and leaves a real forecast alone', () => {
    const demo = buildPlanView({ ...plan, demo: ['wind'] })
    expect(demo.demo).toEqual(['wind'])
    expect(demo.forecastLabel).toBe('Demo weather: a synthetic wind storm sweeping the corridor (not a forecast)')
    expect(buildPlanView({ ...plan, demo: ['snow'] }).forecastLabel).toContain('synthetic snow storm')
    expect(buildPlanView({ ...plan, demo: ['wind', 'rain', 'snow'] }).forecastLabel).toContain('synthetic wind, rain and snow storm')
    const real = buildPlanView(plan)
    expect(real.demo).toBeNull()
    expect(real.forecastLabel).toMatch(/^ICON forecast/)
  })
})

describe('compassPoint', () => {
  it('names the nearest of eight points', () => {
    const cases: [number, string][] = [[0, 'N'], [22, 'N'], [23, 'NE'], [90, 'E'], [180, 'S'], [225, 'SW'], [337, 'NW'], [338, 'N'], [359, 'N']]
    for (const [deg, name] of cases) expect(compassPoint(deg)).toBe(name)
  })
})

describe('checkpoint weather label', () => {
  const first = plan.routes[0]!.checkpoints[0]!
  const withCheckpoint = (c: typeof first) =>
    buildPlanView({ ...plan, routes: plan.routes.map((r, i) => (i === 0 ? { ...r, checkpoints: [c] } : r)) })
      .routes[0]!.checkpoints[0]!.weatherLabel

  it('names the wind direction when the plan has one', () => {
    const label = withCheckpoint({ ...first, wind_mph: 22.4, gust_mph: 30.2, wind_dir_deg: 225 })
    expect(label).toMatch(/^Wind 22 mph from SW \(gusts 30\) · Rain /)
  })

  it('leaves the direction out for an older plan without it', () => {
    const label = withCheckpoint({ ...first, wind_mph: 22.4, gust_mph: 30.2, wind_dir_deg: undefined })
    expect(label).toMatch(/^Wind 22 mph \(gusts 30\) · Rain /)
  })
})

// A straight west-to-east road of 11 vertices at the equator, one degree apart.
const road: [number, number][] = Array.from({ length: 11 }, (_, i) => [i, 0])

function checkpoint(vertex: number, level: keyof typeof LEVELS, cause: string | null = null): CheckpointView {
  return {
    id: `c${vertex}`,
    lon: vertex,
    lat: 0.1, // just off the road, nearest to this vertex
    mile: vertex,
    mileLabel: `Mile ${vertex}`,
    etaLabel: 'Fri, 10:00 PM CDT',
    etaShort: '10:00 PM',
    level: LEVELS[level],
    causeLabel: cause,
    weatherLabel: '',
  }
}

function route(checkpoints: CheckpointView[]): RouteView {
  return { ...buildPlanView(plan).routes[0]!, geometry: road, checkpoints }
}

describe('routeSegments', () => {
  it('is one green segment over every vertex when all checkpoints are Low', () => {
    const segments = routeSegments(route([checkpoint(0, 'low'), checkpoint(5, 'low'), checkpoint(10, 'low')]))
    expect(segments).toEqual([{ color: LOW_ROUTE_COLOR, coordinates: road }])
  })

  it('is one green segment for a route with no checkpoints', () => {
    expect(routeSegments(route([]))).toEqual([{ color: LOW_ROUTE_COLOR, coordinates: road }])
  })

  it('gives a Moderate checkpoint in the middle its own segment, sharing boundary vertices', () => {
    const segments = routeSegments(route([checkpoint(0, 'low'), checkpoint(5, 'moderate'), checkpoint(10, 'low')]))
    expect(segments.map((s) => s.color)).toEqual([LOW_ROUTE_COLOR, LEVELS.moderate.fill, LOW_ROUTE_COLOR])
    const [first, middle, last] = segments.map((s) => s.coordinates)
    expect(first![0]).toEqual(road[0])
    expect(last!.at(-1)).toEqual(road[10])
    expect(first!.at(-1)).toEqual(middle![0]) // no gap
    expect(middle!.at(-1)).toEqual(last![0])
    // Every vertex once, except the two shared boundary vertices.
    expect(first!.length + middle!.length + last!.length).toBe(road.length + 2)
    expect([...first!, ...middle!.slice(1), ...last!.slice(1)]).toEqual(road)
  })

  it('merges neighbouring checkpoints of the same colour', () => {
    const segments = routeSegments(
      route([checkpoint(1, 'low'), checkpoint(3, 'high'), checkpoint(5, 'high'), checkpoint(9, 'low')]),
    )
    expect(segments.map((s) => s.color)).toEqual([LOW_ROUTE_COLOR, LEVELS.high.fill, LOW_ROUTE_COLOR])
  })

  it('drops a stretch with no length when two checkpoints sit on one vertex', () => {
    const segments = routeSegments(route([checkpoint(5, 'low'), checkpoint(5, 'high'), checkpoint(5, 'low')]))
    expect(segments.every((s) => s.coordinates.length >= 2)).toBe(true)
  })
})

describe('worstHazard', () => {
  it('is the highest level above Low, the first on ties, and null on a clear route', () => {
    const a = checkpoint(2, 'high', 'Wind')
    const b = checkpoint(6, 'high', 'Rain')
    const c = checkpoint(8, 'moderate')
    expect(worstHazard(route([checkpoint(0, 'low'), c, a, b]))).toBe(a)
    expect(worstHazard(route([checkpoint(0, 'low')]))).toBeNull()
  })
})

describe('trip ends', () => {
  it('carries the origin and destination of the plan', () => {
    const view = buildPlanView(plan)
    expect(view.origin).toEqual({ label: plan.trip.origin.label, lon: plan.trip.origin.lon, lat: plan.trip.origin.lat })
    expect(view.destination.label).toBe(plan.trip.destination.label)
  })
})

describe('worstStretch', () => {
  const cps = (levels: (keyof typeof LEVELS)[], cause: string | null = 'Wind') =>
    levels.map((lv, i) => ({ ...checkpoint(i, lv, lv === 'low' ? null : cause), mile: i * 25, etaShort: `${i}:00 PM` }))

  it('is null when every checkpoint is Low', () => {
    expect(worstStretch(cps(['low', 'low', 'low']), 75)).toBeNull()
  })

  it('finds the longest run at the highest level, with its miles and clock span', () => {
    const run = worstStretch(cps(['low', 'severe', 'low', 'severe', 'severe', 'low']), 150)!
    expect(run.level.key).toBe('severe')
    expect(run.cause).toBe('wind')
    expect([run.fromMile, run.toMile, run.miles]).toEqual([63, 113, 50]) // halfway to the Low neighbours
    expect([run.fromClock, run.toClock]).toEqual(['3:00 PM', '4:00 PM'])
    expect(run.startsAtOrigin).toBe(false)
    expect(run.endsAtDestination).toBe(false)
  })

  it('writes the sentence around the trip ends', () => {
    const intoDenver = worstStretch(cps(['low', 'low', 'no_travel', 'no_travel']), 90) // the run owns mile 37.5 to the end
    expect(stretchSentence(intoDenver, 'Kansas City, MO', 'Denver, CO')).toBe(
      'No travel wind for the last 53 mi into Denver, CO, 2:00 PM to 3:00 PM.',
    )
    const outOfKc = worstStretch(cps(['moderate', 'low', 'low'], 'Rain'), 75) // owns the origin to mile 12.5
    expect(stretchSentence(outOfKc, 'Kansas City, MO', 'Denver, CO')).toBe('Moderate rain for the first 13 mi out of Kansas City, MO, around 0:00 PM.')
    expect(stretchSentence(null, 'a', 'b')).toBe('Clear all the way. Nothing above Low at any checkpoint.')
  })

  it('states the wind rule for the load', () => {
    expect(loadNote(38_000)).toBe('38,000 lb load: wind over 45 mph is No Travel.')
    expect(loadNote(44_000)).toContain('over 35 mph is Severe')
    expect(loadNote(20_000)).toContain('over 55 mph')
  })
})

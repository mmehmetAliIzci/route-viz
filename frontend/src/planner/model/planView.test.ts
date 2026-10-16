import fixture from '../../test/plan-kc-den.json'
import { parsePlan } from '../../api/planApi'
import { LEVELS, buildPlanView, formatClock, formatDuration, formatTime, hourLabel, vsRecommendedLabel } from './planView'

const plan = parsePlan(fixture)

describe('hazardLine', () => {
  it('is the hazard sentence, or Clear all the way when there is none', () => {
    const hazard = 'Moderate rain at mile 175 around 5:23 AM.'
    const withHazard = buildPlanView({
      ...plan,
      recommendation: {
        ...plan.recommendation,
        why_not: plan.recommendation.why_not.map((w, i) => (i === 0 ? { ...w, hazard } : { ...w, hazard: null })),
      },
    })
    const others = withHazard.routes.filter((r) => !r.isRecommended)
    expect(others[0]?.hazardLine).toBe(hazard)
    expect(others[1]?.hazardLine).toBe('Clear all the way')
    expect(withHazard.routes.find((r) => r.isRecommended)?.hazardLine).toBeNull()
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
    expect(view.verdict.reason).toBe(plan.recommendation.reason)
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
    expect(vsRecommendedLabel(4465)).toEqual({ label: '1 h 14 min sooner', tone: 'sooner' })
    expect(vsRecommendedLabel(-6862)).toEqual({ label: '1 h 54 min later', tone: 'later' })
    expect(vsRecommendedLabel(0)).toEqual({ label: 'Same time', tone: 'same' })
  })

  it('treats a gap under half a minute as the same time', () => {
    expect(vsRecommendedLabel(20)).toEqual({ label: 'Same time', tone: 'same' })
    expect(vsRecommendedLabel(-20)).toEqual({ label: 'Same time', tone: 'same' })
    expect(vsRecommendedLabel(40)).toEqual({ label: '1 min sooner', tone: 'sooner' })
    expect(vsRecommendedLabel(-40)).toEqual({ label: '1 min later', tone: 'later' })
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

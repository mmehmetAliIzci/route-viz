import type { Plan } from '../../api/planApi'
import { decodeHeatmap } from '../model/heatmap'
import {
  budgetedCount,
  createFrameBudget,
  createParticles,
  MAX_PARTICLES,
  MIN_PARTICLES,
  recordFrame,
  SLOW_FRAME_MS,
  SLOW_FRAMES_TO_HALVE,
  CSS_PX_PER_PARTICLE,
  MAX_STEP_S,
  particleCount,
  seededRandom,
  setParticleCount,
  SPEED_PX_PER_MPH_PER_S,
  stepParticles,
  TRAIL_POINTS,
  type MapView,
} from './windParticles'

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))

// 5 x 3 nodes half a degree apart from (-100, 38), one hour, the same wind everywhere.
const NX = 5
const NY = 3
const EAST = -100 + (NX - 1) * 0.5
function corridor({ mph = 30, fromDeg = 270, mask = new Array(NX * NY).fill(1) } = {}) {
  const n = NX * NY
  const zeros = b64(new Array(n).fill(0))
  const heatmap: Plan['heatmap'] = {
    west: -100,
    south: 38,
    step_deg: 0.5,
    nx: NX,
    ny: NY,
    hours: 1,
    start_utc: '2026-10-16T14:00:00Z',
    layout: 'hour, then row south to north, then column west to east',
    mask: b64(mask),
    channels: {
      risk: { scale: 1, data: zeros },
      wind: { scale: 0.5, data: b64(new Array(n).fill(mph * 2)) },
      rain: { scale: 0.005, data: zeros },
      snow: { scale: 0.02, data: zeros },
      wind_dir: { scale: 2, data: b64(new Array(n).fill(fromDeg / 2)) },
    },
  }
  return decodeHeatmap(heatmap)
}

// A flat map at 100 px per degree, north up.
const PX_PER_DEG = 100
const view: MapView = {
  project: (lon, lat) => [(lon + 100) * PX_PER_DEG, -(lat - 38) * PX_PER_DEG],
  unproject: (x, y) => [x / PX_PER_DEG - 100, 38 - y / PX_PER_DEG],
  area: null,
}

const head = (trail: number[]): [number, number] => [trail[trail.length - 2] ?? Number.NaN, trail[trail.length - 1] ?? Number.NaN]

describe('createParticles', () => {
  it('seeds only cells whose four nodes have a forecast', () => {
    // only the south-west cell (nodes 0, 1, 5, 6) is complete
    const mask = new Array(NX * NY).fill(0)
    for (const k of [0, 1, 5, 6, 2]) mask[k] = 1
    const state = createParticles(corridor({ mask }), 200, seededRandom(1))
    expect(state.particles).toHaveLength(200)
    for (const p of state.particles) {
      const [lon, lat] = head(p.trail)
      expect(lon).toBeGreaterThanOrEqual(-100)
      expect(lon).toBeLessThan(-99.5)
      expect(lat).toBeGreaterThanOrEqual(38)
      expect(lat).toBeLessThan(38.5)
    }
  })

  it('spreads the ages so particles do not respawn together', () => {
    const ages = new Set(createParticles(corridor(), 100, seededRandom(2)).particles.map((p) => p.age))
    expect(ages.size).toBeGreaterThan(20)
  })

  it('has no particles when no cell has a forecast', () => {
    const state = createParticles(corridor({ mask: new Array(NX * NY).fill(0) }), 50, seededRandom(3))
    expect(state.particles).toEqual([])
  })
})

describe('stepParticles', () => {
  it('moves particles downwind at a speed set in screen pixels', () => {
    const state = createParticles(corridor({ mph: 30, fromDeg: 180 }), 20, seededRandom(4)) // southerly: blows north
    for (const p of state.particles) p.age = 0
    const before = state.particles.map((p) => head(p.trail))
    stepParticles(state, corridor({ mph: 30, fromDeg: 180 }), 0, view, 1 / 60)
    state.particles.forEach((p, n) => {
      const [lon, lat] = head(p.trail)
      const [lon0, lat0] = before[n] ?? []
      expect(lon).toBeCloseTo(lon0 ?? Number.NaN, 6)
      expect(((lat - (lat0 ?? 0)) * PX_PER_DEG) / (1 / 60)).toBeCloseTo(30 * SPEED_PX_PER_MPH_PER_S, 3)
    })
  })

  it('clamps a long frame so particles are not flung', () => {
    const field = corridor()
    const fast = createParticles(field, 1, seededRandom(5))
    const capped = createParticles(field, 1, seededRandom(5))
    stepParticles(fast, field, 0, view, 10)
    stepParticles(capped, field, 0, view, MAX_STEP_S)
    expect(fast.particles).toEqual(capped.particles)
  })

  it('respawns a particle that leaves the corridor', () => {
    const field = corridor({ mph: 30, fromDeg: 270 }) // westerly: blows east
    const state = createParticles(field, 1, seededRandom(6))
    const p = state.particles[0]!
    p.age = 0
    p.trail = [EAST - 0.001, 38.2]
    stepParticles(state, field, 0, view, MAX_STEP_S) // crosses the east edge
    expect(head(state.particles[0]!.trail)[0]).toBeGreaterThan(EAST)
    stepParticles(state, field, 0, view, MAX_STEP_S)
    const respawned = state.particles[0]!
    expect(respawned.trail).toHaveLength(2)
    expect(respawned.age).toBe(0)
    expect(head(respawned.trail)[0]).toBeLessThanOrEqual(EAST)
  })

  it('respawns a particle that ages out', () => {
    const field = corridor()
    const state = createParticles(field, 1, seededRandom(7))
    const p = state.particles[0]!
    p.age = p.maxAge - 1
    stepParticles(state, field, 0, view, 1 / 60)
    expect(state.particles[0]!.age).toBe(0)
    expect(state.particles[0]!.trail).toHaveLength(2)
  })

  it('respawns particles in near-calm air', () => {
    const field = corridor({ mph: 0 })
    const state = createParticles(field, 10, seededRandom(8))
    stepParticles(state, field, 0, view, 1 / 60)
    expect(state.particles.every((p) => p.trail.length === 2 && p.age === 0)).toBe(true)
  })

  it('keeps the trail to a bounded number of points', () => {
    const field = corridor({ mph: 5 })
    const state = createParticles(field, 100, seededRandom(9))
    for (let f = 0; f < 200; f++) stepParticles(state, field, 0, view, 1 / 60)
    const lengths = state.particles.map((p) => p.trail.length)
    expect(Math.max(...lengths)).toBe(TRAIL_POINTS * 2)
  })

  it('respawns inside the visible area when it overlaps the corridor', () => {
    const field = corridor({ mph: 0 })
    const state = createParticles(field, 50, seededRandom(10))
    const area = { west: -99.2, south: 38.6, east: -99, north: 38.9 }
    stepParticles(state, field, 0, { ...view, area }, 1 / 60)
    for (const p of state.particles) {
      const [lon, lat] = head(p.trail)
      expect(lon).toBeGreaterThanOrEqual(area.west)
      expect(lon).toBeLessThanOrEqual(area.east)
      expect(lat).toBeGreaterThanOrEqual(area.south)
      expect(lat).toBeLessThanOrEqual(area.north)
    }
  })

  it('is deterministic for a seeded random source', () => {
    const field = corridor({ mph: 40, fromDeg: 225 })
    const run = () => {
      const state = createParticles(field, 60, seededRandom(11))
      for (let f = 0; f < 150; f++) stepParticles(state, field, 0, view, 1 / 60)
      return state.particles
    }
    expect(run()).toEqual(run())
  })
})

describe('particle count', () => {
  it('scales with the map area and stops at the cap', () => {
    expect(particleCount(900, 600)).toBe(Math.round((900 * 600) / CSS_PX_PER_PARTICLE))
    expect(particleCount(4000, 3000)).toBe(MAX_PARTICLES)
    expect(particleCount(0, 600)).toBe(0)
  })

  it('grows and shrinks an existing set', () => {
    const field = corridor()
    const state = createParticles(field, 10, seededRandom(12))
    const first = state.particles[0]
    setParticleCount(state, field, 25, null)
    expect(state.particles).toHaveLength(25)
    setParticleCount(state, field, 5, null)
    expect(state.particles).toHaveLength(5)
    expect(state.particles[0]).toBe(first)
  })
})

describe('frame budget', () => {
  const SLOW = SLOW_FRAME_MS + 5
  const FAST = 16
  const slowFrames = (budget: ReturnType<typeof createFrameBudget>, n: number) => {
    for (let f = 0; f < n; f++) recordFrame(budget, SLOW)
  }

  it('starts at the full count', () => {
    expect(budgetedCount(createFrameBudget(), 1200, 1000)).toBe(particleCount(1200, 1000))
  })

  it('halves the target after 30 slow frames, and not again until another 30', () => {
    const budget = createFrameBudget()
    const full = particleCount(1200, 1000)
    slowFrames(budget, SLOW_FRAMES_TO_HALVE - 1)
    expect(budgetedCount(budget, 1200, 1000)).toBe(full)
    slowFrames(budget, 1)
    expect(budgetedCount(budget, 1200, 1000)).toBe(Math.floor(full / 2))
    slowFrames(budget, 1) // the 31st
    expect(budgetedCount(budget, 1200, 1000)).toBe(Math.floor(full / 2))
    slowFrames(budget, SLOW_FRAMES_TO_HALVE - 2)
    expect(budgetedCount(budget, 1200, 1000)).toBe(Math.floor(full / 2))
    slowFrames(budget, 1)
    expect(budgetedCount(budget, 1200, 1000)).toBe(Math.floor(full / 4))
  })

  it('treats exactly the slow threshold as fast', () => {
    const budget = createFrameBudget()
    for (let f = 0; f < SLOW_FRAMES_TO_HALVE * 2; f++) recordFrame(budget, SLOW_FRAME_MS)
    expect(budget.divisor).toBe(1)
  })

  it('restarts the streak on a fast frame', () => {
    const budget = createFrameBudget()
    slowFrames(budget, SLOW_FRAMES_TO_HALVE - 1)
    recordFrame(budget, FAST)
    slowFrames(budget, SLOW_FRAMES_TO_HALVE - 1)
    expect(budget.divisor).toBe(1)
    slowFrames(budget, 1)
    expect(budget.divisor).toBe(2)
  })

  it('never drops below the minimum while the map wants more', () => {
    const budget = createFrameBudget()
    slowFrames(budget, SLOW_FRAMES_TO_HALVE * 40)
    expect(budgetedCount(budget, 4000, 3000)).toBe(MIN_PARTICLES)
    expect(budgetedCount(budget, 400, 700)).toBe(MIN_PARTICLES) // 108 particles wanted
  })

  it('leaves a map that wants fewer than the minimum unchanged', () => {
    const budget = createFrameBudget()
    slowFrames(budget, SLOW_FRAMES_TO_HALVE * 5)
    expect(particleCount(300, 400)).toBeLessThan(MIN_PARTICLES)
    expect(budgetedCount(budget, 300, 400)).toBe(particleCount(300, 400))
    expect(budgetedCount(budget, 0, 600)).toBe(0)
  })
})

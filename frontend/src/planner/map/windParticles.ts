import { sampleValue, sampleWind, type HeatmapField } from '../model/heatmap'

// Weather particles for the Wind, Rain and Snow layers: a canvas renderer steps and draws
// them each frame. Positions are kept in lon/lat so the particles stay on the ground when
// the map pans or zooms, but they move in screen pixels so the flow looks the same at
// every zoom. Wind streaks follow the wind over the ground. Rain and snow fall down the screen,
// leaning with the wind, and live only where it is raining or snowing, more of them where it
// is heavier, so the pattern shows the storm.

export type ParticleKind = 'wind' | 'rain' | 'snow'

export type KindStyle = {
  trailPoints: number // head plus the previous positions drawn behind it; 1 draws a dot
  windLean: number // how much of the wind's screen motion the particle takes; 1 for wind itself
  fallPxPerS: [light: number, heavy: number] // screen px/s straight down, at the threshold and at fullDensityAt; [0, 0] for wind
  minAge: number // frames before a particle may move on
  maxAge: number
  pxPerParticle: number // one particle per this many square CSS pixels of map
  threshold: number | null // in/hr below which the particle cannot live; null for wind
  fullDensityAt: number // in/hr at which every spawn attempt is accepted
  wobble: number // px of sideways drift per frame at the peak of a slow sway (about 2.5 px/s at 0.04); snow only
}

export const KIND_STYLES: Record<ParticleKind, KindStyle> = {
  wind: { trailPoints: 22, windLean: 1, fallPxPerS: [0, 0], minAge: 90, maxAge: 200, pxPerParticle: 2600, threshold: null, fullDensityAt: 0, wobble: 0 },
  // Drizzle drifts down at 50 px/s; a downpour streaks at 240. A 30 mph wind streak moves 72 px/s.
  rain: { trailPoints: 6, windLean: 0.5, fallPxPerS: [50, 240], minAge: 30, maxAge: 90, pxPerParticle: 1500, threshold: 0.01, fullDensityAt: 0.5, wobble: 0 },
  // Snow barely falls on a map: a slow drift, far slower than any wind streak, with a gentle sway.
  snow: { trailPoints: 1, windLean: 0.1, fallPxPerS: [0.8, 1.6], minAge: 600, maxAge: 1200, pxPerParticle: 1800, threshold: 0.05, fullDensityAt: 2, wobble: 0.04 },
}

// 30 mph moves about 72 px a second: a brisk, calm flow. 50 mph moves 120 px, clearly faster.
export const SPEED_PX_PER_MPH_PER_S = 2.4
export const MIN_SPEED_MPH = 1 // wind slower than this barely moves on screen, so respawn somewhere livelier
export const MAX_STEP_S = 0.05 // a long frame (tab switch, GC pause) must not fling particles
export const MAX_PARTICLES = 1500
export const SLOW_FRAME_MS = 25 // slower than 40 fps
export const SLOW_FRAMES_TO_HALVE = 30 // a sustained run, not one GC pause
export const MIN_PARTICLES = 100 // fewer than this stops looking like weather
// Smallest power of two that takes even the largest map below MIN_PARTICLES: past it, doubling changes nothing.
const MAX_DIVISOR = 16
const MIN_ACCEPT = 0.15 // the lightest drizzle still gets a few particles
const WET_SPAWN_TRIES = 8

export type Project = (lon: number, lat: number) => [x: number, y: number]
export type Unproject = (x: number, y: number) => [lon: number, lat: number]
export type Area = { west: number; south: number; east: number; north: number }

// How the map is shown right now. `area` is the visible part of the map: respawns land
// there so the screen stays full when zoomed in on a long corridor. `bearing` is the compass
// direction that points up the screen, in degrees, so a north wind moves up only when it is 0.
export type MapView = { project: Project; unproject: Unproject; area: Area | null; bearing: number }

export type Particle = {
  trail: number[] // lon, lat pairs, oldest first; the last pair is the head
  age: number // frames since the particle last spawned
  maxAge: number
  phase: number // where in its sideways sway the particle started; also its flake rotation
  size: number // 0 to 1: how hard it was raining or snowing where the particle was born; 1 for wind
}

export type WindParticles = {
  kind: ParticleKind
  particles: Particle[]
  random: () => number
  cells: number[] // cells whose four corner nodes all have a forecast, as i + j * (nx - 1)
  cellOk: Uint8Array // 1 for those cells, indexed the same way
}

// One particle for every pxPerParticle square CSS pixels of map, capped.
export function particleCount(widthPx: number, heightPx: number, kind: ParticleKind = 'wind'): number {
  const { pxPerParticle } = KIND_STYLES[kind]
  return Math.min(MAX_PARTICLES, Math.max(0, Math.round((widthPx * heightPx) / pxPerParticle)))
}

// Frame-budget state for one animation run. The target particle count is divided by `divisor`,
// which only grows: every SLOW_FRAMES_TO_HALVE slow frames in a row double it.
export type FrameBudget = { slowFrames: number; divisor: number }

export function createFrameBudget(): FrameBudget {
  return { slowFrames: 0, divisor: 1 }
}

// Records one frame's duration. Updates `budget` in place so the animation loop allocates nothing.
export function recordFrame(budget: FrameBudget, dtMs: number): void {
  if (!(dtMs > SLOW_FRAME_MS)) {
    budget.slowFrames = 0
    return
  }
  budget.slowFrames += 1
  if (budget.slowFrames < SLOW_FRAMES_TO_HALVE) return
  budget.slowFrames = 0
  if (budget.divisor < MAX_DIVISOR) budget.divisor *= 2
}

// The particle count to run with: the map's own count shrunk by the budget, never below
// MIN_PARTICLES and never above the map's own count (a tiny map keeps what it has).
export function budgetedCount(budget: FrameBudget, widthPx: number, heightPx: number, kind: ParticleKind = 'wind'): number {
  const full = particleCount(widthPx, heightPx, kind)
  return Math.min(full, Math.max(MIN_PARTICLES, Math.floor(full / budget.divisor)))
}

export function createParticles(
  field: HeatmapField,
  count: number,
  random: () => number,
  area: Area | null = null,
  kind: ParticleKind = 'wind',
  hour = 0,
): WindParticles {
  const cols = field.nx - 1
  const rows = field.ny - 1
  const cellOk = new Uint8Array(Math.max(cols, 0) * Math.max(rows, 0))
  const cells: number[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const sw = j * field.nx + i
      const corners = [sw, sw + 1, sw + field.nx, sw + field.nx + 1]
      if (corners.every((k) => field.present[k] === 1)) {
        cellOk[j * cols + i] = 1
        cells.push(j * cols + i)
      }
    }
  }
  const state: WindParticles = { kind, particles: [], random, cells, cellOk }
  setParticleCount(state, field, count, area, hour)
  // Spread the ages so the particles do not all respawn on the same frame.
  for (const p of state.particles) if (p.trail.length > 0) p.age = Math.floor(random() * p.maxAge)
  return state
}

// Grows or shrinks the set, for a map that changed size. Existing particles keep going.
export function setParticleCount(state: WindParticles, field: HeatmapField, count: number, area: Area | null, hour = 0): void {
  if (state.cells.length === 0) return // no part of the corridor has a forecast
  const { particles } = state
  if (particles.length > count) particles.length = count
  while (particles.length < count) particles.push(spawn(state, field, area, hour))
}

// Geographic wind (u east, v north, mph) as screen motion (x right, y down) under a map bearing.
export function toScreen(u: number, v: number, bearingDeg: number): [x: number, y: number] {
  const b = (bearingDeg * Math.PI) / 180
  return [u * Math.cos(b) - v * Math.sin(b), -(u * Math.sin(b) + v * Math.cos(b))]
}

// Moves every particle one frame, in place: wind streaks with the wind over the ground, rain and
// snow down the screen with a lean. A particle respawns when it ages out, leaves the corridor,
// sits in near-calm air (wind) or drifts out of the weather (rain, snow).
export function stepParticles(
  state: WindParticles,
  field: HeatmapField,
  hour: number,
  view: MapView,
  dt: number,
): void {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_S)
  const style = KIND_STYLES[state.kind]
  const { particles } = state
  for (let n = 0; n < particles.length; n++) {
    const p = particles[n]
    if (!p) continue
    p.age += 1
    const lon = p.trail[p.trail.length - 2]
    const lat = p.trail[p.trail.length - 1]
    if (p.age >= p.maxAge || lon === undefined || lat === undefined) {
      particles[n] = spawn(state, field, view.area, hour)
      continue
    }
    const motion = carriedBy(field, state.kind, hour, lon, lat)
    if (!motion) {
      particles[n] = spawn(state, field, view.area, hour)
      continue
    }
    const [x, y] = view.project(lon, lat)
    const [windX, windY] = toScreen(motion.u, motion.v, view.bearing)
    const lean = SPEED_PX_PER_MPH_PER_S * style.windLean * step
    const sway = style.wobble ? Math.sin(p.age * 0.03 + p.phase) * style.wobble : 0 // one sway every ~3.5 s
    const [nextLon, nextLat] = view.unproject(
      x + windX * lean + sway,
      y + windY * lean + fallSpeed(style, motion.amount) * step,
    )
    if (!Number.isFinite(nextLon) || !Number.isFinite(nextLat)) {
      particles[n] = spawn(state, field, view.area, hour)
      continue
    }
    p.trail.push(nextLon, nextLat)
    if (p.trail.length > style.trailPoints * 2) p.trail.splice(0, 2)
  }
}

export type Carried = { u: number; v: number; amount: number } // wind in mph; amount is in/hr for rain and snow, 0 for wind

// The wind at a point for a particle of `kind`, with how hard it is raining or snowing there;
// null where the particle cannot live: off the corridor, in near-calm air for wind, or outside
// the rain or snow for those kinds.
export function carriedBy(field: HeatmapField, kind: ParticleKind, hour: number, lon: number, lat: number): Carried | null {
  const wind = sampleWind(field, hour, lon, lat)
  if (!wind) return null
  const style = KIND_STYLES[kind]
  if (style.threshold === null) {
    return Math.hypot(wind.u, wind.v) < MIN_SPEED_MPH ? null : { ...wind, amount: 0 }
  }
  const amount = sampleValue(field, kind, hour, lon, lat)
  if (amount === null || amount < style.threshold) return null
  return { ...wind, amount }
}

// How fast a particle falls down the screen, in px/s: between the light and heavy speeds by how
// hard it is falling, from the threshold up to fullDensityAt.
export function fallSpeed(style: KindStyle, amount: number): number {
  const [light, heavy] = style.fallPxPerS
  if (style.threshold === null || heavy === light) return light
  const t = Math.min(1, Math.max(0, (amount - style.threshold) / (style.fullDensityAt - style.threshold)))
  return light + (heavy - light) * t
}

// A deterministic random source (mulberry32), for tests and for a still frame that
// should not reshuffle every time it is redrawn.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SPAWN_TRIES_IN_AREA = 6

// A fresh particle at a random point of the corridor: inside the visible area when one is given
// and it overlaps the corridor, anywhere on the corridor otherwise. Rain and snow only spawn
// where it is falling, accepted in proportion to how hard; when no wet spot is found the
// particle is born spent (an empty trail draws nothing) and tries again next frame.
function spawn(state: WindParticles, field: HeatmapField, area: Area | null, hour: number): Particle {
  const { random, kind } = state
  const style = KIND_STYLES[kind]
  const maxAge = style.minAge + Math.floor(random() * (style.maxAge - style.minAge + 1))
  const fresh = (lon: number, lat: number, size: number): Particle => ({
    trail: [lon, lat],
    age: 0,
    maxAge,
    phase: random() * Math.PI * 2,
    size,
  })
  if (style.threshold === null) return fresh(...anywhere(state, field, area), 1)
  for (let t = 0; t < WET_SPAWN_TRIES; t++) {
    const [lon, lat] = anywhere(state, field, area)
    const amount = sampleValue(field, kind, hour, lon, lat)
    if (amount === null || amount < style.threshold) continue
    const strength = Math.min(1, amount / style.fullDensityAt)
    if (random() < Math.max(MIN_ACCEPT, strength)) return fresh(lon, lat, strength)
  }
  return { trail: [], age: maxAge, maxAge, phase: 0, size: 0 }
}

// A random point of the corridor, inside the visible area when that overlaps the corridor.
function anywhere(state: WindParticles, field: HeatmapField, area: Area | null): [number, number] {
  const { random } = state
  const cols = field.nx - 1
  const step = field.stepDeg
  if (area) {
    const west = Math.max(area.west, field.west)
    const east = Math.min(area.east, field.west + cols * step)
    const south = Math.max(area.south, field.south)
    const north = Math.min(area.north, field.south + (field.ny - 1) * step)
    if (west < east && south < north) {
      for (let t = 0; t < SPAWN_TRIES_IN_AREA; t++) {
        const lon = west + random() * (east - west)
        const lat = south + random() * (north - south)
        const i = Math.min(Math.floor((lon - field.west) / step), cols - 1)
        const j = Math.min(Math.floor((lat - field.south) / step), field.ny - 2)
        if (state.cellOk[j * cols + i] === 1) return [lon, lat]
      }
    }
  }
  const cell = state.cells[Math.floor(random() * state.cells.length)] ?? 0
  const i = cell % cols
  const j = Math.floor(cell / cols)
  return [field.west + (i + random()) * step, field.south + (j + random()) * step]
}

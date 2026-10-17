import { sampleWind, type HeatmapField } from '../model/heatmap'

// Wind particles for the Wind layer: a canvas renderer steps and draws them each frame.
// Positions are kept in lon/lat so the particles stay on the ground when the map pans
// or zooms, but they move in screen pixels so the flow looks the same at every zoom.

// 30 mph moves about 72 px a second: a brisk, calm flow. 50 mph moves 120 px, clearly faster.
export const SPEED_PX_PER_MPH_PER_S = 2.4
export const TRAIL_POINTS = 22 // head plus the previous positions drawn behind it
export const MIN_AGE_FRAMES = 90 // long enough for a full trail to form before the particle moves on
export const MAX_AGE_FRAMES = 200
export const MIN_SPEED_MPH = 1 // slower than this barely moves on screen, so respawn somewhere livelier
export const MAX_STEP_S = 0.05 // a long frame (tab switch, GC pause) must not fling particles
export const CSS_PX_PER_PARTICLE = 2600 // fewer, longer streaks read as flow rather than dust
export const MAX_PARTICLES = 1500
export const SLOW_FRAME_MS = 25 // slower than 40 fps
export const SLOW_FRAMES_TO_HALVE = 30 // a sustained run, not one GC pause
export const MIN_PARTICLES = 100 // fewer than this stops looking like wind
// Smallest power of two that takes even the largest map below MIN_PARTICLES: past it, doubling changes nothing.
const MAX_DIVISOR = 16

export type Project = (lon: number, lat: number) => [x: number, y: number]
export type Unproject = (x: number, y: number) => [lon: number, lat: number]
export type Area = { west: number; south: number; east: number; north: number }

// How the map is shown right now. `area` is the visible part of the map: respawns land
// there so the screen stays full when zoomed in on a long corridor.
export type MapView = { project: Project; unproject: Unproject; area: Area | null }

export type Particle = {
  trail: number[] // lon, lat pairs, oldest first; the last pair is the head
  age: number // frames since the particle last spawned
  maxAge: number
}

export type WindParticles = {
  particles: Particle[]
  random: () => number
  cells: number[] // cells whose four corner nodes all have a forecast, as i + j * (nx - 1)
  cellOk: Uint8Array // 1 for those cells, indexed the same way
}

// One particle for every CSS_PX_PER_PARTICLE square CSS pixels of map, capped.
export function particleCount(widthPx: number, heightPx: number): number {
  return Math.min(MAX_PARTICLES, Math.max(0, Math.round((widthPx * heightPx) / CSS_PX_PER_PARTICLE)))
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
export function budgetedCount(budget: FrameBudget, widthPx: number, heightPx: number): number {
  const full = particleCount(widthPx, heightPx)
  return Math.min(full, Math.max(MIN_PARTICLES, Math.floor(full / budget.divisor)))
}

export function createParticles(
  field: HeatmapField,
  count: number,
  random: () => number,
  area: Area | null = null,
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
  const state: WindParticles = { particles: [], random, cells, cellOk }
  setParticleCount(state, field, count, area)
  // Spread the ages so the particles do not all respawn on the same frame.
  for (const p of state.particles) p.age = Math.floor(random() * p.maxAge)
  return state
}

// Grows or shrinks the set, for a map that changed size. Existing particles keep going.
export function setParticleCount(state: WindParticles, field: HeatmapField, count: number, area: Area | null): void {
  if (state.cells.length === 0) return // no part of the corridor has a forecast
  const { particles } = state
  if (particles.length > count) particles.length = count
  while (particles.length < count) particles.push(spawn(state, field, area))
}

// Moves every particle one frame downwind, in place. A particle respawns when it ages
// out, leaves the corridor or sits in near-calm air.
export function stepParticles(
  state: WindParticles,
  field: HeatmapField,
  hour: number,
  view: MapView,
  dt: number,
): void {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_S)
  const { particles } = state
  for (let n = 0; n < particles.length; n++) {
    const p = particles[n]
    if (!p) continue
    p.age += 1
    const lon = p.trail[p.trail.length - 2]
    const lat = p.trail[p.trail.length - 1]
    const wind = p.age < p.maxAge && lon !== undefined && lat !== undefined ? sampleWind(field, hour, lon, lat) : null
    if (!wind || lon === undefined || lat === undefined || Math.hypot(wind.u, wind.v) < MIN_SPEED_MPH) {
      particles[n] = spawn(state, field, view.area)
      continue
    }
    const [x, y] = view.project(lon, lat)
    // Screen y grows downward, so a northward wind moves up the screen.
    const [nextLon, nextLat] = view.unproject(
      x + wind.u * SPEED_PX_PER_MPH_PER_S * step,
      y - wind.v * SPEED_PX_PER_MPH_PER_S * step,
    )
    if (!Number.isFinite(nextLon) || !Number.isFinite(nextLat)) {
      particles[n] = spawn(state, field, view.area)
      continue
    }
    p.trail.push(nextLon, nextLat)
    if (p.trail.length > TRAIL_POINTS * 2) p.trail.splice(0, 2)
  }
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

// A fresh particle at a random point of the corridor: inside the visible area when one is
// given and it overlaps the corridor, anywhere on the corridor otherwise.
function spawn(state: WindParticles, field: HeatmapField, area: Area | null): Particle {
  const { random } = state
  const maxAge = MIN_AGE_FRAMES + Math.floor(random() * (MAX_AGE_FRAMES - MIN_AGE_FRAMES + 1))
  const fresh = (lon: number, lat: number): Particle => ({ trail: [lon, lat], age: 0, maxAge })
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
        if (state.cellOk[j * cols + i] === 1) return fresh(lon, lat)
      }
    }
  }
  const cell = state.cells[Math.floor(random() * state.cells.length)] ?? 0
  const i = cell % cols
  const j = Math.floor(cell / cols)
  return fresh(field.west + (i + random()) * step, field.south + (j + random()) * step)
}

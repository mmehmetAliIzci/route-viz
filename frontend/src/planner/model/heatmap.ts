import type { Plan } from '../../api/planApi'
import { LEVELS } from './planView'

// The corridor heatmap: decoded once per plan, painted into a tiny canvas per hour.
// Each node becomes one pixel; MapLibre stretches the canvas over the corridor with
// linear filtering, which gives the smooth look. Hour may be fractional: the two
// neighbouring hours are blended so the slider moves continuously.

export const HEATMAP_KINDS = ['risk', 'wind', 'rain', 'snow'] as const
export type HeatmapKind = (typeof HEATMAP_KINDS)[number]

export type HeatmapField = {
  nx: number
  ny: number
  hours: number
  startUtc: string
  // Corners of the canvas on the map: top-left, top-right, bottom-right, bottom-left.
  corners: [[number, number], [number, number], [number, number], [number, number]]
  values: Record<HeatmapKind, Float32Array> // physical units, hour-major, rows south to north
  present: Uint8Array // 1 where the node has a forecast; others are off the corridor
}

type Rgba = [number, number, number, number]
type Stop = { at: number; color: Rgba }

const hex = (h: string, alpha: number): Rgba => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  alpha,
]

// Wind uses the PDF bands so the colours mean the same as the levels.
const RAMPS: Record<HeatmapKind, Stop[]> = {
  risk: [
    { at: 0, color: [0, 0, 0, 0] },
    { at: 0.5, color: [0, 0, 0, 0] },
    { at: 1, color: hex(LEVELS.moderate.fill, 120) },
    { at: 2, color: hex(LEVELS.high.fill, 150) },
    { at: 3, color: hex(LEVELS.severe.fill, 165) },
    { at: 4, color: hex(LEVELS.no_travel.fill, 180) },
  ],
  wind: [
    { at: 5, color: [120, 190, 230, 0] },
    { at: 15, color: [120, 190, 230, 90] },
    { at: 25, color: hex(LEVELS.moderate.fill, 130) },
    { at: 35, color: hex(LEVELS.high.fill, 150) },
    { at: 45, color: hex(LEVELS.severe.fill, 165) },
    { at: 55, color: hex(LEVELS.no_travel.fill, 180) },
  ],
  rain: [
    { at: 0.01, color: [80, 160, 255, 0] },
    { at: 0.05, color: [80, 160, 255, 110] },
    { at: 0.25, color: [30, 90, 230, 150] },
    { at: 0.5, color: [90, 40, 200, 170] },
    { at: 1, color: [180, 30, 160, 185] },
  ],
  snow: [
    { at: 0.05, color: [190, 220, 255, 0] },
    { at: 0.5, color: [170, 205, 255, 130] },
    { at: 1, color: [120, 160, 240, 155] },
    { at: 2, color: [90, 90, 220, 170] },
    { at: 3, color: [150, 60, 200, 185] },
  ],
}

export const LEGENDS: Record<HeatmapKind, { label: string; ticks: string[]; stops: Stop[] }> = {
  risk: { label: 'Risk level', ticks: ['Moderate', 'High', 'Severe', 'No Travel'], stops: RAMPS.risk },
  wind: { label: 'Wind (mph)', ticks: ['15', '25', '35', '45', '55'], stops: RAMPS.wind },
  rain: { label: 'Rain (in/hr)', ticks: ['0.05', '0.25', '0.5', '1'], stops: RAMPS.rain },
  snow: { label: 'Snow (in/hr)', ticks: ['0.5', '1', '2', '3'], stops: RAMPS.snow },
}

export function decodeHeatmap(h: Plan['heatmap']): HeatmapField {
  const half = h.step_deg / 2
  const west = h.west - half
  const south = h.south - half
  const east = h.west + (h.nx - 1) * h.step_deg + half
  const north = h.south + (h.ny - 1) * h.step_deg + half
  const decode = (kind: HeatmapKind): Float32Array => {
    const { scale, data } = h.channels[kind]
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    return Float32Array.from(bytes, (b) => b * scale)
  }
  const values = { risk: decode('risk'), wind: decode('wind'), rain: decode('rain'), snow: decode('snow') }
  const present = Uint8Array.from(atob(h.mask), (c) => c.charCodeAt(0))
  return {
    nx: h.nx,
    ny: h.ny,
    hours: h.hours,
    startUtc: h.start_utc,
    corners: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    values,
    present,
  }
}

// Writes one RGBA pixel per node into `out` (length nx * ny * 4), north row first.
// Nodes without a forecast are transparent, so the corridor fades out at its edges.
export function paintHour(field: HeatmapField, kind: HeatmapKind, hour: number, out: Uint8ClampedArray): void {
  const { nx, ny, hours } = field
  const h = Math.min(Math.max(hour, 0), hours - 1)
  const h0 = Math.floor(h)
  const h1 = Math.min(h0 + 1, hours - 1)
  const f = h - h0
  const n = nx * ny
  const values = field.values[kind]
  const ramp = RAMPS[kind]
  for (let j = 0; j < ny; j++) {
    const row = ny - 1 - j // canvas row 0 is the north edge
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const v = (values[h0 * n + k] ?? 0) * (1 - f) + (values[h1 * n + k] ?? 0) * f
      const [r, g, b, a] = colorAt(ramp, v)
      const off = field.present[k] !== 1
      const p = (row * nx + i) * 4
      out[p] = r
      out[p + 1] = g
      out[p + 2] = b
      out[p + 3] = off ? 0 : a
    }
  }
}

export function colorAt(ramp: Stop[], v: number): Rgba {
  const first = ramp[0]
  const last = ramp[ramp.length - 1]
  if (!first || !last) return [0, 0, 0, 0]
  if (v <= first.at) return first.color
  if (v >= last.at) return last.color
  for (let s = 1; s < ramp.length; s++) {
    const lo = ramp[s - 1]
    const hi = ramp[s]
    if (lo && hi && v <= hi.at) {
      const t = (v - lo.at) / (hi.at - lo.at)
      const mix = (c: 0 | 1 | 2 | 3) => Math.round(lo.color[c] + t * (hi.color[c] - lo.color[c]))
      return [mix(0), mix(1), mix(2), mix(3)]
    }
  }
  return last.color
}

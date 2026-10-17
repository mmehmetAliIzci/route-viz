import type { Plan } from '../../api/planApi'
import { colorAt, decodeHeatmap, HEATMAP_UPSAMPLE, LEGENDS, paintHour, sampleWind, type HeatmapField } from './heatmap'

const WIND_STOPS = LEGENDS.wind.stops

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))

// 2 x 2 nodes, 2 hours. Rows run south to north.
function sample(wind: number[], mask = [1, 1, 1, 1], windDir?: number[]): Plan['heatmap'] {
  const zeros = b64(new Array(8).fill(0))
  return {
    west: -100,
    south: 38,
    step_deg: 0.5,
    nx: 2,
    ny: 2,
    hours: 2,
    start_utc: '2026-10-16T14:00:00Z',
    layout: 'hour, then row south to north, then column west to east',
    mask: b64(mask),
    channels: {
      risk: { scale: 1, data: zeros },
      wind: { scale: 0.5, data: b64(wind) },
      rain: { scale: 0.005, data: zeros },
      snow: { scale: 0.02, data: zeros },
      ...(windDir ? { wind_dir: { scale: 2, data: b64(windDir) } } : {}),
    },
  }
}

describe('decodeHeatmap', () => {
  it('scales bytes back to physical units', () => {
    const field = decodeHeatmap(sample([0, 50, 70, 90, 110, 130, 150, 170]))
    expect(Array.from(field.values.wind.slice(0, 4))).toEqual([0, 25, 35, 45])
  })

  it('places the canvas half a cell outside the outer nodes', () => {
    const field = decodeHeatmap(sample(new Array(8).fill(0)))
    expect(field.corners).toEqual([
      [-100.25, 38.75],
      [-99.25, 38.75],
      [-99.25, 37.75],
      [-100.25, 37.75],
    ])
  })
})

describe('paintHour off the corridor', () => {
  it('at scale 1 draws nodes without a forecast transparent', () => {
    // south-west node missing; mask rows run south to north, canvas rows north first
    const field = decodeHeatmap(sample([200, 200, 200, 200, 200, 200, 200, 200], [0, 1, 1, 1]))
    const out = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 0, out, 1)
    expect([out[3], out[7], out[11], out[15]]).toEqual([180, 180, 0, 180])
  })
})

describe('paintHour at one pixel per node', () => {
  // hour 0: south row 10 and 20 mph, north row 30 and 40; hour 1 all 0
  const field = decodeHeatmap(sample([20, 40, 60, 80, 0, 0, 0, 0]))

  it('puts the north row first, as a canvas expects', () => {
    const out = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 0, out, 1)
    // canvas row 0 is the north row (30 and 40 mph), row 1 the south row (10 and 20 mph)
    expect(Array.from(out.slice(0, 4))).toEqual(colorAt(WIND_STOPS, 30))
    expect(Array.from(out.slice(8, 12))).toEqual(colorAt(WIND_STOPS, 10))
  })

  it('blends neighbouring hours for a fractional hour', () => {
    const half = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 0.5, half, 1) // north-west node: (30 + 0) / 2 = 15 mph
    expect(Array.from(half.slice(0, 4))).toEqual(colorAt(WIND_STOPS, 15))
  })

  it('clamps hours outside the range', () => {
    const late = new Uint8ClampedArray(16)
    const last = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 99, late, 1)
    paintHour(field, 'wind', 1, last, 1)
    expect(late).toEqual(last)
  })
})

// A strip of nodes, one row and one hour, every present node at `mph`. Absent nodes are
// encoded as 0, as the backend sends them.
function strip(mask: number[], mph: number): HeatmapField {
  const bytes = mask.map((m) => (m ? mph * 2 : 0))
  const zeros = b64(new Array(mask.length).fill(0))
  return decodeHeatmap({
    west: -100,
    south: 38,
    step_deg: 0.5,
    nx: mask.length,
    ny: 1,
    hours: 1,
    start_utc: '2026-10-16T14:00:00Z',
    layout: 'hour, then row south to north, then column west to east',
    mask: b64(mask),
    channels: {
      risk: { scale: 1, data: zeros },
      wind: { scale: 0.5, data: b64(bytes) },
      rain: { scale: 0.005, data: zeros },
      snow: { scale: 0.02, data: zeros },
    },
  })
}

describe('paintHour upsampled', () => {
  const S = HEATMAP_UPSAMPLE
  const paintStrip = (field: HeatmapField) => {
    const out = new Uint8ClampedArray(field.nx * S * S * 4)
    paintHour(field, 'wind', 0, out)
    return (col: number) => Array.from(out.slice(col * 4, col * 4 + 4)) // row 0 of the strip
  }
  // Nodes 0 and 1 present, node 2 absent: the half-cell line sits between pixels 15 and 16,
  // each 1/16 of a cell from it. Node 1's centre is at pixel 11.5, so pixel 8 is a full
  // cell inside the corridor, away from the edge.
  const field = strip([1, 1, 0], 40)
  const ramp = colorAt(WIND_STOPS, 40)

  it('writes (nx * scale) by (ny * scale) pixels, north row first', () => {
    const grid = decodeHeatmap(sample([20, 40, 60, 80, 0, 0, 0, 0]))
    const out = new Uint8ClampedArray(grid.nx * S * grid.ny * S * 4)
    paintHour(grid, 'wind', 0, out)
    const px = (row: number, col: number) => Array.from(out.slice((row * grid.nx * S + col) * 4, (row * grid.nx * S + col) * 4 + 4))
    expect(px(0, 0)).toEqual(colorAt(WIND_STOPS, 30)) // top-left: the north-west node
    expect(px(grid.ny * S - 1, 0)).toEqual(colorAt(WIND_STOPS, 10)) // bottom-left: the south-west node
    expect(px(grid.ny * S - 1, grid.nx * S - 1)).toEqual(colorAt(WIND_STOPS, 20)) // bottom-right
  })

  it('is half transparent on the half-cell line between a present and an absent node', () => {
    const pixel = paintStrip(field)
    const inside = pixel(15)[3] ?? 0
    const outside = pixel(16)[3] ?? 0
    expect(inside).toBeGreaterThan(outside)
    expect(Math.abs(inside + outside - ramp[3])).toBeLessThanOrEqual(1) // symmetric about half
  })

  it('has the full ramp alpha one cell inside the corridor', () => {
    expect(paintStrip(field)(S)[3]).toBe(ramp[3])
  })

  it('is transparent a cell outside the corridor', () => {
    expect(paintStrip(field)(3 * S - 1)[3]).toBe(0)
  })

  it('does not pull the colour toward zero beside an absent node', () => {
    const edge = paintStrip(field)(15) // 1/16 of a cell inside the line, absent node 2 next door
    expect(edge.slice(0, 3)).toEqual(ramp.slice(0, 3))
    expect(edge[3]).toBeGreaterThan(0)
  })

  it('at scale 1 reproduces one pixel per node', () => {
    const out = new Uint8ClampedArray(12)
    paintHour(field, 'wind', 0, out, 1)
    expect(Array.from(out)).toEqual([...ramp, ...ramp, ...colorAt(WIND_STOPS, 0).slice(0, 3), 0])
  })
})

describe('colorAt', () => {
  const ramp = [
    { at: 0, color: [0, 0, 0, 0] as [number, number, number, number] },
    { at: 10, color: [100, 200, 50, 255] as [number, number, number, number] },
  ]
  it('interpolates between stops and clamps at the ends', () => {
    expect(colorAt(ramp, 5)).toEqual([50, 100, 25, 128])
    expect(colorAt(ramp, -3)).toEqual([0, 0, 0, 0])
    expect(colorAt(ramp, 40)).toEqual([100, 200, 50, 255])
  })
})

describe('wind direction', () => {
  // wind_dir bytes are degrees the wind blows FROM, halved
  const blowingFrom = (deg: number) => new Array(8).fill(deg / 2)
  const speed20 = new Array(8).fill(40) // 20 mph at scale 0.5

  it('leaves windVectors null when the plan has no wind direction', () => {
    const field = decodeHeatmap(sample(speed20))
    expect(field.windVectors).toBeNull()
    expect(sampleWind(field, 0, -99.75, 38.25)).toBeNull()
  })

  it('keeps the node grid so samplers can find nodes', () => {
    const field = decodeHeatmap(sample(speed20))
    expect([field.west, field.south, field.stepDeg]).toEqual([-100, 38, 0.5])
  })

  it.each([
    { from: 0, u: 0, v: -20 }, // northerly blows south
    { from: 90, u: -20, v: 0 }, // easterly blows west
    { from: 180, u: 0, v: 20 }, // southerly blows north
    { from: 270, u: 20, v: 0 }, // westerly blows east
  ])('turns a wind from $from degrees into the vector it blows along', ({ from, u, v }) => {
    const field = decodeHeatmap(sample(speed20, [1, 1, 1, 1], blowingFrom(from)))
    expect(field.windVectors?.u[0]).toBeCloseTo(u, 4)
    expect(field.windVectors?.v[0]).toBeCloseTo(v, 4)
  })

  it('sends a south-westerly toward the north-east', () => {
    const field = decodeHeatmap(sample(speed20, [1, 1, 1, 1], blowingFrom(224)))
    expect(field.windVectors?.u[0]).toBeGreaterThan(0)
    expect(field.windVectors?.v[0]).toBeGreaterThan(0)
  })
})

describe('sampleWind', () => {
  // southerlies everywhere; hour 0: south row 10 and 20 mph, north row 30 and 40; hour 1 calm
  const field = decodeHeatmap(sample([20, 40, 60, 80, 0, 0, 0, 0], [1, 1, 1, 1], new Array(8).fill(90)))

  it('reads a node exactly', () => {
    expect(sampleWind(field, 0, -100, 38)?.v).toBeCloseTo(10, 4)
    expect(sampleWind(field, 0, -99.5, 38.5)?.v).toBeCloseTo(40, 4)
  })

  it('interpolates between nodes and between hours', () => {
    expect(sampleWind(field, 0, -99.875, 38)?.v).toBeCloseTo(12.5, 4) // a quarter of the way east
    const centre = sampleWind(field, 0, -99.75, 38.25)
    expect(centre?.v).toBeCloseTo(25, 4)
    expect(centre?.u).toBeCloseTo(0, 4)
    expect(sampleWind(field, 0.5, -99.75, 38.25)?.v).toBeCloseTo(12.5, 4)
  })

  it('is null off the grid', () => {
    expect(sampleWind(field, 0, -100.01, 38.25)).toBeNull()
    expect(sampleWind(field, 0, -99.75, 38.51)).toBeNull()
    expect(sampleWind(field, 0, Number.NaN, 38.25)).toBeNull()
  })

  it('is null when any surrounding node has no forecast', () => {
    const gap = decodeHeatmap(sample([20, 40, 60, 80, 0, 0, 0, 0], [1, 1, 1, 0], new Array(8).fill(90)))
    expect(sampleWind(gap, 0, -100, 38)).toBeNull()
  })
})

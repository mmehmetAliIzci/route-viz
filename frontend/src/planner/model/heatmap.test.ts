import type { Plan } from '../../api/planApi'
import { colorAt, decodeHeatmap, LEGENDS, paintHour } from './heatmap'

const WIND_STOPS = LEGENDS.wind.stops

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))

// 2 x 2 nodes, 2 hours. Rows run south to north.
function sample(wind: number[], mask = [1, 1, 1, 1]): Plan['heatmap'] {
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
  it('draws nodes without a forecast transparent', () => {
    // south-west node missing; mask rows run south to north, canvas rows north first
    const field = decodeHeatmap(sample([200, 200, 200, 200, 200, 200, 200, 200], [0, 1, 1, 1]))
    const out = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 0, out)
    expect([out[3], out[7], out[11], out[15]]).toEqual([180, 180, 0, 180])
  })
})

describe('paintHour', () => {
  // hour 0: south row 10 and 20 mph, north row 30 and 40; hour 1 all 0
  const field = decodeHeatmap(sample([20, 40, 60, 80, 0, 0, 0, 0]))

  it('puts the north row first, as a canvas expects', () => {
    const out = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 0, out)
    // canvas row 0 is the north row (30 and 40 mph), row 1 the south row (10 and 20 mph)
    expect(Array.from(out.slice(0, 4))).toEqual(colorAt(WIND_STOPS, 30))
    expect(Array.from(out.slice(8, 12))).toEqual(colorAt(WIND_STOPS, 10))
  })

  it('blends neighbouring hours for a fractional hour', () => {
    const half = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 0.5, half) // north-west node: (30 + 0) / 2 = 15 mph
    expect(Array.from(half.slice(0, 4))).toEqual(colorAt(WIND_STOPS, 15))
  })

  it('clamps hours outside the range', () => {
    const late = new Uint8ClampedArray(16)
    const last = new Uint8ClampedArray(16)
    paintHour(field, 'wind', 99, late)
    paintHour(field, 'wind', 1, last)
    expect(late).toEqual(last)
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

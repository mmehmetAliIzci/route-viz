import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import fixture from '../test/plan-kc-den.json'
import { parsePlan } from '../api/planApi'
import { WeatherControls } from './WeatherControls'
import { buildPlanView } from './model/planView'

const plan = buildPlanView(parsePlan(fixture))
const HOURS = 49
const LAST = HOURS - 1

let frames = new Map<number, FrameRequestCallback>()
let nextFrameId = 1
let clock = 0

// Runs the callbacks queued so far, `ms` later than the previous frame.
function frame(ms = 16) {
  clock += ms
  const due = [...frames.values()]
  frames.clear()
  act(() => due.forEach((cb) => cb(clock)))
}

function mockMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

// Holds the hour the way the planner does, and records what the controls wrote.
function renderControls(options: { startHour?: number; disabled?: boolean } = {}) {
  const writes: number[] = []
  const hourNow = { current: options.startHour ?? 0 }
  function Harness() {
    const [hour, setHour] = useState(options.startHour ?? 0)
    return (
      <WeatherControls
        plan={plan}
        hours={HOURS}
        hour={hour}
        onHourChange={(h) => {
          writes.push(h)
          hourNow.current = h
          setHour(h)
        }}
        layer="risk"
        onLayerChange={() => {}}
        disabled={options.disabled ?? false}
      />
    )
  }
  render(<Harness />)
  return { writes, hourNow }
}

const play = () => screen.getByRole('button', { name: 'Play forecast' })
const pause = () => screen.getByRole('button', { name: 'Pause forecast' })

beforeEach(() => {
  vi.useFakeTimers()
  frames = new Map()
  nextFrameId = 1
  clock = 1000
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextFrameId++
    frames.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  mockMatchMedia(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('forecast playback', () => {
  it('starts stopped, with a label that says what pressing does', () => {
    renderControls()
    expect(play()).toHaveAttribute('aria-pressed', 'false')
    expect(play()).toBeEnabled()
  })

  it('advances the hour by fractional steps at four hours per second', () => {
    const { writes } = renderControls()
    fireEvent.click(play())
    expect(pause()).toHaveAttribute('aria-pressed', 'true')
    frame() // the first frame only sets the clock
    frame(50)
    frame(50)
    expect(writes).toEqual([0, 0.2, 0.4].map((v) => expect.closeTo(v, 5)))
  })

  it('clamps one long frame to a quarter hour', () => {
    const { writes } = renderControls()
    fireEvent.click(play())
    frame()
    frame(5000)
    expect(writes).toEqual([0, 0.25])
  })

  it('stops exactly at the last hour and offers Play again', () => {
    const { writes, hourNow } = renderControls({ startHour: LAST - 0.1 })
    fireEvent.click(play())
    frame()
    frame(100)
    expect(hourNow.current).toBe(LAST)
    expect(writes.at(-1)).toBe(LAST)
    expect(play()).toHaveAttribute('aria-pressed', 'false')
    expect(frames.size).toBe(0)
  })

  it('pauses when the slider moves', () => {
    const { writes, hourNow } = renderControls()
    fireEvent.click(play())
    frame()
    frame(100)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Forecast hour' }), { key: 'ArrowRight' })
    expect(play()).toBeInTheDocument()
    expect(frames.size).toBe(0)
    const written = writes.length
    frame(100)
    expect(writes).toHaveLength(written)
    expect(hourNow.current).toBeGreaterThan(0)
  })

  it('restarts from zero when Play is pressed at the last hour', () => {
    const { writes } = renderControls({ startHour: LAST })
    fireEvent.click(play())
    expect(writes[0]).toBe(0)
    frame()
    frame(50)
    expect(writes.at(-1)).toBeCloseTo(0.2, 5)
    expect(pause()).toBeInTheDocument()
  })

  it('pauses on the second press and stays where it is', () => {
    const { writes } = renderControls()
    fireEvent.click(play())
    frame()
    frame(100)
    fireEvent.click(pause())
    expect(play()).toBeInTheDocument()
    const written = writes.length
    frame(100)
    expect(writes).toHaveLength(written)
  })

  it('is disabled with the other controls while a plan loads', () => {
    renderControls({ disabled: true })
    expect(play()).toBeDisabled()
  })

  it('stops the loop on unmount', () => {
    const { writes } = renderControls()
    fireEvent.click(play())
    frame()
    expect(frames.size).toBe(1)
    cleanup()
    expect(frames.size).toBe(0)
    expect(writes).toEqual([0])
  })
})

describe('forecast playback with reduced motion', () => {
  beforeEach(() => mockMatchMedia(true))

  it('steps whole hours every half second without animation frames', () => {
    const { writes } = renderControls({ startHour: 2.4 })
    fireEvent.click(play())
    expect(frames.size).toBe(0)
    act(() => vi.advanceTimersByTime(500))
    act(() => vi.advanceTimersByTime(500))
    expect(writes).toEqual([3, 4])
  })

  it('stops at the last hour', () => {
    const { writes } = renderControls({ startHour: LAST - 1 })
    fireEvent.click(play())
    act(() => vi.advanceTimersByTime(500))
    expect(writes).toEqual([LAST])
    expect(play()).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2000))
    expect(writes).toEqual([LAST])
  })
})

import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import type { HeatmapField } from '../model/heatmap'
import type { ResolvedTheme } from '../../theme/theme'
import { useMediaQuery } from '../useMediaQuery'
import {
  budgetedCount,
  createFrameBudget,
  createParticles,
  particleCount,
  recordFrame,
  seededRandom,
  setParticleCount,
  stepParticles,
  TRAIL_POINTS,
  type Area,
  type MapView,
  type Project,
  type WindParticles,
} from './windParticles'

export type WindDisplay = { field: HeatmapField; hour: number }

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
// Slate strokes: dark on the light basemap, light on the dark one.
const PARTICLE_COLORS: Record<ResolvedTheme, string> = {
  light: 'rgba(30, 41, 59, 0.65)',
  dark: 'rgba(226, 232, 240, 0.7)',
}
const LINE_WIDTH_PX = 1.2
const STILL_STEPS = TRAIL_POINTS - 1 // enough steps for a full-length streak
const STILL_STEP_S = 1 / 30
const STILL_SEED = 1

// Wind particles drawn on a canvas laid over the map. Attach the returned ref to that canvas.
// `wind` null clears the canvas and stops everything.
//   - animated: one requestAnimationFrame loop while the page is visible; the hour is read
//     through a ref so dragging the slider does not restart the flow; a new field reseeds
//   - reduced motion: one still frame of short downwind streaks, redrawn when the map moves
//     and redrawn from scratch when the hour or the field changes
export function useWindParticles(
  map: MapLibreMap | null,
  wind: WindDisplay | null,
  theme: ResolvedTheme,
): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorRef = useRef(PARTICLE_COLORS[theme]) // read per frame, so a theme change does not reseed
  useEffect(() => {
    colorRef.current = PARTICLE_COLORS[theme]
  }, [theme])
  const field = wind?.field ?? null
  const hour = wind?.hour ?? 0
  const hourRef = useRef(hour)
  useEffect(() => {
    hourRef.current = hour
  }, [hour])
  const reducedMotion = useMediaQuery(REDUCED_MOTION)
  const pageVisible = usePageVisible()

  // Animated flow.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!map || !canvas || !field || reducedMotion || !pageVisible) return
    const surface = attachSurface(map, canvas)
    if (!surface) return
    const project = projector(map)
    const unproject = unprojector(map)
    const state = createParticles(field, particleCount(surface.width, surface.height), Math.random, visibleArea(map))
    const budget = createFrameBudget() // a new field or a reseed starts at the full count again
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const dtMs = now - last
      last = now
      recordFrame(budget, dtMs)
      const view: MapView = { project, unproject, area: visibleArea(map) }
      setParticleCount(state, field, budgetedCount(budget, surface.width, surface.height), view.area)
      stepParticles(state, field, hourRef.current, view, dtMs / 1000)
      drawTrails(surface, state, project, colorRef.current)
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      surface.detach()
    }
  }, [map, field, reducedMotion, pageVisible])

  // Reduced motion: a still frame. Positions are geographic, so a pan only needs a redraw;
  // when the move ends or the map changes size, reseed so the new view is covered.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!map || !canvas || !field || !reducedMotion) return
    const project = projector(map)
    const unproject = unprojector(map)
    let state: WindParticles | null = null
    let surface: Surface | null = null
    // The still frame is drawn once, not per frame, so there is no frame time to budget against.
    const reseed = () => {
      if (!surface) return
      const area = visibleArea(map)
      const next = createParticles(field, particleCount(surface.width, surface.height), seededRandom(STILL_SEED), area)
      for (let n = 0; n < STILL_STEPS; n++) stepParticles(next, field, hour, { project, unproject, area }, STILL_STEP_S)
      state = next
      drawTrails(surface, next, project, colorRef.current)
    }
    const redraw = () => {
      if (surface && state) drawTrails(surface, state, project, colorRef.current)
    }
    surface = attachSurface(map, canvas, reseed)
    if (!surface) return
    const attached = surface
    reseed()
    map.on('move', redraw)
    map.on('moveend', reseed)
    return () => {
      map.off('move', redraw)
      map.off('moveend', reseed)
      attached.detach()
    }
  }, [map, field, reducedMotion, hour, theme])

  return canvasRef
}

// True while the tab is in front; the animation pauses behind other tabs.
function usePageVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('visibilitychange', onChange)
      return () => document.removeEventListener('visibilitychange', onChange)
    },
    () => document.visibilityState === 'visible',
    () => true,
  )
}

type Surface = { ctx: CanvasRenderingContext2D; width: number; height: number; detach: () => void }

// Sizes the canvas to the map container at the device pixel ratio, follows container
// resizes (calling `onResize` after each), and draws in CSS pixels. `detach` stops
// following and clears the canvas.
function attachSurface(map: MapLibreMap, canvas: HTMLCanvasElement, onResize?: () => void): Surface | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const container = map.getContainer()
  const surface: Surface = {
    ctx,
    width: 0,
    height: 0,
    detach: () => {
      observer.disconnect()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    },
  }
  const fit = () => {
    const ratio = window.devicePixelRatio || 1
    surface.width = container.clientWidth
    surface.height = container.clientHeight
    canvas.width = Math.round(surface.width * ratio)
    canvas.height = Math.round(surface.height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0) // resizing the canvas resets the transform
  }
  fit()
  const observer = new ResizeObserver(() => {
    fit()
    onResize?.()
  })
  observer.observe(container)
  return surface
}

// Draws every trail as a short line that fades from an opaque head to a clear tail. Segments
// at the same distance from the head share an opacity, so they go into one stroke.
function drawTrails(surface: Surface, state: WindParticles, project: Project, color: string): void {
  const { ctx, width, height } = surface
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = LINE_WIDTH_PX
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  const screen = state.particles.map((p) => {
    const points: number[] = []
    for (let k = p.trail.length - 2; k >= 0; k -= 2) {
      const [x, y] = project(p.trail[k] ?? 0, p.trail[k + 1] ?? 0)
      points.push(x, y) // head first
    }
    return points
  })
  for (let s = 0; s < TRAIL_POINTS - 1; s++) {
    ctx.globalAlpha = 1 - s / (TRAIL_POINTS - 1)
    ctx.beginPath()
    for (const points of screen) {
      const x0 = points[s * 2]
      const y0 = points[s * 2 + 1]
      const x1 = points[s * 2 + 2]
      const y1 = points[s * 2 + 3]
      if (x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined) continue
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function projector(map: MapLibreMap): Project {
  return (lon, lat) => {
    const p = map.project([lon, lat])
    return [p.x, p.y]
  }
}

function unprojector(map: MapLibreMap): MapView['unproject'] {
  return (x, y) => {
    const ll = map.unproject([x, y])
    return [ll.lng, ll.lat]
  }
}

function visibleArea(map: MapLibreMap): Area {
  const b = map.getBounds()
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
}

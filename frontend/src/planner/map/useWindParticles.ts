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
  KIND_STYLES,
  type ParticleKind,
  type Area,
  type MapView,
  type Project,
  type WindParticles,
} from './windParticles'

export type WindDisplay = { field: HeatmapField; hour: number; kind: ParticleKind }

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
// Strokes per kind: dark on the light basemap, light on the dark one. Wind is slate, rain blue,
// snow a cool grey by day and white by night.
const PARTICLE_COLORS: Record<ParticleKind, Record<ResolvedTheme, string>> = {
  wind: { light: 'rgba(30, 41, 59, 0.65)', dark: 'rgba(226, 232, 240, 0.7)' },
  rain: { light: 'rgba(29, 78, 216, 0.7)', dark: 'rgba(147, 197, 253, 0.8)' },
  snow: { light: 'rgba(255, 255, 255, 0.95)', dark: 'rgba(255, 255, 255, 0.9)' },
}
const SNOW_EDGE: Record<ResolvedTheme, string> = { light: 'rgba(71, 85, 105, 0.6)', dark: 'rgba(0, 0, 0, 0)' } // flakes need an edge on a light map
const LINE_WIDTH_PX: Record<ParticleKind, number> = { wind: 1.2, rain: 1.2, snow: 1.1 }
const RAIN_WIDTH_PX: [light: number, heavy: number] = [0.8, 2] // a downpour draws heavier streaks than drizzle
const FLAKE_RADIUS_PX: [light: number, heavy: number] = [1.6, 4] // arm length; heavy snow means big flakes
const SIZE_BUCKETS = 3 // streaks are stroked in a few width groups so one path holds many
const STILL_STEPS = KIND_STYLES.wind.trailPoints - 1 // enough steps for a full-length streak
const STILL_STEP_S = 1 / 30
const STILL_SEED = 1

// Weather particles (wind, rain or snow) drawn on a canvas laid over the map. Attach the returned ref to that canvas.
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
  const kind = wind?.kind ?? 'wind'
  const colorRef = useRef({ fill: PARTICLE_COLORS[kind][theme], edge: SNOW_EDGE[theme] }) // read per frame, so a theme change does not reseed
  useEffect(() => {
    colorRef.current = { fill: PARTICLE_COLORS[kind][theme], edge: SNOW_EDGE[theme] }
  }, [kind, theme])
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
    const state = createParticles(field, particleCount(surface.width, surface.height, kind), Math.random, visibleArea(map), kind, hourRef.current)
    const budget = createFrameBudget() // a new field or a reseed starts at the full count again
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const dtMs = now - last
      last = now
      recordFrame(budget, dtMs)
      const view: MapView = { project, unproject, area: visibleArea(map), bearing: map.getBearing() }
      setParticleCount(state, field, budgetedCount(budget, surface.width, surface.height, kind), view.area, hourRef.current)
      stepParticles(state, field, hourRef.current, view, dtMs / 1000)
      drawTrails(surface, state, project, colorRef.current)
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      surface.detach()
    }
  }, [map, field, kind, reducedMotion, pageVisible])

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
      const next = createParticles(field, particleCount(surface.width, surface.height, kind), seededRandom(STILL_SEED), area, kind, hour)
      const still: MapView = { project, unproject, area, bearing: map.getBearing() }
      for (let n = 0; n < STILL_STEPS; n++) stepParticles(next, field, hour, still, STILL_STEP_S)
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
  }, [map, field, kind, reducedMotion, hour, theme])

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

type Paint = { fill: string; edge: string }

// Draws every trail as a short line that fades from an opaque head to a clear tail. Segments
// at the same distance from the head share an opacity, so they go into one stroke. A kind
// with a one-point trail (snow) is drawn as round flakes of varied size instead.
function drawTrails(surface: Surface, state: WindParticles, project: Project, paint: Paint): void {
  const { ctx, width, height } = surface
  const trailPoints = KIND_STYLES[state.kind].trailPoints
  ctx.clearRect(0, 0, width, height)
  if (trailPoints <= 1) {
    drawFlakes(ctx, state, project, paint)
    return
  }
  ctx.lineCap = 'round'
  ctx.strokeStyle = paint.fill
  const screen = state.particles.map((p) => {
    const points: number[] = []
    for (let k = p.trail.length - 2; k >= 0; k -= 2) {
      const [x, y] = project(p.trail[k] ?? 0, p.trail[k + 1] ?? 0)
      points.push(x, y) // head first
    }
    return points
  })
  // Rain is stroked in width buckets by how hard it was falling; wind is one width.
  const buckets = state.kind === 'rain' ? SIZE_BUCKETS : 1
  for (let b = 0; b < buckets; b++) {
    ctx.lineWidth =
      state.kind === 'rain'
        ? RAIN_WIDTH_PX[0] + ((RAIN_WIDTH_PX[1] - RAIN_WIDTH_PX[0]) * (b + 0.5)) / buckets
        : LINE_WIDTH_PX[state.kind]
    for (let s = 0; s < trailPoints - 1; s++) {
      ctx.globalAlpha = 1 - s / (trailPoints - 1)
      ctx.beginPath()
      for (let n = 0; n < screen.length; n++) {
        if (buckets > 1 && Math.min(buckets - 1, Math.floor((state.particles[n]?.size ?? 0) * buckets)) !== b) continue
        const points = screen[n] ?? []
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
  }
  ctx.globalAlpha = 1
}

// Snowflakes: six arms through the centre, turned by the particle's phase, sized by how hard it
// was snowing where the flake was born. Drawn twice, a wider edge under a white core, so white
// reads on a light basemap too.
function drawFlakes(ctx: CanvasRenderingContext2D, state: WindParticles, project: Project, paint: Paint): void {
  const [small, large] = FLAKE_RADIUS_PX
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const p of state.particles) {
    const lon = p.trail[p.trail.length - 2]
    const lat = p.trail[p.trail.length - 1]
    if (lon === undefined || lat === undefined) continue
    const [x, y] = project(lon, lat)
    const r = small + (large - small) * p.size
    for (let arm = 0; arm < 3; arm++) {
      const a = p.phase + (arm * Math.PI) / 3
      const dx = Math.cos(a) * r
      const dy = Math.sin(a) * r
      ctx.moveTo(x - dx, y - dy)
      ctx.lineTo(x + dx, y + dy)
    }
  }
  ctx.strokeStyle = paint.edge
  ctx.lineWidth = LINE_WIDTH_PX.snow + 1.4
  ctx.stroke()
  ctx.strokeStyle = paint.fill
  ctx.lineWidth = LINE_WIDTH_PX.snow
  ctx.stroke()
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

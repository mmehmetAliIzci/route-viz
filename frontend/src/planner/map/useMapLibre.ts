import { CanvasSource, GeoJSONSource, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { paintHour, type HeatmapField, type HeatmapKind } from '../model/heatmap'
import type { PlanView } from '../model/planView'
import type { ResolvedTheme } from '../../theme/theme'
import { addRouteLayers, checkpointsGeoJson, ROUTES_CASING_LAYER, routesGeoJson } from './routeLayers'

setWorkerUrl(workerUrl)

// The basemap follows the app theme: Positron by day, Dark Matter at night.
const STYLE_URLS: Record<ResolvedTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}
const US_CENTER: [number, number] = [-98.5, 39.5]
const HEATMAP_SOURCE = 'heatmap'
const HEATMAP_LAYER = 'heatmap'
// Everything the app adds on top of the basemap, kept when the basemap changes.
const OWN_SOURCES = new Set(['routes', 'checkpoints', HEATMAP_SOURCE])
const OWN_LAYERS = new Set([HEATMAP_LAYER, ROUTES_CASING_LAYER, 'routes-line', 'checkpoints'])

export type HeatmapDisplay = { field: HeatmapField; kind: HeatmapKind; hour: number }
export type FitPadding = { top: number; bottom: number }
export const DEFAULT_FIT_PADDING: FitPadding = { top: 48, bottom: 200 }

type Options = {
  plan: PlanView | null
  selectedId: number | null
  onSelectRoute: (routeId: number) => void
  heatmap: HeatmapDisplay | null // null hides the heatmap
  fitPadding: FitPadding // space the routes keep clear of, for panels that cover the map
  theme: ResolvedTheme // picks the basemap
}

// The MapLibre lifecycle for one map. Attach the returned `container` ref to the map's
// container; `map` is the loaded map, null until its style has loaded.
// Effects run in this order, and the order matters:
//   1. create the map and add its controls; on 'load' add the route and checkpoint
//      sources and layers, then publish the map (nothing below runs before that)
//   1b. on a theme change, swap the basemap style and carry our sources and layers over
//   2. on plan or selection change, setData on the routes and checkpoints sources
//   3. on a new plan, or a resize, fit the routes in view
//   4. heatmap canvas: when a field arrives, add the canvas source and layer under the
//      routes; when the field goes away or changes, remove both
//   5. paint the chosen hour into that canvas (reads the canvas step 4 created)
//   6. on unmount, remove the map (the cleanup of step 1)
export function useMapLibre({ plan, selectedId, onSelectRoute, heatmap, fitPadding, theme }: Options): {
  container: RefObject<HTMLDivElement | null>
  map: MapLibreMap | null
} {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const onSelectRef = useRef(onSelectRoute)
  useEffect(() => {
    onSelectRef.current = onSelectRoute
  }, [onSelectRoute])
  const shownTheme = useRef(theme) // the theme the current basemap was built for

  // 1. Create, load, clean up.
  useEffect(() => {
    if (!container.current) return
    const m = new MapLibreMap({
      container: container.current,
      style: STYLE_URLS[shownTheme.current],
      center: US_CENTER,
      zoom: 3.3,
      attributionControl: { compact: true, customAttribution: 'Weather: Open-Meteo (CC BY 4.0) · Routes: TomTom' },
    })
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      addRouteLayers(m, (id) => onSelectRef.current(id))
      setMap(m)
    })
    return () => m.remove()
  }, [])

  // 1b. Basemap follows the theme. setStyle would drop our sources and layers; transformStyle
  // puts them back on top of the new basemap, data, canvas and click handlers included.
  useEffect(() => {
    if (!map || shownTheme.current === theme) return
    shownTheme.current = theme
    map.setStyle(STYLE_URLS[theme], {
      transformStyle: (previous, next) => ({
        ...next,
        sources: {
          ...next.sources,
          ...Object.fromEntries(Object.entries(previous?.sources ?? {}).filter(([id]) => OWN_SOURCES.has(id))),
        },
        layers: [...next.layers, ...(previous?.layers ?? []).filter((l) => OWN_LAYERS.has(l.id))],
      }),
    })
  }, [map, theme])

  // 2. Routes and checkpoints.
  useEffect(() => {
    if (!map) return
    geoJsonSource(map, 'routes').setData(routesGeoJson(plan?.routes ?? [], selectedId))
    const selected = plan?.routes.find((r) => r.id === selectedId)
    geoJsonSource(map, 'checkpoints').setData(checkpointsGeoJson(selected))
  }, [map, plan, selectedId])

  // 3. Fit the routes on a new plan, and again whenever the map changes size (phone rotation,
  // window resize), so the routes stay in view.
  useEffect(() => {
    if (!map || !plan) return
    // Bottom padding keeps the routes clear of the weather controls card.
    const fit = (duration: number) =>
      map.fitBounds(plan.bounds, { padding: { top: fitPadding.top, right: 48, bottom: fitPadding.bottom, left: 48 }, duration })
    fit(600)
    const onResize = () => fit(0)
    map.on('resize', onResize)
    return () => {
      map.off('resize', onResize)
    }
  }, [map, plan, fitPadding])

  // 4 and 5. Heatmap.
  const field = heatmap?.field ?? null
  const canvasRef = useHeatmapCanvas(map, field)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!map || !canvas || !field) return
    const visible = heatmap !== null
    map.setLayoutProperty(HEATMAP_LAYER, 'visibility', visible ? 'visible' : 'none')
    if (!heatmap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(field.nx, field.ny)
    paintHour(field, heatmap.kind, heatmap.hour, image.data)
    ctx.putImageData(image, 0, 0)
    const src = map.getSource(HEATMAP_SOURCE)
    if (src instanceof CanvasSource) {
      src.play() // re-read the canvas once, then stop
      requestAnimationFrame(() => src.pause())
    }
  }, [map, canvasRef, field, heatmap])

  return { container, map }
}

// One small canvas per plan, placed over the corridor and drawn under the routes.
// Declared before the paint effect, so the canvas exists when that effect runs.
function useHeatmapCanvas(map: MapLibreMap | null, field: HeatmapField | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!map || !field) return
    const c = document.createElement('canvas')
    c.width = field.nx
    c.height = field.ny
    map.addSource(HEATMAP_SOURCE, { type: 'canvas', canvas: c, coordinates: field.corners, animate: false })
    map.addLayer(
      {
        id: HEATMAP_LAYER,
        type: 'raster',
        source: HEATMAP_SOURCE,
        paint: { 'raster-resampling': 'linear', 'raster-opacity': 0.85, 'raster-fade-duration': 0 },
      },
      ROUTES_CASING_LAYER,
    )
    canvasRef.current = c
    return () => {
      canvasRef.current = null
      if (map.getLayer(HEATMAP_LAYER)) map.removeLayer(HEATMAP_LAYER)
      if (map.getSource(HEATMAP_SOURCE)) map.removeSource(HEATMAP_SOURCE)
    }
  }, [map, field])
  return canvasRef
}

function geoJsonSource(map: MapLibreMap, id: string): GeoJSONSource {
  const s = map.getSource(id)
  if (!(s instanceof GeoJSONSource)) throw new Error(`map source ${id} missing`)
  return s
}

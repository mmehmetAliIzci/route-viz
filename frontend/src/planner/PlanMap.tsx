import 'maplibre-gl/dist/maplibre-gl.css'
import { useMemo } from 'react'
import { DEFAULT_FIT_PADDING, useMapLibre, type FitPadding, type HeatmapDisplay } from './map/useMapLibre'
import { useWindParticles, type WindDisplay } from './map/useWindParticles'
import type { PlanView } from './model/planView'
import { useResolvedTheme } from '../theme/theme'

type Props = {
  plan: PlanView | null
  selectedId: number | null
  onSelectRoute: (routeId: number) => void
  heatmap: HeatmapDisplay | null // null hides the heatmap
  fitPadding?: FitPadding // space the routes keep clear of, for panels that cover the map
  bearing?: number // compass direction that points up; default north
}

// One MapLibre map for the session. The lifecycle lives in useMapLibre; the wind particles
// are a canvas over the map, shown with the Wind layer when the plan has wind direction.
export function PlanMap({ plan, selectedId, onSelectRoute, heatmap, fitPadding = DEFAULT_FIT_PADDING, bearing = 0 }: Props) {
  const theme = useResolvedTheme()
  const { container, map } = useMapLibre({ plan, selectedId, onSelectRoute, heatmap, fitPadding, theme, bearing })
  const wind = useMemo<WindDisplay | null>(
    () =>
      heatmap?.kind === 'wind' && heatmap.field.windVectors ? { field: heatmap.field, hour: heatmap.hour } : null,
    [heatmap],
  )
  const particles = useWindParticles(map, wind, theme)
  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" role="region" aria-label="Map of routes and checkpoints" />
      <canvas ref={particles} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  )
}

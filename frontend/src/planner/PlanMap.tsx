import 'maplibre-gl/dist/maplibre-gl.css'
import { DEFAULT_FIT_PADDING, useMapLibre, type FitPadding, type HeatmapDisplay } from './map/useMapLibre'
import type { PlanView } from './model/planView'

type Props = {
  plan: PlanView | null
  selectedId: number | null
  onSelectRoute: (routeId: number) => void
  heatmap: HeatmapDisplay | null // null hides the heatmap
  fitPadding?: FitPadding // space the routes keep clear of, for panels that cover the map
}

// One MapLibre map for the session. The lifecycle lives in useMapLibre.
export function PlanMap({ plan, selectedId, onSelectRoute, heatmap, fitPadding = DEFAULT_FIT_PADDING }: Props) {
  const container = useMapLibre({ plan, selectedId, onSelectRoute, heatmap, fitPadding })
  return <div ref={container} className="h-full w-full" role="region" aria-label="Map of routes and checkpoints" />
}

import { Map as MapLibreMap } from 'maplibre-gl'
import { routeSegments, type RouteView } from '../model/planView'

export const ROUTES_CASING_LAYER = 'routes-casing'
export const UNSELECTED_ROUTE_COLOR = '#9AA3AD'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Adds the routes source and its layers, and the click and hover handlers on them.
export function addRouteLayers(map: MapLibreMap, onSelect: (routeId: number) => void) {
  map.addSource('routes', { type: 'geojson', data: EMPTY })

  map.addLayer({
    id: ROUTES_CASING_LAYER,
    type: 'line',
    source: 'routes',
    layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['get', 'order'] },
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 9, 6] },
  })
  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'routes',
    layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['get', 'order'] },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['get', 'selected'], 5, 3],
      'line-opacity': ['case', ['get', 'selected'], 1, 0.55],
    },
  })
  map.on('click', 'routes-line', (e) => {
    const id = e.features?.[0]?.properties?.routeId
    if (typeof id === 'number') onSelect(id)
  })
  map.on('mouseenter', 'routes-line', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'routes-line', () => (map.getCanvas().style.cursor = ''))
}

// The selected route is one feature per risk segment, each in its own colour; every other route is
// one grey feature. `order` puts the selected route on top.
export function routesGeoJson(routes: RouteView[], selectedId: number | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((r): GeoJSON.Feature[] => {
      const selected = r.id === selectedId
      const segments = selected ? routeSegments(r) : [{ color: UNSELECTED_ROUTE_COLOR, coordinates: r.geometry }]
      return segments.map((s) => ({
        type: 'Feature',
        properties: { routeId: r.id, selected, order: selected ? 1 : 0, color: s.color },
        geometry: { type: 'LineString', coordinates: s.coordinates },
      }))
    }),
  }
}

export type RouteLabel = {
  routeId: number
  lon: number
  lat: number
  text: string // "Recommended" or how much later or sooner than the recommended route
  tone: 'recommended' | 'sooner' | 'later' | 'same'
  selected: boolean
}

// One label per route at its middle, so the alternatives can be told apart and tapped.
export function routeLabels(routes: RouteView[], selectedId: number | null): RouteLabel[] {
  return routes.flatMap((r) => {
    const mid = r.geometry[Math.floor(r.geometry.length / 2)]
    if (!mid) return []
    const [lon, lat] = mid
    return [
      {
        routeId: r.id,
        lon,
        lat,
        text: r.isRecommended ? 'Recommended' : (r.vsRecommended?.label ?? r.name),
        tone: r.isRecommended ? 'recommended' : (r.vsRecommended?.tone ?? 'same'),
        selected: r.id === selectedId,
      },
    ]
  })
}

import { Map as MapLibreMap, Popup } from 'maplibre-gl'
import type { RouteView } from '../model/planView'

export const ROUTES_CASING_LAYER = 'routes-casing'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Adds the route and checkpoint sources and layers, and the click and hover handlers on them.
export function addRouteLayers(map: MapLibreMap, onSelect: (routeId: number) => void) {
  map.addSource('routes', { type: 'geojson', data: EMPTY })
  map.addSource('checkpoints', { type: 'geojson', data: EMPTY })

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
      'line-color': ['case', ['get', 'selected'], '#0A6B4B', '#9AA3AD'],
      'line-width': ['case', ['get', 'selected'], 5, 3],
      'line-opacity': ['case', ['get', 'selected'], 1, 0.55],
    },
  })
  map.addLayer({
    id: 'checkpoints',
    type: 'circle',
    source: 'checkpoints',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 9, 8],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  })

  map.on('click', 'routes-line', (e) => {
    const id = e.features?.[0]?.properties?.routeId
    if (typeof id === 'number') onSelect(id)
  })
  map.on('click', 'checkpoints', (e) => {
    const f = e.features?.[0]
    if (!f || f.geometry.type !== 'Point') return
    const p = f.properties
    const [lon, lat] = f.geometry.coordinates
    if (lon === undefined || lat === undefined) return
    const body = document.createElement('div')
    body.className = 'grid gap-0.5 text-sm'
    const lines = [`${p.mile} · ${p.eta}`, `${p.level}${p.cause ? ` (${p.cause})` : ''}`, String(p.weather)]
    lines.forEach((line, n) => {
      const row = document.createElement('div')
      row.textContent = line
      if (n === 0) row.className = 'font-medium'
      if (n === 2) row.className = 'text-xs text-muted-foreground'
      body.append(row)
    })
    new Popup({ closeButton: true, maxWidth: '280px' }).setLngLat([lon, lat]).setDOMContent(body).addTo(map)
  })
  for (const layer of ['routes-line', 'checkpoints']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
  }
}

export function routesGeoJson(routes: RouteView[], selectedId: number | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      properties: { routeId: r.id, selected: r.id === selectedId, order: r.id === selectedId ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: r.geometry },
    })),
  }
}

export function checkpointsGeoJson(route: RouteView | undefined): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (route?.checkpoints ?? []).map((c) => ({
      type: 'Feature',
      properties: {
        color: c.level.fill,
        mile: c.mileLabel,
        eta: c.etaLabel,
        level: c.level.label,
        cause: c.causeLabel,
        weather: c.weatherLabel,
      },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  }
}

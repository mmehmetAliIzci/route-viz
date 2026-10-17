import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import fixture from '../../test/plan-kc-den.json'
import { parsePlan } from '../../api/planApi'
import { decodeHeatmap } from '../model/heatmap'
import { buildPlanView } from '../model/planView'
import type { StyleSpecification, StyleSwapOptions } from 'maplibre-gl'
import type { ResolvedTheme } from '../../theme/theme'
import { useMapLibre, type FitPadding, type HeatmapDisplay } from './useMapLibre'

// A recording stand-in for MapLibre: the hook's calls are the behaviour under test.
const fake = vi.hoisted(() => {
  const calls: string[] = []
  const state = {
    maps: [] as unknown[],
    sources: new Map<string, unknown>(),
    layers: new Set<string>(),
    handlers: new Map<string, () => void>(),
  }
  class GeoJSONSource {
    setData = vi.fn((data: unknown) => void calls.push(`setData:${JSON.stringify(data).length}`))
  }
  class CanvasSource {
    play = vi.fn()
    pause = vi.fn()
  }
  class FakeMap {
    constructor() {
      state.maps.push(this)
    }
    addControl = vi.fn()
    on = vi.fn((event: string, handler: () => void) => void state.handlers.set(event, handler))
    off = vi.fn()
    fitBounds = vi.fn()
    setLayoutProperty = vi.fn()
    addSource = vi.fn((id: string, spec: { type: string }) => {
      calls.push(`addSource:${id}`)
      state.sources.set(id, spec.type === 'canvas' ? new CanvasSource() : new GeoJSONSource())
    })
    removeSource = vi.fn((id: string) => {
      calls.push(`removeSource:${id}`)
      state.sources.delete(id)
    })
    getSource = (id: string) => state.sources.get(id)
    addLayer = vi.fn((layer: { id: string }, before?: string) => {
      calls.push(`addLayer:${layer.id}${before ? `<${before}` : ''}`)
      state.layers.add(layer.id)
    })
    removeLayer = vi.fn((id: string) => {
      calls.push(`removeLayer:${id}`)
      state.layers.delete(id)
    })
    getLayer = (id: string) => (state.layers.has(id) ? {} : undefined)
    getCanvas = () => ({ style: {} })
    setStyle = vi.fn((url: string, _options?: StyleSwapOptions) => void calls.push(`setStyle:${url}`))
    remove = vi.fn(() => void calls.push('remove'))
  }
  return { calls, state, GeoJSONSource, CanvasSource, FakeMap }
})

vi.mock('maplibre-gl', () => ({
  Map: fake.FakeMap,
  GeoJSONSource: fake.GeoJSONSource,
  CanvasSource: fake.CanvasSource,
  NavigationControl: class {},
  Popup: class {},
  setWorkerUrl: () => {},
}))

const plan = parsePlan(fixture)
const view = buildPlanView(plan)
const field = decodeHeatmap(plan.heatmap)
const fitPadding: FitPadding = { top: 48, bottom: 200 }

type Props = {
  plan: typeof view | null
  selectedId: number | null
  heatmap: HeatmapDisplay | null
  onSelectRoute?: (id: number) => void
  theme?: ResolvedTheme
}

function Harness({ onSelectRoute = () => {}, theme = 'light', ...rest }: Props) {
  const { container } = useMapLibre({ ...rest, onSelectRoute, fitPadding, theme })
  return <div ref={container} />
}

const theMap = () => fake.state.maps[0] as InstanceType<typeof fake.FakeMap>
const sourceAt = (id: string) => fake.state.sources.get(id) as InstanceType<typeof fake.GeoJSONSource>
const loadMap = () => act(() => fake.state.handlers.get('load')?.())

beforeEach(() => {
  fake.calls.length = 0
  fake.state.maps.length = 0
  fake.state.sources.clear()
  fake.state.layers.clear()
  fake.state.handlers.clear()
  // jsdom has no canvas; the paint effect only needs these two calls.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => vi.restoreAllMocks())

describe('useMapLibre', () => {
  it('creates one map and adds sources and layers only after it loads', async () => {
    render(<Harness plan={null} selectedId={null} heatmap={null} />)
    expect(fake.state.maps).toHaveLength(1)
    expect(fake.calls).toEqual([])

    await loadMap()
    expect(fake.calls.slice(0, 5)).toEqual([
      'addSource:routes',
      'addSource:checkpoints',
      'addLayer:routes-casing',
      'addLayer:routes-line',
      'addLayer:checkpoints',
    ])
  })

  it('sets route and checkpoint data when the plan or the selection changes', async () => {
    const { rerender } = render(<Harness plan={null} selectedId={null} heatmap={null} />)
    await loadMap()
    const routes = sourceAt('routes')
    const checkpoints = sourceAt('checkpoints')
    expect(routes.setData).toHaveBeenCalledTimes(1) // empty collections once the map is ready

    rerender(<Harness plan={view} selectedId={view.verdict.routeId} heatmap={null} />)
    expect(routes.setData).toHaveBeenCalledTimes(2)
    const shown = routes.setData.mock.calls[1]?.[0] as GeoJSON.FeatureCollection
    expect(shown.features).toHaveLength(view.routes.length)
    const selected = shown.features.filter((f) => f.properties?.selected)
    expect(selected.map((f) => f.properties?.routeId)).toEqual([view.verdict.routeId])
    const dots = checkpoints.setData.mock.calls[1]![0] as GeoJSON.FeatureCollection
    expect(dots.features.length).toBeGreaterThan(0)

    const other = view.routes.find((r) => !r.isRecommended)!
    rerender(<Harness plan={view} selectedId={other.id} heatmap={null} />)
    expect(routes.setData).toHaveBeenCalledTimes(3)
    expect(theMap().fitBounds).toHaveBeenCalledTimes(1) // a new selection does not refit
  })

  it('fits the plan bounds and refits on resize', async () => {
    render(<Harness plan={view} selectedId={view.verdict.routeId} heatmap={null} />)
    await loadMap()
    expect(theMap().fitBounds).toHaveBeenCalledWith(view.bounds, expect.objectContaining({ duration: 600 }))
    act(() => fake.state.handlers.get('resize')?.())
    expect(theMap().fitBounds).toHaveBeenLastCalledWith(view.bounds, expect.objectContaining({ duration: 0 }))
  })

  it('adds the heatmap source under the routes, and removes it when the field goes away', async () => {
    const shown: HeatmapDisplay = { field, kind: 'risk', hour: 0 }
    const { rerender } = render(<Harness plan={view} selectedId={0} heatmap={shown} />)
    await loadMap()
    expect(fake.calls).toContain('addSource:heatmap')
    expect(fake.calls).toContain('addLayer:heatmap<routes-casing')
    expect(fake.calls.indexOf('addLayer:routes-casing')).toBeLessThan(
      fake.calls.indexOf('addLayer:heatmap<routes-casing'),
    )

    // Changing the hour repaints the same canvas; it does not recreate the source.
    const added = fake.calls.filter((c) => c === 'addSource:heatmap').length
    rerender(<Harness plan={view} selectedId={0} heatmap={{ ...shown, hour: 3 }} />)
    expect(fake.calls.filter((c) => c === 'addSource:heatmap')).toHaveLength(added)
    expect(fake.state.sources.get('heatmap')).toBeInstanceOf(fake.CanvasSource)

    rerender(<Harness plan={view} selectedId={0} heatmap={null} />)
    expect(fake.calls).toContain('removeLayer:heatmap')
    expect(fake.calls).toContain('removeSource:heatmap')
    expect(fake.state.sources.has('heatmap')).toBe(false)
  })

  it('replaces the heatmap source when a new field arrives', async () => {
    const { rerender } = render(<Harness plan={view} selectedId={0} heatmap={{ field, kind: 'risk', hour: 0 }} />)
    await loadMap()
    rerender(<Harness plan={view} selectedId={0} heatmap={{ field: { ...field }, kind: 'risk', hour: 0 }} />)
    const events = fake.calls.filter((c) => c.endsWith(':heatmap') || c.includes('heatmap<'))
    expect(events).toEqual([
      'addSource:heatmap',
      'addLayer:heatmap<routes-casing',
      'removeLayer:heatmap',
      'removeSource:heatmap',
      'addSource:heatmap',
      'addLayer:heatmap<routes-casing',
    ])
  })

  it('returns the map once it has loaded', async () => {
    const seen: unknown[] = []
    function Probe() {
      const { container, map } = useMapLibre({
        plan: null,
        selectedId: null,
        heatmap: null,
        onSelectRoute: () => {},
        fitPadding,
        theme: 'light',
      })
      useEffect(() => void seen.push(map), [map])
      return <div ref={container} />
    }
    render(<Probe />)
    expect(seen).toEqual([null])
    await loadMap()
    expect(seen).toEqual([null, theMap()])
  })

  it('swaps the basemap when the theme changes and keeps its own layers on top', async () => {
    const { rerender } = render(<Harness plan={view} selectedId={0} heatmap={null} theme="light" />)
    await loadMap()
    expect(theMap().setStyle).not.toHaveBeenCalled()

    rerender(<Harness plan={view} selectedId={0} heatmap={null} theme="dark" />)
    expect(theMap().setStyle).toHaveBeenCalledTimes(1)
    const [url, options] = theMap().setStyle.mock.calls[0] ?? []
    expect(url).toBe('https://tiles.openfreemap.org/styles/dark')
    const empty = { type: 'FeatureCollection' as const, features: [] }
    const previous: StyleSpecification = {
      version: 8,
      sources: { routes: { type: 'geojson', data: empty }, openmaptiles: { type: 'vector' } },
      layers: [
        { id: 'water', type: 'fill', source: 'openmaptiles' },
        { id: 'routes-line', type: 'line', source: 'routes' },
      ],
    }
    const next: StyleSpecification = {
      version: 8,
      sources: { dark: { type: 'vector' } },
      layers: [{ id: 'bg', type: 'background' }],
    }
    const merged = options?.transformStyle?.(previous, next)
    expect(Object.keys(merged?.sources ?? {})).toEqual(['dark', 'routes'])
    expect(merged?.layers.map((l) => l.id)).toEqual(['bg', 'routes-line'])

    rerender(<Harness plan={view} selectedId={0} heatmap={null} theme="dark" />)
    expect(theMap().setStyle).toHaveBeenCalledTimes(1)
  })

  it('removes the map once on unmount', async () => {
    const { unmount } = render(<Harness plan={view} selectedId={0} heatmap={{ field, kind: 'wind', hour: 1 }} />)
    await loadMap()
    unmount()
    expect(theMap().remove).toHaveBeenCalledTimes(1)
  })
})

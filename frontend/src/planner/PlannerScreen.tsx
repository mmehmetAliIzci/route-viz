import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { getSample, postPlan, type DemoScenario, type TripInput } from '../api/planApi'
import { decodeHeatmap, type HeatmapField } from './model/heatmap'
import { buildPlanView, type PlanView } from './model/planView'
import { PlannerDesktop } from './PlannerDesktop'
import type { PlannerScreenState } from './plannerLayout'
import { PHONE_PEEK_PX, PlannerPhone } from './PlannerPhone'
import { SavedTrips } from './SavedTrips'
import { SettingsSheet, type Spacing } from './SettingsSheet'
import { TripForm } from './TripForm'
import { useMediaQuery } from './useMediaQuery'
import type { LayerChoice, WeatherControlsProps } from './WeatherControls'

// MapLibre is most of the bundle; load it after the form has rendered.
const PlanMap = lazy(() => import('./PlanMap').then((m) => ({ default: m.PlanMap })))

// Phone: the routes are fitted between the top bar and the forecast card above the resting sheet.
const PHONE_FIT_PADDING = { top: 72, bottom: PHONE_PEEK_PX + 12 + 136 } // card: legend, label, slider, day ticks

type PlanRequest = { kind: 'live'; trip: TripInput } | { kind: 'saved'; sampleId: string }
type ShownPlan = { view: PlanView; field: HeatmapField }

type PlanJob = { request: PlanRequest; demo: DemoScenario[] }

async function requestPlan({ request, demo }: PlanJob): Promise<ShownPlan> {
  const plan = request.kind === 'live' ? await postPlan(request.trip, demo) : await getSample(request.sampleId, demo)
  return { view: buildPlanView(plan), field: decodeHeatmap(plan.heatmap) }
}

// The planner. Owns the trip, the plan and the map choices; the phone and desktop layouts only arrange them.
export function PlannerScreen() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [trip, setTrip] = useState<TripInput | null>(null)
  const [editing, setEditing] = useState(false)
  const [shown, setShown] = useState<ShownPlan | null>(null) // the last plan that arrived
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [hour, setHour] = useState(0)
  const [layer, setLayer] = useState<LayerChoice>('risk')
  const [spacingMi, setSpacingMi] = useState<Spacing>(25)
  const [demo, setDemo] = useState<DemoScenario[]>([]) // demo storms on; empty is the real forecast
  const [lastRequest, setLastRequest] = useState<PlanRequest | null>(null) // what the toggle re-asks

  const plan = useMutation({
    mutationFn: requestPlan,
    onSuccess: (next) => {
      setShown(next)
      setPickedId(null)
      setHour(0)
      setEditing(false)
    },
    // The plan on screen did not change, so the switch goes back to what that plan used.
    onError: () => setDemo(shown?.view.demo ?? []),
  })

  const view = shown?.view ?? null
  const field = shown?.field ?? null
  const screen: PlannerScreenState = view ? 'ready' : plan.isPending ? 'planning' : plan.isError ? 'error' : 'idle'
  const selectedId = pickedId ?? view?.verdict.routeId ?? null
  const heatmap = useMemo(
    () => (field && layer !== 'off' ? { field, kind: layer, hour } : null),
    [field, layer, hour],
  )

  // On a phone the top bar and weather card cover the top of the map and the sheet, half open, the bottom.
  // Phones start with the trip running up the screen, so a long corridor fills the tall viewport.
  const [routeUp, setRouteUp] = useState(!isDesktop)
  const fitPadding = isDesktop ? undefined : PHONE_FIT_PADDING

  function request(next: PlanRequest, storms: DemoScenario[] = demo) {
    setLastRequest(next)
    plan.mutate({ request: next, demo: storms })
  }

  function submit(input: TripInput) {
    setTrip(input)
    setEditing(false)
    request({ kind: 'live', trip: input })
  }

  function openSaved(sampleId: string) {
    setEditing(false)
    request({ kind: 'saved', sampleId })
  }

  // Adding a storm also shows its layer; removing one leaves the layer where the driver put it.
  function chooseDemo(next: DemoScenario[]) {
    const added = next.find((s) => !demo.includes(s))
    setDemo(next)
    if (added) setLayer(added)
    if (lastRequest && view) request(lastRequest, next)
  }

  const weatherControls: WeatherControlsProps | null =
    view && field
      ? {
          plan: view,
          hours: field.hours,
          hour,
          onHourChange: setHour,
          layer,
          onLayerChange: setLayer,
          disabled: plan.isPending,
        }
      : null

  const layout = {
    screen,
    view,
    selectedId,
    onSelectRoute: setPickedId,
    replanning: view !== null && plan.isPending,
    editing,
    onEdit: () => setEditing(true),
    onCancelEdit: () => setEditing(false),
    map: (
      <Suspense fallback={<div className="h-full w-full bg-muted" aria-hidden />}>
        <PlanMap
          plan={view}
          selectedId={selectedId}
          onSelectRoute={setPickedId}
          heatmap={heatmap}
          fitPadding={fitPadding}
          bearing={routeUp && view ? view.travelBearing : 0}
        />
      </Suspense>
    ),
    weather: weatherControls,
    orientation: { routeUp, toggle: () => setRouteUp((v) => !v) },
    form: <TripForm initial={trip} isPlanning={plan.isPending} spacingMi={spacingMi} onSubmit={submit} />,
    savedTrips: <SavedTrips disabled={plan.isPending} onOpen={openSaved} />,
    settings: (
      <SettingsSheet
        spacingMi={spacingMi}
        onSpacingChange={setSpacingMi}
        demo={demo}
        onDemoChange={chooseDemo}
        demoDisabled={plan.isPending}
        triggerClassName={isDesktop ? undefined : 'rounded-full bg-card shadow-md hover:bg-card'}
      />
    ),
    error: plan.isError ? plan.error.message : null,
  }

  return isDesktop ? <PlannerDesktop {...layout} /> : <PlannerPhone {...layout} />
}

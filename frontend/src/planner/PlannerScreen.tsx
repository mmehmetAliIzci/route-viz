import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { getSample, postPlan, type DemoScenario, type TripInput } from '../api/planApi'
import { decodeHeatmap, type HeatmapField } from './model/heatmap'
import { buildPlanView, type PlanView } from './model/planView'
import { PlannerDesktop } from './PlannerDesktop'
import type { PlannerScreenState } from './plannerLayout'
import { PlannerPhone } from './PlannerPhone'
import { SavedTrips } from './SavedTrips'
import { SettingsSheet, type Spacing } from './SettingsSheet'
import { TripForm } from './TripForm'
import { useMediaQuery } from './useMediaQuery'
import { WeatherControls, type DemoChoice, type LayerChoice } from './WeatherControls'

// MapLibre is most of the bundle; load it after the form has rendered.
const PlanMap = lazy(() => import('./PlanMap').then((m) => ({ default: m.PlanMap })))

const PHONE_TOP_COVER = 300 // px: top bar plus weather card with its demo row and demo line

type PlanRequest = { kind: 'live'; trip: TripInput } | { kind: 'saved'; sampleId: string }
type ShownPlan = { view: PlanView; field: HeatmapField }

type PlanJob = { request: PlanRequest; demo: DemoScenario | undefined }

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
  const [demo, setDemo] = useState<DemoChoice>('off')
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
    onError: () => setDemo(shown?.view.demo ?? 'off'),
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
  const fitPadding = useMemo(
    () => (isDesktop ? undefined : { top: PHONE_TOP_COVER, bottom: Math.round(window.innerHeight * 0.45) }),
    [isDesktop],
  )

  function request(next: PlanRequest, scenario: DemoChoice = demo) {
    setLastRequest(next)
    plan.mutate({ request: next, demo: scenario === 'off' ? undefined : scenario })
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

  // Picking a storm also shows its layer; turning demo off leaves the layer where the driver put it.
  function chooseDemo(next: DemoChoice) {
    setDemo(next)
    if (next !== 'off') setLayer(next)
    if (lastRequest && view) request(lastRequest, next)
  }

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
        />
      </Suspense>
    ),
    weather:
      view && field ? (
        <WeatherControls
          plan={view}
          hours={field.hours}
          hour={hour}
          onHourChange={setHour}
          layer={layer}
          onLayerChange={setLayer}
          demo={demo}
          onDemoChange={chooseDemo}
          disabled={plan.isPending}
        />
      ) : null,
    form: <TripForm initial={trip} isPlanning={plan.isPending} spacingMi={spacingMi} onSubmit={submit} />,
    savedTrips: <SavedTrips disabled={plan.isPending} onOpen={openSaved} />,
    settings: (
      <SettingsSheet
        spacingMi={spacingMi}
        onSpacingChange={setSpacingMi}
        triggerClassName={isDesktop ? undefined : 'rounded-full bg-card shadow-md hover:bg-card'}
      />
    ),
    error: plan.isError ? plan.error.message : null,
  }

  return isDesktop ? <PlannerDesktop {...layout} /> : <PlannerPhone {...layout} />
}

import { ArrowLeft, Compass, Navigation } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { LayerLegend } from './LayerLegend'
import { LayerRail } from './LayerRail'
import type { MapOrientation } from './plannerLayout'
import type { PlannerLayoutProps } from './plannerLayout'
import { RouteRows } from './RouteRows'
import { TimeControl } from './TimeControl'
import { PlanError, TripPanel } from './TripPanel'
import { VerdictCard, VerdictLine } from './VerdictCard'

export const PHONE_PEEK_PX = 92 // the sheet's resting height: the verdict in one line
const PEEK = `${PHONE_PEEK_PX}px`
const HALF = 0.55
const FULL = 1
const SNAP_POINTS = [PEEK, HALF, FULL]
type Snap = string | number | null

// Phone: the plan screen alone until there is a plan, then the map first. The layer rail and the
// orientation button float on the right, the forecast hour floats above a sheet that rests at
// one line (the verdict) and opens to the route cards.
export function PlannerPhone(props: PlannerLayoutProps) {
  const [snap, setSnap] = useState<Snap>(PEEK)
  const { screen, view, selectedId, weather } = props

  if (screen !== 'ready' || !view || selectedId === null) {
    return (
      <div className="h-dvh overflow-y-auto bg-background p-4 pb-6">
        <TripPanel form={props.form} savedTrips={props.savedTrips} error={props.error} settings={props.settings} />
      </div>
    )
  }

  // Editing always shows the sheet full; whenever editing ends it comes back to the verdict line.
  const shownSnap = props.editing ? FULL : snap

  function edit() {
    setSnap(PEEK)
    props.onEdit()
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-background [&_.maplibregl-ctrl-top-right]:hidden">
      <div className="absolute inset-0">
        {props.map}
        <div className="absolute inset-x-2 top-2 z-10 flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="size-12 shrink-0 rounded-full shadow-md"
            aria-label="Edit trip"
            onClick={edit}
          >
            <ArrowLeft className="size-6" />
          </Button>
          <p className="min-w-0 flex-1 truncate rounded-full bg-card px-4 py-3 text-sm font-medium text-card-foreground shadow-md">
            {view.tripLabel}
          </p>
          {props.settings}
        </div>
        {weather && (
          <>
            <div className="absolute top-[72px] right-2 z-10 grid justify-items-end gap-2">
              <LayerRail layer={weather.layer} onLayerChange={weather.onLayerChange} />
              <OrientationButton orientation={props.orientation} />
            </div>
            <div
              className="absolute inset-x-2 z-10 grid gap-1.5 rounded-xl bg-card/95 p-2 shadow-lg backdrop-blur"
              style={{ bottom: PHONE_PEEK_PX + 12 }}
            >
              <LayerLegend layer={weather.layer} />
              <TimeControl
                plan={weather.plan}
                hours={weather.hours}
                hour={weather.hour}
                onHourChange={weather.onHourChange}
                disabled={weather.disabled}
              />
            </div>
          </>
        )}
      </div>
      <Drawer
        open
        modal={false}
        dismissible={false}
        snapPoints={SNAP_POINTS}
        activeSnapPoint={shownSnap}
        setActiveSnapPoint={(next) => !props.editing && setSnap(next)}
      >
        <DrawerContent className="h-dvh data-[vaul-drawer-direction=bottom]:max-h-none">
          <DrawerTitle className="sr-only">{props.editing ? 'Edit trip' : 'Routes'}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {props.editing ? 'Change any field and plan again.' : 'The recommended route and the other routes.'}
          </DrawerDescription>
          {!props.editing && (
            <div className="px-4 pt-1">
              <VerdictLine plan={view} onClick={() => setSnap(HALF)} />
            </div>
          )}
          <div
            data-snap={String(shownSnap)}
            className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-24"
          >
            {props.editing ? (
              <TripPanel
                form={props.form}
                savedTrips={props.savedTrips}
                error={props.error}
                onCancel={props.onCancelEdit}
              />
            ) : (
              <div
                className={cn('grid gap-4', props.replanning && 'opacity-60')}
                aria-busy={props.replanning}
              >
                {props.error && <PlanError message={props.error} />}
                <VerdictCard
                  plan={view}
                  selected={selectedId === view.verdict.routeId}
                  onSelect={() => props.onSelectRoute(view.verdict.routeId)}
                  onShowOnMap={() => setSnap(PEEK)}
                />
                <RouteRows plan={view} selectedId={selectedId} onSelect={props.onSelectRoute} />
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

// North up, or the trip running up the screen. A map control, so it sits with the rail, not the routes.
function OrientationButton({ orientation }: { orientation: MapOrientation }) {
  const { routeUp, toggle } = orientation
  return (
    <Button
      variant="secondary"
      size="icon"
      className="size-10 rounded-full shadow-md"
      aria-label={routeUp ? 'North up' : 'Route up'}
      aria-pressed={routeUp}
      title={routeUp ? 'Show north up' : 'Rotate so the trip runs up the screen'}
      onClick={toggle}
    >
      {routeUp ? <Compass className="size-5" /> : <Navigation className="size-5" />}
    </Button>
  )
}

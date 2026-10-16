import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { selectedRouteName } from './model/planView'
import type { PlannerLayoutProps } from './plannerLayout'
import { RouteRows } from './RouteRows'
import { PlanError, TripPanel } from './TripPanel'
import { VerdictCard } from './VerdictCard'

const PEEK = '100px'
const HALF = 0.5
const FULL = 1
const SNAP_POINTS = [PEEK, HALF, FULL]
type Snap = string | number | null

// Phone: the plan screen alone until there is a plan, then a full-screen map with a bottom sheet.
export function PlannerPhone(props: PlannerLayoutProps) {
  const [snap, setSnap] = useState<Snap>(HALF)
  const { screen, view, selectedId } = props

  if (screen !== 'ready' || !view || selectedId === null) {
    return (
      <div className="h-dvh overflow-y-auto bg-background p-4 pb-6">
        <TripPanel form={props.form} savedTrips={props.savedTrips} error={props.error} settings={props.settings} />
      </div>
    )
  }

  // Editing always shows the sheet full; whenever editing ends it comes back at half.
  const shownSnap = props.editing ? FULL : snap

  function edit() {
    setSnap(HALF)
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
        {props.weather}
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
                  mapRouteName={selectedRouteName(view, selectedId)}
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

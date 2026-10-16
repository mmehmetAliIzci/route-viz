import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { selectedRouteName } from './model/planView'
import type { PlannerLayoutProps } from './plannerLayout'
import { RouteRows } from './RouteRows'
import { PlanError, TripPanel } from './TripPanel'
import { VerdictCard } from './VerdictCard'

// Desktop: a 440 px panel on the left, the map on the rest. The map is there from the start.
export function PlannerDesktop(props: PlannerLayoutProps) {
  const { view, selectedId, replanning, editing, map, weather } = props
  const showResults = view !== null && selectedId !== null && !editing
  return (
    <div className="flex h-dvh bg-background">
      <aside className="flex w-[440px] shrink-0 flex-col gap-4 overflow-y-auto border-r p-4">
        {showResults ? (
          <div className={cn('grid gap-4', replanning && 'opacity-60')} aria-busy={replanning}>
            <ResultsHeader {...props} />
            {props.error && <PlanError message={props.error} />}
            <VerdictCard
              plan={view}
              selected={selectedId === view.verdict.routeId}
              mapRouteName={selectedRouteName(view, selectedId)}
              onSelect={() => props.onSelectRoute(view.verdict.routeId)}
            />
            <RouteRows plan={view} selectedId={selectedId} onSelect={props.onSelectRoute} />
          </div>
        ) : (
          <TripPanel
            form={props.form}
            savedTrips={props.savedTrips}
            error={props.error}
            settings={props.settings}
            onCancel={view ? props.onCancelEdit : undefined}
          />
        )}
        {props.screen === 'planning' && (
          <p className="text-sm text-muted-foreground" role="status">
            Planning routes and checking the weather…
          </p>
        )}
      </aside>
      <main className="relative min-w-0 flex-1">
        {map}
        {weather}
      </main>
    </div>
  )
}

function ResultsHeader({ view, onEdit, settings }: PlannerLayoutProps) {
  if (!view) return null
  return (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 text-base font-medium break-words">{view.tripLabel}</p>
      <Button variant="outline" className="h-12 px-4 text-base" onClick={onEdit}>
        <Pencil />
        Edit trip
      </Button>
      {settings}
    </div>
  )
}

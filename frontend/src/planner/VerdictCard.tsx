import { ChevronUp, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PlanView } from './model/planView'

type Props = {
  plan: PlanView
  onShowOnMap?: () => void
  // With onSelect, the card is how the driver puts the recommended route on the map.
  onSelect?: () => void
  selected?: boolean
  mapRouteName?: string // the route the map shows when it is not this one
}

const headlineClass = 'font-display min-w-0 text-left text-[38px] leading-[1.05] font-bold break-words'

// The answer first: which route, what the driver will hit on it and when, how long it takes,
// and in small print why it beat the others.
export function VerdictCard({ plan, onShowOnMap, onSelect, selected = true, mapRouteName }: Props) {
  const { verdict } = plan
  return (
    <section
      aria-label="Recommendation"
      className="relative grid gap-2 rounded-2xl bg-primary p-4 text-primary-foreground"
    >
      <p className="text-sm font-medium tracking-wide uppercase">Best for your load</p>
      <h2 className="min-w-0">
        {onSelect ? (
          // The stretched pseudo-element makes the whole card the tap target while the heading stays a heading.
          <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            className={`${headlineClass} rounded-md outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-4 focus-visible:after:ring-action`}
          >
            {verdict.headline}
          </button>
        ) : (
          <span className={headlineClass}>{verdict.headline}</span>
        )}
      </h2>
      <p className="text-base font-semibold">
        {verdict.durationLabel} · Arrive {verdict.arrivalLabel} · {verdict.distanceLabel}
      </p>
      <p className="flex items-start gap-2 text-base break-words">
        <StretchDot plan={plan} />
        <span className="min-w-0">{verdict.stretchLine}</span>
      </p>
      <p className="text-sm break-words opacity-85">
        {verdict.whyLine}
        {verdict.loadNote ? ` ${verdict.loadNote}` : ''}
      </p>
      {verdict.tradeoff && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-destructive px-3 py-2.5 text-sm font-semibold break-words text-white shadow-md"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span className="min-w-0">{verdict.tradeoff}</span>
        </p>
      )}
      {onSelect && !selected && mapRouteName && <p className="text-sm">Map shows {mapRouteName}</p>}
      {onShowOnMap && (
        <Button
          type="button"
          variant="secondary"
          className="relative mt-1 h-14 w-full text-base text-secondary-foreground"
          onClick={onShowOnMap}
        >
          Show on map
        </Button>
      )}
    </section>
  )
}

// The verdict in one line, for the phone sheet at rest. Tapping it opens the cards.
export function VerdictLine({ plan, onClick }: { plan: PlanView; onClick: () => void }) {
  const { verdict } = plan
  const best = plan.routes.find((r) => r.id === verdict.routeId)
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 text-left" aria-label="Show routes">
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-base font-semibold">{verdict.headline}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            {verdict.durationLabel} · Arrive {verdict.arrivalLabel} ·
          </span>
          <StretchDot plan={plan} small />
          <span className="truncate">{best?.stretchShort}</span>
        </span>
      </span>
      <ChevronUp className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

// A dot in the colour of the worst stretch, so the level reads before the words do.
function StretchDot({ plan, small = false }: { plan: PlanView; small?: boolean }) {
  const level = plan.verdict.stretch?.level
  if (!level) return null
  return (
    <span
      className={small ? 'size-2 shrink-0 rounded-full' : 'mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-white/70'}
      style={{ background: level.fill }}
      aria-hidden
    />
  )
}

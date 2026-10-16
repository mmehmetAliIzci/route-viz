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

// The answer first: which route to take, when it arrives, and why.
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
      <p className="text-base font-semibold">Arrive {verdict.arrivalLabel}</p>
      <p className="text-base break-words">{verdict.reason}</p>
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

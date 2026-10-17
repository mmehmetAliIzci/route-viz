import { History } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanView } from './model/planView'

type Props = {
  plan: PlanView
  selectedId: number
  onSelect: (routeId: number) => void
}

const TONE = {
  sooner: 'text-accent-ink',
  later: 'text-[#A3123F] dark:text-[#FF6B8A]', // #FF6B8A is 6.2:1 on the night card #1A1E24
  same: 'text-muted-foreground',
}

// The routes the verdict did not pick, one tap target each, plus the saved banner and footer.
export function RouteRows({ plan, selectedId, onSelect }: Props) {
  const others = plan.routes.filter((r) => !r.isRecommended)
  return (
    <section className="grid gap-3" aria-label="Other routes">
      {plan.savedLabel && (
        <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm break-words">
          <History className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">{plan.savedLabel}. Not live.</span>
        </p>
      )}
      {others.length > 0 && (
        <>
          <h2 className="text-sm font-semibold">Other routes</h2>
          <ul className="grid gap-2">
            {others.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-pressed={r.id === selectedId}
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    'flex min-h-[72px] w-full items-center gap-3 rounded-xl border bg-card p-3 text-left text-card-foreground shadow-xs transition-colors',
                    'focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none',
                    r.id === selectedId && 'border-transparent ring-2 ring-accent-ink',
                  )}
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="min-w-0 text-base font-semibold break-words">
                      {r.name}
                      {r.isFastest && <span className="font-normal text-muted-foreground"> · fastest</span>}
                    </span>
                    <span className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full"
                        style={{ background: r.worst.fill }}
                        aria-hidden
                      />
                      <span className="min-w-0 break-words">{r.stretchShort}</span>
                    </span>
                  </span>
                  <span className="grid shrink-0 justify-items-end gap-0.5 text-right">
                    <span className="text-base font-semibold">{r.arrivalShort}</span>
                    {r.vsRecommended && (
                      <span className={cn('text-sm font-medium', TONE[r.vsRecommended.tone])}>
                        {r.vsRecommended.label}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm break-words text-muted-foreground">
        {plan.forecastLabel}
        {plan.demo ? '' : ' · Open-Meteo'} · ETAs assume no stops
      </p>
    </section>
  )
}

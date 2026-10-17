import type { PlanView } from './planView'

export type DayTick = { hour: number; label: string } // hours after departure where the viewer's day changes

// Ticks for the forecast slider: one at each midnight in the viewer's zone, labelled with the new day.
export function dayTicks(plan: PlanView, hours: number): DayTick[] {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: plan.viewerTz })
  const t0 = Date.parse(plan.departureUtc)
  const ticks: DayTick[] = []
  let previous = weekday.format(new Date(t0))
  for (let h = 1; h < hours; h++) {
    const day = weekday.format(new Date(t0 + h * 3_600_000))
    if (day !== previous) ticks.push({ hour: h, label: day })
    previous = day
  }
  return ticks
}

import fixture from '../../test/plan-kc-den.json'
import { parsePlan } from '../../api/planApi'
import { buildPlanView } from './planView'
import { dayTicks } from './timeline'

describe('dayTicks', () => {
  it('marks each midnight in the viewer zone with the new day', () => {
    // Departure 2026-10-16T14:00Z is 9:00 AM Friday in Chicago; midnights fall 15 and 39 hours later.
    const plan = { ...buildPlanView(parsePlan(fixture)), viewerTz: 'America/Chicago', departureUtc: '2026-10-16T14:00:00Z' }
    expect(dayTicks(plan, 49)).toEqual([
      { hour: 15, label: 'Sat' },
      { hour: 39, label: 'Sun' },
    ])
  })

  it('has no ticks inside a single day', () => {
    const plan = { ...buildPlanView(parsePlan(fixture)), viewerTz: 'UTC', departureUtc: '2026-10-16T01:00:00Z' }
    expect(dayTicks(plan, 10)).toEqual([])
  })
})

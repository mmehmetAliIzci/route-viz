import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fixture from '../test/plan-kc-den.json'
import { parsePlan } from '../api/planApi'
import { buildPlanView } from './model/planView'
import { RouteRows } from './RouteRows'
import { VerdictCard } from './VerdictCard'

const plan = parsePlan(fixture)
const view = buildPlanView(plan)

describe('VerdictCard', () => {
  it('shows the headline, the trip facts, what the driver will hit, and why this route', () => {
    render(<VerdictCard plan={view} />)
    expect(screen.getByRole('heading', { name: view.verdict.headline })).toBeInTheDocument()
    expect(screen.getByText('Best for your load')).toBeInTheDocument()
    expect(
      screen.getByText(`${view.verdict.durationLabel} · Arrive ${view.verdict.arrivalLabel} · ${view.verdict.distanceLabel}`),
    ).toBeInTheDocument()
    expect(screen.getByText(view.verdict.stretchLine)).toBeInTheDocument()
    expect(screen.getByText(view.verdict.whyLine)).toBeInTheDocument()
  })

  it('warns when a much faster road lost on hazard miles, and stays quiet otherwise', () => {
    render(<VerdictCard plan={view} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // the fixture recommends the fastest route
    cleanup()
    const [a, b, c] = plan.routes
    const slowWinner = { ...a!, duration_s: 29 * 3600, summary: { ...a!.summary, no_travel_mi: 187.5, max_level: 'no_travel' as const } }
    const fast = { ...b!, duration_s: 23.9 * 3600, summary: { ...b!.summary, no_travel_mi: 237.5, max_level: 'no_travel' as const } }
    const stormy = buildPlanView({ ...plan, routes: [slowWinner, fast, { ...c!, duration_s: 30 * 3600 }] })
    render(<VerdictCard plan={stormy} />)
    expect(screen.getByRole('alert')).toHaveTextContent(`Trade-off: ${b!.name} is 5 h 6 min faster, but has 50 more mi of No travel weather (238 vs 188).`)
  })

  it('offers a later departure when the plan has one', () => {
    const recommended = plan.routes.find((r) => r.id === plan.recommendation.route_id)!
    const withLater = buildPlanView({
      ...plan,
      routes: plan.routes.map((r) => (r.id === recommended.id ? { ...r, summary: { ...r.summary, no_travel_mi: 67.3, max_level: 'no_travel' as const } } : r)),
      recommendation: {
        ...plan.recommendation,
        leave_later: { shift_h: 12, departure_utc: '2026-10-17T02:00:00Z', no_travel_mi: 0, severe_mi: 0, high_mi: 0, max_level: 'low' as const },
      },
    })
    render(<VerdictCard plan={withLater} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^Leave 12 h later, at .*: no No Travel weather \(now 67 mi\)\.$/)
  })

  it('shows Show on map only when a handler is given', async () => {
    const onShowOnMap = vi.fn()
    const { rerender } = render(<VerdictCard plan={view} />)
    expect(screen.queryByRole('button', { name: 'Show on map' })).not.toBeInTheDocument()
    rerender(<VerdictCard plan={view} onShowOnMap={onShowOnMap} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show on map' }))
    expect(onShowOnMap).toHaveBeenCalledTimes(1)
  })
})

describe('VerdictCard selection', () => {
  it('is a pressed button when the recommended route is on the map', async () => {
    const onSelect = vi.fn()
    render(<VerdictCard plan={view} selected onSelect={onSelect} />)
    const button = screen.getByRole('button', { name: view.verdict.headline })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/^Map shows/)).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('says which route the map shows when another one is picked', () => {
    render(<VerdictCard plan={view} selected={false} mapRouteName="US-36 W" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: view.verdict.headline })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Map shows US-36 W')).toBeInTheDocument()
  })

  it('keeps Show on map as its own button next to the selector', async () => {
    const onSelect = vi.fn()
    const onShowOnMap = vi.fn()
    render(<VerdictCard plan={view} selected onSelect={onSelect} onShowOnMap={onShowOnMap} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show on map' }))
    expect(onShowOnMap).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('RouteRows', () => {
  it('lists every route except the recommended one', () => {
    render(<RouteRows plan={view} selectedId={0} onSelect={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Other routes' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(view.routes.length - 1)
  })

  it('shows each route\'s worst stretch on its row, not the arrival sentence', () => {
    const [best, second, ...rest] = plan.routes
    const stormy = {
      ...second!,
      checkpoints: second!.checkpoints.map((c, i) => (i === 3 ? { ...c, level: 'moderate' as const, cause: 'rain' as const } : c)),
    }
    const withHazard = buildPlanView({ ...plan, routes: [best!, stormy, ...rest] })
    const { container } = render(<RouteRows plan={withHazard} selectedId={0} onSelect={vi.fn()} />)
    expect(screen.getByText(`Moderate rain, ${plan.trip.spacing_mi} mi`)).toBeInTheDocument()
    expect(screen.getByText('Clear all the way')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('Arrives')
  })

  it('calls onSelect with the clicked route id', async () => {
    const onSelect = vi.fn()
    render(<RouteRows plan={view} selectedId={0} onSelect={onSelect} />)
    const other = view.routes.find((r) => !r.isRecommended)!
    await userEvent.click(screen.getByRole('button', { name: new RegExp(other.name.replace(/[/]/g, '\\/')) }))
    expect(onSelect).toHaveBeenCalledWith(other.id)
  })

  it('marks only the route on the map as pressed', () => {
    const others = view.routes.filter((r) => !r.isRecommended)
    render(<RouteRows plan={view} selectedId={others[0]!.id} onSelect={vi.fn()} />)
    const rows = screen.getAllByRole('button')
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true')
    expect(rows.slice(1).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('shows no Other routes heading for a single route', () => {
    const single = buildPlanView(
      parsePlan({
        ...fixture,
        routes: fixture.routes.slice(0, 1),
        recommendation: {
          ...fixture.recommendation,
          route_id: 0,
          reason: 'Only route available.',
          why_not: [],
        },
      }),
    )
    render(<RouteRows plan={single} selectedId={0} onSelect={vi.fn()} />)
    expect(screen.queryByText('Other routes')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('never renders a risk score', () => {
    const { container } = render(
      <>
        <VerdictCard plan={view} />
        <RouteRows plan={view} selectedId={0} onSelect={vi.fn()} />
      </>,
    )
    expect(container).not.toHaveTextContent('0.07')
  })

  it('shows the saved banner and the footer', () => {
    render(<RouteRows plan={{ ...view, savedLabel: 'Saved trip, recorded Thu, Oct 15' }} selectedId={0} onSelect={vi.fn()} />)
    expect(screen.getByText('Saved trip, recorded Thu, Oct 15. Not live.')).toBeInTheDocument()
    expect(screen.getByText(/Open-Meteo · ETAs assume no stops/)).toBeInTheDocument()
  })
})

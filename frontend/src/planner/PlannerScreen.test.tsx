import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fixture from '../test/plan-kc-den.json'
import * as planApi from '../api/planApi'
import { PlannerScreen } from './PlannerScreen'

vi.mock('./PlanMap', () => ({ PlanMap: () => <div data-testid="map" /> }))
vi.mock('../api/planApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/planApi')>()),
  getSample: vi.fn(),
  postPlan: vi.fn(),
  listSamples: vi.fn(),
}))

const plan = planApi.parsePlan(fixture)
const savedName = 'Kansas City, MO to Denver, CO'

function mockViewport(isDesktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: isDesktop && query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  )
}

function renderScreen() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PlannerScreen />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(planApi.listSamples).mockResolvedValue([
    { id: 'kc-den', label: savedName, recorded_utc: '2026-10-15T12:00:00Z' },
  ])
  vi.mocked(planApi.getSample).mockResolvedValue(plan)
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  // jsdom has no pointer capture, which the drawer's drag handling calls on press.
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('PlannerScreen on a phone', () => {
  beforeEach(() => mockViewport(false))

  it('starts on the plan screen without a map', () => {
    renderScreen()
    expect(screen.getByRole('heading', { name: 'Where to?' })).toBeInTheDocument()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })

  it('opens a saved trip into the map and the verdict', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    expect(await screen.findByTestId('map')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Take / })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Where to?' })).not.toBeInTheDocument()
  })

  it('shows the trip summary and opens the form from the edit button, then cancels back', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    await screen.findByTestId('map')
    expect(screen.getAllByText(/Kansas City, MO.*Denver, CO · 38,000 lb/).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Edit trip' }))
    expect(screen.getByRole('heading', { name: 'Where to?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Where to?' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Take / })).toBeInTheDocument()
  })

  it('keeps the top bar reachable while the sheet is open', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    await screen.findByTestId('map')
    const edit = screen.getByRole('button', { name: 'Edit trip' })
    expect(edit.closest('[aria-hidden="true"]')).toBeNull()
    for (let i = 0; i < 12 && document.activeElement !== edit; i++) await userEvent.tab()
    expect(edit).toHaveFocus()
  })

  it('shows the sheet full while editing and back at half once the new plan arrives', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    await screen.findByTestId('map')
    const snap = () => document.querySelector('[data-snap]')?.getAttribute('data-snap')
    expect(snap()).toBe('0.5')
    await userEvent.click(screen.getByRole('button', { name: 'Show on map' }))
    expect(snap()).toBe('100px')
    await userEvent.click(screen.getByRole('button', { name: 'Edit trip' }))
    expect(snap()).toBe('1')
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    await screen.findByRole('heading', { name: /^Take / })
    expect(snap()).toBe('0.5')
  })

  it('keeps the old plan visible and busy while a saved trip loads again', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    await screen.findByTestId('map')
    vi.mocked(planApi.getSample).mockReturnValue(new Promise(() => {}))
    await userEvent.click(screen.getByRole('button', { name: 'Edit trip' }))
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    expect(screen.getByRole('heading', { name: /^Take / }).closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('shows an error and keeps the saved trips when planning fails', async () => {
    vi.mocked(planApi.getSample).mockRejectedValue(new Error('Server is down.'))
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Could not plan this trip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: savedName })).toBeEnabled()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })
})

describe('PlannerScreen on desktop', () => {
  beforeEach(() => mockViewport(true))

  it('shows the map next to the form from the start', async () => {
    renderScreen()
    expect(screen.getByRole('heading', { name: 'Where to?' })).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toBeInTheDocument()
  })

  it('shows the verdict and routes in the panel without a Show on map button', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: savedName }))
    expect(await screen.findByRole('heading', { name: /^Take / })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other routes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show on map' })).not.toBeInTheDocument()
  })
})

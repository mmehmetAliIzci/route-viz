import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TripInput } from '../api/planApi'
import { TripForm } from './TripForm'

const trip: TripInput = {
  origin: { label: 'Dallas, TX', lat: 32.78, lon: -96.8 },
  destination: { label: 'Denver, CO', lat: 39.74, lon: -104.99 },
  departure_utc: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  load_lb: 38_000,
  spacing_mi: 25,
}

function renderForm(initial: TripInput | null = null) {
  const onSubmit = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TripForm initial={initial} isPlanning={false} spacingMi={25} onSubmit={onSubmit} />
    </QueryClientProvider>,
  )
  return onSubmit
}

const submitName = 'Check the weather on my route'

describe('TripForm', () => {
  it('does not submit until both places are picked from suggestions', async () => {
    const onSubmit = renderForm()
    await userEvent.click(screen.getByRole('button', { name: submitName }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a city from the list.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('offers Now, In 1 hour and Pick time for leaving, with In 1 hour checked', async () => {
    renderForm()
    const group = screen.getByRole('radiogroup', { name: 'Leaving' })
    const names = Array.from(group.querySelectorAll('[role=radio]')).map((o) => o.textContent)
    expect(names).toEqual(['Now', 'In 1 hour', 'Pick time'])
    expect(screen.getByRole('radio', { name: 'In 1 hour' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('Departure (your local time)')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Pick time' }))
    expect(screen.getByLabelText('Departure (your local time)')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Pick time' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'In 1 hour' })).toHaveAttribute('aria-checked', 'false')
  })

  it('offers Empty, the current load and Heavy, and submits their weights', async () => {
    const onSubmit = renderForm(trip)
    const group = screen.getByRole('radiogroup', { name: 'Load' })
    expect(Array.from(group.querySelectorAll('[role=radio]')).map((o) => o.getAttribute('aria-label') ?? o.textContent)).toEqual([
      'Empty',
      '38,000 lb',
      'Heavy',
    ])
    await userEvent.click(screen.getByRole('radio', { name: 'Empty' }))
    await userEvent.click(screen.getByRole('button', { name: submitName }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ load_lb: 0 }))
    await userEvent.click(screen.getByRole('radio', { name: 'Heavy' }))
    await userEvent.click(screen.getByRole('button', { name: submitName }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ load_lb: 60_000 }))
  })

  it('reveals the load number input from the middle chip', async () => {
    renderForm(trip)
    expect(screen.queryByLabelText('Load (lb)')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '38,000 lb' }))
    expect(screen.getByLabelText('Load (lb)')).toHaveValue(38_000)
  })

  it('swaps from and to', async () => {
    renderForm(trip)
    await userEvent.click(screen.getByRole('button', { name: 'Swap from and to' }))
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveTextContent('Denver, CO')
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveTextContent('Dallas, TX')
  })

  it('labels the place pickers', () => {
    renderForm()
    expect(screen.getByRole('combobox', { name: 'From' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'To' })).toBeInTheDocument()
  })

  describe('departure and load values', () => {
    afterEach(() => vi.useRealTimers())

    function setup(now: string, initial: TripInput | null = trip) {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) })
      return { user: userEvent.setup(), onSubmit: renderForm(initial) }
    }

    function submitted(onSubmit: ReturnType<typeof vi.fn>): TripInput {
      return onSubmit.mock.calls.at(-1)![0]
    }

    it('Now submits the current minute with seconds zeroed', async () => {
      const { user, onSubmit } = setup('2026-10-15T10:20:45Z')
      await user.click(screen.getByRole('radio', { name: 'Now' }))
      await user.click(screen.getByRole('button', { name: submitName }))
      expect(submitted(onSubmit).departure_utc).toBe('2026-10-15T10:20:00.000Z')
    })

    it('In 1 hour submits now plus 60 minutes, across midnight too', async () => {
      const first = setup('2026-10-15T10:20:45Z')
      await first.user.click(screen.getByRole('radio', { name: 'In 1 hour' }))
      await first.user.click(screen.getByRole('button', { name: submitName }))
      expect(submitted(first.onSubmit).departure_utc).toBe('2026-10-15T11:20:00.000Z')
      cleanup()
      vi.useRealTimers()

      const second = setup('2026-10-15T23:40:10Z')
      await second.user.click(screen.getByRole('radio', { name: 'In 1 hour' }))
      await second.user.click(screen.getByRole('button', { name: submitName }))
      expect(submitted(second.onSubmit).departure_utc).toBe('2026-10-16T00:40:00.000Z')
    })

    it('Pick time submits the typed value', async () => {
      const { user, onSubmit } = setup('2026-10-15T10:00:00Z')
      await user.click(screen.getByRole('radio', { name: 'Pick time' }))
      fireEvent.change(screen.getByLabelText('Departure (your local time)'), { target: { value: '2026-10-16T09:00' } })
      await user.click(screen.getByRole('button', { name: submitName }))
      expect(submitted(onSubmit).departure_utc).toBe(new Date('2026-10-16T09:00').toISOString())
    })

    it('submits a custom load typed via the middle chip', async () => {
      const { user, onSubmit } = setup('2026-10-15T10:00:00Z')
      await user.click(screen.getByRole('radio', { name: '38,000 lb' }))
      fireEvent.change(screen.getByLabelText('Load (lb)'), { target: { value: '45000' } })
      await user.click(screen.getByRole('button', { name: submitName }))
      expect(submitted(onSubmit).load_lb).toBe(45_000)
    })

    it('rejects a load over 80,000 lb', async () => {
      const { user, onSubmit } = setup('2026-10-15T10:00:00Z')
      await user.click(screen.getByRole('radio', { name: '38,000 lb' }))
      fireEvent.change(screen.getByLabelText('Load (lb)'), { target: { value: '90000' } })
      await user.click(screen.getByRole('button', { name: submitName }))
      expect(screen.getByRole('alert')).toHaveTextContent('Load must be 0 to 80,000 lb.')
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })
})

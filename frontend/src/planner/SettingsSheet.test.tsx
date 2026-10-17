import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsSheet } from './SettingsSheet'
import { saveThemeChoice } from '../theme/theme'

vi.mock('../theme/theme', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../theme/theme')>()),
  saveThemeChoice: vi.fn(),
}))

describe('SettingsSheet', () => {
  afterEach(() => document.documentElement.classList.remove('dark'))

  it('saves and applies Dark', async () => {
    render(<SettingsSheet spacingMi={25} onSpacingChange={vi.fn()} demo={[]} onDemoChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(saveThemeChoice).toHaveBeenCalledWith('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('reports the demo storms as a set in a fixed order, and locks them while a plan loads', async () => {
    const onDemoChange = vi.fn()
    const { rerender } = render(<SettingsSheet spacingMi={25} onSpacingChange={vi.fn()} demo={['rain']} onDemoChange={onDemoChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const group = screen.getByRole('group', { name: 'Demo weather' })
    expect(within(group).getByRole('button', { name: 'Rain' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(group).getByRole('button', { name: 'Wind' }))
    expect(onDemoChange).toHaveBeenCalledWith(['wind', 'rain']) // wind before rain, whatever the click order
    rerender(<SettingsSheet spacingMi={25} onSpacingChange={vi.fn()} demo={['wind', 'rain']} onDemoChange={onDemoChange} demoDisabled />)
    expect(within(group).getByRole('button', { name: 'Snow' })).toBeDisabled()
  })

  it('reports the chosen spacing', async () => {
    const onSpacingChange = vi.fn()
    render(<SettingsSheet spacingMi={25} onSpacingChange={onSpacingChange} demo={[]} onDemoChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('radio', { name: '25 miles' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: '10 miles' }))
    expect(onSpacingChange).toHaveBeenCalledWith(10)
  })
})

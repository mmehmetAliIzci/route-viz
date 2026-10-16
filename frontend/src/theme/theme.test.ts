import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readThemeChoice, saveThemeChoice, startTheme } from './theme'

type Listener = (event: { matches: boolean }) => void

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }
  vi.stubGlobal('matchMedia', () => mql)
  return {
    listeners,
    fire(matches: boolean) {
      mql.matches = matches
      listeners.forEach((l) => l({ matches }))
    },
  }
}

describe('theme', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('applyTheme toggles the dark class', () => {
    mockMatchMedia(false)
    applyTheme('night')
    expect(document.documentElement).toHaveClass('dark')
    applyTheme('day')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('auto follows matchMedia changes without restarting', () => {
    const media = mockMatchMedia(false)
    const stop = startTheme()
    expect(document.documentElement).not.toHaveClass('dark')
    media.fire(true)
    expect(document.documentElement).toHaveClass('dark')
    media.fire(false)
    expect(document.documentElement).not.toHaveClass('dark')
    stop()
    expect(media.listeners.size).toBe(0)
  })

  it('ignores system changes when the choice is fixed', () => {
    const media = mockMatchMedia(false)
    saveThemeChoice('day')
    startTheme()
    media.fire(true)
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('round-trips the saved choice', () => {
    expect(readThemeChoice()).toBe('auto')
    saveThemeChoice('night')
    expect(readThemeChoice()).toBe('night')
  })

  it('falls back to auto when storage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readThemeChoice()).toBe('auto')
  })

  it('does not throw when storage throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveThemeChoice('night')).not.toThrow()
  })
})

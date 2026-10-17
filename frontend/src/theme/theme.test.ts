import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { applyTheme, readThemeChoice, saveThemeChoice, startTheme, useResolvedTheme } from './theme'

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
    applyTheme('dark')
    expect(document.documentElement).toHaveClass('dark')
    applyTheme('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('system follows matchMedia changes without restarting', () => {
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
    saveThemeChoice('light')
    startTheme()
    media.fire(true)
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('round-trips the saved choice', () => {
    expect(readThemeChoice()).toBe('system')
    saveThemeChoice('dark')
    expect(readThemeChoice()).toBe('dark')
  })

  it('reads the names earlier builds stored', () => {
    localStorage.setItem('spotter.theme', 'night')
    expect(readThemeChoice()).toBe('dark')
    localStorage.setItem('spotter.theme', 'day')
    expect(readThemeChoice()).toBe('light')
    localStorage.setItem('spotter.theme', 'auto')
    expect(readThemeChoice()).toBe('system')
  })

  it('useResolvedTheme follows applyTheme', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('light')
    act(() => applyTheme('dark'))
    expect(result.current).toBe('dark')
    act(() => applyTheme('system'))
    expect(result.current).toBe('light')
  })

  it('falls back to auto when storage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readThemeChoice()).toBe('system')
  })

  it('does not throw when storage throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveThemeChoice('dark')).not.toThrow()
  })
})

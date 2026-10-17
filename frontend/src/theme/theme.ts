import { useSyncExternalStore } from 'react'

// The theme choice: follow the operating system, or force light or dark.
export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'spotter.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
// Earlier builds stored these names; read them as their new equivalents.
const LEGACY: Record<string, ThemeChoice> = { auto: 'system', day: 'light', night: 'dark' }

const listeners = new Set<() => void>()

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'system' || value === 'light' || value === 'dark') return value
    if (value && LEGACY[value]) return LEGACY[value]
  } catch {
    // Storage can be blocked; fall back to following the system.
  }
  return 'system'
}

export function saveThemeChoice(c: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, c)
  } catch {
    // Not persisting is fine; the choice still applies for this session.
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(c: ThemeChoice): ResolvedTheme {
  return c === 'dark' || (c === 'system' && systemPrefersDark()) ? 'dark' : 'light'
}

// The theme the page is showing right now, read from the <html> class the app sets.
export function currentTheme(): ResolvedTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(c: ThemeChoice): void {
  const next = resolveTheme(c)
  const changed = next !== currentTheme()
  document.documentElement.classList.toggle('dark', next === 'dark')
  if (changed) listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The resolved theme for components that render outside CSS, such as the map's basemap.
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light')
}

export function startTheme(): () => void {
  applyTheme(readThemeChoice())
  const media = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    // Re-read so a choice changed after startup is respected.
    if (readThemeChoice() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

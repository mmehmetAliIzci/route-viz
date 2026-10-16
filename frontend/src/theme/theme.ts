export type ThemeChoice = 'auto' | 'day' | 'night'

const STORAGE_KEY = 'spotter.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'day' || value === 'night' || value === 'auto') return value
  } catch {
    // Storage can be blocked; fall back to following the system.
  }
  return 'auto'
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

export function applyTheme(c: ThemeChoice): void {
  const dark = c === 'night' || (c === 'auto' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function startTheme(): () => void {
  applyTheme(readThemeChoice())
  const media = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    // Re-read so a choice changed after startup is respected.
    if (readThemeChoice() === 'auto') applyTheme('auto')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

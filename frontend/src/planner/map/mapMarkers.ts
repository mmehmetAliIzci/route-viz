import type { CheckpointView } from '../model/planView'
import type { RouteLabel } from './routeLayers'

// DOM builders for the HTML markers on the map. Pure DOM, no React; styled with Tailwind classes.

const PILL = 'rounded-full border border-border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shadow-md'
// Hung off the right edge of a marker whose element is only the size of its glyph.
const BESIDE = 'pointer-events-none absolute top-1/2 left-full ml-1 -translate-y-1/2'

const PILL_TONE: Record<RouteLabel['tone'], string> = {
  recommended: 'bg-primary text-primary-foreground',
  later: 'bg-card text-[#A3123F] dark:text-[#FF6B8A]',
  sooner: 'bg-card text-accent-ink',
  same: 'bg-card text-muted-foreground',
}

// A tappable pill on a route: "Recommended", or how much later it arrives.
export function routePill(label: RouteLabel, onClick: () => void): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label.text
  el.setAttribute('aria-pressed', String(label.selected))
  el.className = [
    'cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shadow-md',
    PILL_TONE[label.tone],
    label.selected ? 'border-transparent ring-2 ring-accent-ink' : 'border-border',
  ].join(' ')
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return el
}

// "Severe rain · Fri, 10:00 PM CDT", with a dot in the level's colour. Not clickable.
export function hazardLabel(checkpoint: CheckpointView): HTMLElement {
  const { level, causeLabel, etaShort } = checkpoint
  const el = document.createElement('div')
  el.className = `pointer-events-none flex items-center gap-1.5 bg-card ${PILL}`
  const dot = document.createElement('span')
  dot.className = 'size-2.5 shrink-0 rounded-full'
  dot.style.backgroundColor = level.fill // the colour comes from the level, so it cannot be a class
  const text = document.createElement('span')
  text.textContent = `${level.label}${causeLabel ? ` ${causeLabel.toLowerCase()}` : ''} · ${etaShort}`
  el.append(dot, text)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

// A map pin in the primary colour with a white dot, and the place name to its right. The element is
// the pin alone, so anchoring it at the bottom puts the pin's tip on the point.
export function destinationPin(label: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pointer-events-none size-6'
  const svg = svgEl('svg', { width: '24', height: '24', viewBox: '0 0 24 24', 'aria-hidden': 'true' })
  svg.setAttribute('class', 'fill-primary drop-shadow-md')
  svg.append(
    svgEl('path', {
      d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
    }),
    svgEl('circle', { cx: '12', cy: '10', r: '3', fill: '#FFFFFF' }),
  )
  el.append(svg, placeName(label))
  return el
}

// A white ring with a primary-colour border, and a "Start" pill to its right.
export function originRing(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pointer-events-none size-3.5 rounded-full border-[3px] border-primary bg-white shadow-md'
  el.append(placeName('Start'))
  return el
}

function placeName(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = `${BESIDE} bg-card ${PILL}`
  el.textContent = text
  return el
}

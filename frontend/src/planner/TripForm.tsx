import { ArrowUpDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Place, TripInput } from '../api/planApi'
import { PlaceField } from './PlaceField'
import type { Spacing } from './SettingsSheet'

type Props = {
  initial: TripInput | null
  isPlanning: boolean
  spacingMi: Spacing
  onSubmit: (trip: TripInput) => void
}

type Leaving = 'now' | 'hour' | 'pick'
type LoadChoice = 'empty' | 'custom' | 'heavy'

const EMPTY_LB = 0
const HEAVY_LB = 60_000
const DEFAULT_LB = 38_000

const sectionLabel = 'text-[15px] font-medium tracking-wide text-muted-foreground uppercase'
const chip = 'h-14 min-w-0 flex-1 flex-col gap-0 px-2 text-base leading-tight'

// Owns the trip inputs. Departure is entered in the browser's local time and sent as UTC.
export function TripForm({ initial, isPlanning, spacingMi, onSubmit }: Props) {
  const [origin, setOrigin] = useState<Place | null>(initial?.origin ?? null)
  const [destination, setDestination] = useState<Place | null>(initial?.destination ?? null)
  const [leaving, setLeaving] = useState<Leaving>(initial ? 'pick' : 'hour')
  const [departure, setDeparture] = useState(() =>
    initial ? toLocalInput(new Date(initial.departure_utc)) : nextHourLocal(),
  )
  const [loadChoice, setLoadChoice] = useState<LoadChoice>(() => loadChoiceFor(initial?.load_lb))
  const [customLb, setCustomLb] = useState(
    initial && initial.load_lb !== EMPTY_LB && initial.load_lb !== HEAVY_LB ? initial.load_lb : DEFAULT_LB,
  )
  const [showLoadInput, setShowLoadInput] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const loadLb = loadChoice === 'empty' ? EMPTY_LB : loadChoice === 'heavy' ? HEAVY_LB : customLb

  function departureLocal(): string {
    if (leaving === 'pick') return departure
    const d = new Date()
    if (leaving === 'hour') d.setMinutes(d.getMinutes() + 60)
    d.setSeconds(0, 0)
    return toLocalInput(d)
  }

  function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault()
    const issue = validate()
    setProblem(issue)
    if (issue || !origin || !destination) return
    onSubmit({
      origin,
      destination,
      departure_utc: new Date(departureLocal()).toISOString(),
      load_lb: loadLb,
      spacing_mi: spacingMi,
    })
  }

  function validate(): string | null {
    if (!origin || !destination) return 'Pick a city from the list.'
    const when = new Date(departureLocal()).getTime()
    if (Number.isNaN(when)) return 'Enter a departure time.'
    if (when < Date.now() - 60 * 60 * 1000 || when > Date.now() + 48 * 60 * 60 * 1000)
      return 'Departure must be within the next 48 hours.'
    if (!Number.isInteger(loadLb) || loadLb < 0 || loadLb > 80_000) return 'Load must be 0 to 80,000 lb.'
    return null
  }

  function swapPlaces() {
    setOrigin(destination)
    setDestination(origin)
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit} noValidate>
      <h2 className="font-display text-3xl leading-none font-semibold">Where to?</h2>
      <div className="relative overflow-hidden rounded-xl border bg-card">
        <PlaceField id="trip-origin" label="From" value={origin} onChange={setOrigin} variant="row" />
        <div className="border-t">
          <PlaceField id="trip-destination" label="To" value={destination} onChange={setDestination} variant="row" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute top-1/2 right-2 size-12 -translate-y-1/2 rounded-full bg-card"
          aria-label="Swap from and to"
          onClick={swapPlaces}
        >
          <ArrowUpDown className="size-6" />
        </Button>
      </div>

      <div className="grid gap-2">
        <Label id="trip-leaving-label" className={sectionLabel}>
          Leaving
        </Label>
        <ToggleGroup
          type="single"
          variant="outline"
          role="radiogroup"
          aria-labelledby="trip-leaving-label"
          className="w-full"
          value={leaving}
          onValueChange={(v) => {
            if (v === 'now' || v === 'hour' || v === 'pick') setLeaving(v)
          }}
        >
          <ToggleGroupItem value="now" className={chip}>
            Now
          </ToggleGroupItem>
          <ToggleGroupItem value="hour" className={chip}>
            In 1 hour
          </ToggleGroupItem>
          <ToggleGroupItem value="pick" className={chip}>
            Pick time
          </ToggleGroupItem>
        </ToggleGroup>
        {leaving === 'pick' && (
          <div className="grid gap-1.5">
            <Label htmlFor="trip-departure" className="text-sm">
              Departure (your local time)
            </Label>
            <Input
              id="trip-departure"
              type="datetime-local"
              className="h-14 text-base"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Label id="trip-load-label" className={sectionLabel}>
          Load
        </Label>
        <ToggleGroup
          type="single"
          variant="outline"
          role="radiogroup"
          aria-labelledby="trip-load-label"
          className="w-full"
          value={loadChoice}
          onValueChange={(v) => {
            if (v === 'empty' || v === 'custom' || v === 'heavy') setLoadChoice(v)
          }}
        >
          <ToggleGroupItem value="empty" className={chip} aria-label="Empty">
            <span>Empty</span>
            <span className="text-sm font-normal text-muted-foreground group-data-[state=on]/toggle:text-background/80" aria-hidden>
              wind risk up
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="custom"
            className={chip}
            aria-label={formatLoad(customLb)}
            onClick={() => setShowLoadInput(true)}
          >
            {formatLoad(customLb)}
          </ToggleGroupItem>
          <ToggleGroupItem value="heavy" className={chip} aria-label="Heavy">
            <span>Heavy</span>
            <span className="text-sm font-normal text-muted-foreground group-data-[state=on]/toggle:text-background/80" aria-hidden>
              60,000 lb
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
        {showLoadInput && loadChoice === 'custom' && (
          <div className="grid gap-1.5">
            <Label htmlFor="trip-load" className="text-sm">
              Load (lb)
            </Label>
            <Input
              id="trip-load"
              type="number"
              inputMode="numeric"
              className="h-14 text-base"
              min={0}
              max={80_000}
              step={1000}
              value={Number.isNaN(customLb) ? '' : customLb}
              onChange={(e) => setCustomLb(e.target.valueAsNumber)}
            />
          </div>
        )}
      </div>

      {problem && (
        <p className="text-sm text-destructive" role="alert">
          {problem}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 grid gap-1.5 bg-background/95 px-4 pt-2 pb-2 md:static md:mx-0 md:bg-transparent md:p-0">
        <Button
          type="submit"
          size="lg"
          className="h-16 bg-action text-lg font-semibold text-action-foreground hover:bg-action/90"
          disabled={isPlanning}
        >
          {isPlanning && <Loader2 className="animate-spin" />}
          {isPlanning ? 'Planning routes…' : 'Check the weather on my route'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">Compares up to 3 truck routes</p>
      </div>
    </form>
  )
}

function loadChoiceFor(loadLb: number | undefined): LoadChoice {
  if (loadLb === EMPTY_LB) return 'empty'
  if (loadLb === HEAVY_LB) return 'heavy'
  return 'custom'
}

function formatLoad(lb: number): string {
  return Number.isNaN(lb) ? 'Set load' : `${lb.toLocaleString('en-US')} lb`
}

function nextHourLocal(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return toLocalInput(d)
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

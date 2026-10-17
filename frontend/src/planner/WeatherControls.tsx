import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DemoScenario } from '../api/planApi'
import { HEATMAP_KINDS, LEGENDS, type HeatmapKind } from './model/heatmap'
import { hourLabel, type PlanView } from './model/planView'
import { useMediaQuery } from './useMediaQuery'

export type LayerChoice = HeatmapKind | 'off'
export type DemoChoice = DemoScenario | 'off'

type Props = {
  plan: PlanView
  hours: number
  hour: number
  onHourChange: (hour: number) => void
  layer: LayerChoice
  onLayerChange: (layer: LayerChoice) => void
  demo: DemoChoice
  onDemoChange: (demo: DemoChoice) => void
  disabled: boolean // a new plan is loading; the demo choice would race it
}

const LAYER_LABELS: Record<LayerChoice, string> = { off: 'Off', risk: 'Risk', wind: 'Wind', rain: 'Rain', snow: 'Snow' }
const CHOICES: LayerChoice[] = [...HEATMAP_KINDS, 'off']
const DEMO_LABELS: Record<DemoChoice, string> = { off: 'Off', wind: 'Wind', rain: 'Rain', snow: 'Snow' }
const DEMO_CHOICES: DemoChoice[] = ['off', 'wind', 'rain', 'snow']
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const PLAY_HOURS_PER_SECOND = 4 // forecast hours per real second
const MAX_FRAME_STEP_H = 0.25 // a long frame (tab in the background) must not jump the heatmap
const REDUCED_STEP_MS = 500 // reduced motion: one whole forecast hour per step

// Heatmap layer picker, demo weather switch, legend and the 0-48 h slider, floating over the map.
export function WeatherControls({ plan, hours, hour, onHourChange, layer, onLayerChange, demo, onDemoChange, disabled }: Props) {
  const legend = layer === 'off' ? null : LEGENDS[layer]
  const label = hourLabel(plan, hour)
  const playback = useForecastPlayback({ plan, hours, hour, onHourChange, disabled })
  return (
    <Card className="absolute inset-x-2 top-[72px] z-10 gap-2 p-3 shadow-lg md:inset-x-auto md:top-auto md:bottom-8 md:left-3 md:w-[400px]">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Map weather layer"
        className="w-full"
        value={layer}
        onValueChange={(v) => onLayerChange(CHOICES.find((c) => c === v) ?? layer)}
      >
        {CHOICES.map((choice) => (
          <ToggleGroupItem key={choice} value={choice} className="flex-1">
            {LAYER_LABELS[choice]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground" aria-hidden>
          Demo weather
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Demo weather"
          className="flex-1"
          value={demo}
          disabled={disabled}
          onValueChange={(v) => onDemoChange(DEMO_CHOICES.find((c) => c === v) ?? demo)}
        >
          {DEMO_CHOICES.map((choice) => (
            <ToggleGroupItem key={choice} value={choice} className="flex-1">
              {DEMO_LABELS[choice]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {plan.demo && <p className="text-[11px] text-muted-foreground">Demo weather: synthetic storm, not a forecast.</p>}
      {legend && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 text-[11px] text-muted-foreground">
          <span className="row-span-2 font-medium">{legend.label}</span>
          <span
            className="h-2 rounded-full"
            aria-hidden
            style={{
              background: `linear-gradient(to right, ${legend.stops
                .map((s) => `rgba(${s.color[0]}, ${s.color[1]}, ${s.color[2]}, ${Math.max(s.color[3], 40) / 255})`)
                .join(', ')})`,
            }}
          />
          <span className="flex justify-between">
            {legend.ticks.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </span>
        </div>
      )}
      <div className="grid gap-2">
        <p className="text-sm">
          <span className="text-muted-foreground">Map forecast:</span> <span className="font-medium">{label}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            className="shrink-0"
            aria-label={playback.playing ? 'Pause forecast' : 'Play forecast'}
            aria-pressed={playback.playing}
            disabled={disabled}
            onClick={playback.toggle}
          >
            {playback.playing ? <Pause /> : <Play />}
          </Button>
          <Slider
            min={0}
            max={hours - 1}
            step={0.1}
            value={[hour]}
            onValueChange={([v]) => {
              if (v === undefined) return
              playback.pause()
              onHourChange(v)
            }}
            aria-label="Forecast hour"
            aria-valuetext={label}
            className="min-w-0 flex-1 py-2"
          />
        </div>
      </div>
      <p className="hidden text-[11px] text-muted-foreground md:block">
        Dots on the route show the weather when the truck passes.
      </p>
    </Card>
  )
}

type PlaybackInput = Pick<Props, 'plan' | 'hours' | 'hour' | 'onHourChange' | 'disabled'>

// Sweeps the forecast hour from where it is to the last hour; the parent keeps owning the hour.
//   - animated: one requestAnimationFrame loop, PLAY_HOURS_PER_SECOND forecast hours per real second
//   - reduced motion: a whole hour every REDUCED_STEP_MS
// The loop reads the hour and the callback through refs, so it does not restart on every frame.
// A new plan, a new hour count, or `disabled` stops it; so does unmount.
function useForecastPlayback({ plan, hours, hour, onHourChange, disabled }: PlaybackInput) {
  const [playing, setPlaying] = useState(false)
  const reducedMotion = useMediaQuery(REDUCED_MOTION)
  const hourRef = useRef(hour)
  const onHourChangeRef = useRef(onHourChange)
  useEffect(() => {
    hourRef.current = hour
  }, [hour])
  useEffect(() => {
    onHourChangeRef.current = onHourChange
  })

  // A new plan, a new hour count or a lock ends playback; adjusted while rendering, not in an effect.
  const [scope, setScope] = useState({ plan, hours, disabled })
  if (scope.plan !== plan || scope.hours !== hours || scope.disabled !== disabled) {
    setScope({ plan, hours, disabled })
    setPlaying(false)
  }

  useEffect(() => {
    if (!playing) return
    const last = hours - 1
    const move = (next: number) => {
      const to = Math.min(next, last)
      hourRef.current = to // the next step starts here even before the parent re-renders
      onHourChangeRef.current(to)
      if (to < last) return true
      setPlaying(false)
      return false
    }
    if (reducedMotion) {
      const timer = setInterval(() => {
        if (!move(Math.floor(hourRef.current) + 1)) clearInterval(timer)
      }, REDUCED_STEP_MS)
      return () => clearInterval(timer)
    }
    let previous: number | null = null
    let frame = requestAnimationFrame(function tick(now) {
      const step = previous === null ? 0 : Math.min(((now - previous) / 1000) * PLAY_HOURS_PER_SECOND, MAX_FRAME_STEP_H)
      previous = now
      if (move(hourRef.current + step)) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, reducedMotion, plan, hours])

  const toggle = () => {
    if (!playing && hourRef.current >= hours - 1) {
      hourRef.current = 0
      onHourChangeRef.current(0)
    }
    setPlaying(!playing)
  }
  return { playing, toggle, pause: () => setPlaying(false) }
}

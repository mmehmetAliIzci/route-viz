import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { hourLabel, type PlanView } from './model/planView'
import { dayTicks } from './model/timeline'
import { useMediaQuery } from './useMediaQuery'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const PLAY_HOURS_PER_SECOND = 4 // forecast hours per real second
const MAX_FRAME_STEP_H = 0.25 // a long frame (tab in the background) must not jump the heatmap
const REDUCED_STEP_MS = 500 // reduced motion: one whole forecast hour per step

export type TimeControlProps = {
  plan: PlanView
  hours: number // forecast hours available, 0 to hours - 1
  hour: number // may be fractional while the slider moves or plays
  onHourChange: (hour: number) => void
  disabled: boolean // a new plan is loading
}

// The forecast hour: its label, a play button that sweeps to the last hour, and the slider with
// a tick at each midnight. Both layouts use it.
export function TimeControl({ plan, hours, hour, onHourChange, disabled }: TimeControlProps) {
  const playback = useForecastPlayback({ plan, hours, hour, onHourChange, disabled })
  const label = hourLabel(plan, hour)
  const ticks = dayTicks(plan, hours)
  return (
    <div className="grid gap-1">
      <p className="text-sm">
        <span className="text-muted-foreground">Map forecast:</span> <span className="font-medium">{label}</span>
      </p>
      {plan.demo && <p className="text-[11px] text-muted-foreground">Demo weather: synthetic storm, not a forecast.</p>}
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
        <div className="min-w-0 flex-1">
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
            className="py-2"
          />
          {ticks.length > 0 && (
            <div className="relative h-3 text-[10px] text-muted-foreground" aria-hidden>
              {ticks.map((t) => (
                <span
                  key={t.hour}
                  className="absolute border-l border-muted-foreground/50 pl-1 leading-3"
                  style={{ left: `${(t.hour / (hours - 1)) * 100}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Sweeps the forecast hour from where it is to the last hour; the parent keeps owning the hour.
//   - animated: one requestAnimationFrame loop, PLAY_HOURS_PER_SECOND forecast hours per real second
//   - reduced motion: a whole hour every REDUCED_STEP_MS
// The loop reads the hour and the callback through refs, so it does not restart on every frame.
// A new plan, a new hour count, or `disabled` stops it; so does unmount.
export function useForecastPlayback({ plan, hours, hour, onHourChange, disabled }: TimeControlProps) {
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

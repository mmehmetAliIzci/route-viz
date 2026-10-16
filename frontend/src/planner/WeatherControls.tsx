import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { HEATMAP_KINDS, LEGENDS, type HeatmapKind } from './model/heatmap'
import { hourLabel, type PlanView } from './model/planView'

export type LayerChoice = HeatmapKind | 'off'

type Props = {
  plan: PlanView
  hours: number
  hour: number
  onHourChange: (hour: number) => void
  layer: LayerChoice
  onLayerChange: (layer: LayerChoice) => void
}

const LAYER_LABELS: Record<LayerChoice, string> = { off: 'Off', risk: 'Risk', wind: 'Wind', rain: 'Rain', snow: 'Snow' }
const CHOICES: LayerChoice[] = [...HEATMAP_KINDS, 'off']

// Heatmap layer picker, legend and the 0-48 h slider, floating over the map.
export function WeatherControls({ plan, hours, hour, onHourChange, layer, onLayerChange }: Props) {
  const legend = layer === 'off' ? null : LEGENDS[layer]
  const label = hourLabel(plan, hour)
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
        <Slider
          min={0}
          max={hours - 1}
          step={0.1}
          value={[hour]}
          onValueChange={([v]) => v !== undefined && onHourChange(v)}
          aria-label="Forecast hour"
          aria-valuetext={label}
          className="py-2"
        />
      </div>
      <p className="hidden text-[11px] text-muted-foreground md:block">
        Dots on the route show the weather when the truck passes.
      </p>
    </Card>
  )
}

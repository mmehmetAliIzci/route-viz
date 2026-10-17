import { CloudRain, EyeOff, Snowflake, TriangleAlert, Wind } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HEATMAP_KINDS, LEGENDS, type HeatmapKind } from './model/heatmap'

export type LayerChoice = HeatmapKind | 'off'

// The map layers a driver can pick, in display order, with the icon each picker uses.
export const LAYER_OPTIONS: { value: LayerChoice; label: string; icon: typeof Wind }[] = [
  { value: 'risk', label: 'Risk', icon: TriangleAlert },
  { value: 'wind', label: 'Wind', icon: Wind },
  { value: 'rain', label: 'Rain', icon: CloudRain },
  { value: 'snow', label: 'Snow', icon: Snowflake },
  { value: 'off', label: 'Off', icon: EyeOff },
]

export function isLayerChoice(value: string): value is LayerChoice {
  return value === 'off' || (HEATMAP_KINDS as readonly string[]).includes(value)
}

// The colour scale of the layer on the map; nothing when the layer is off.
export function LayerLegend({ layer, className }: { layer: LayerChoice; className?: string }) {
  if (layer === 'off') return null
  const legend = LEGENDS[layer]
  return (
    <div className={cn('grid grid-cols-[auto_1fr] items-center gap-x-2 text-[11px] text-muted-foreground', className)}>
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
  )
}

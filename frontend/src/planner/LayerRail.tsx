import { cn } from '@/lib/utils'
import { LAYER_OPTIONS, type LayerChoice } from './LayerLegend'

type Props = {
  layer: LayerChoice
  onLayerChange: (layer: LayerChoice) => void
  className?: string
}

// The phone's layer picker: a vertical rail of icon-and-word buttons floating over the map.
export function LayerRail({ layer, onLayerChange, className }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Map weather layer"
      className={cn('grid gap-0.5 rounded-2xl bg-card/95 p-1 shadow-md backdrop-blur', className)}
    >
      {LAYER_OPTIONS.map((option) => {
        const on = layer === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onLayerChange(option.value)}
            className={cn(
              'grid w-14 justify-items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium outline-none',
              'focus-visible:ring-3 focus-visible:ring-ring',
              on ? 'bg-primary text-primary-foreground' : 'text-card-foreground hover:bg-muted',
            )}
          >
            <option.icon className="size-5" aria-hidden />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

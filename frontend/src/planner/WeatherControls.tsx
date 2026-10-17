import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { isLayerChoice, LAYER_OPTIONS, LayerLegend, type LayerChoice } from './LayerLegend'
import type { PlanView } from './model/planView'
import { TimeControl } from './TimeControl'

export type { LayerChoice } from './LayerLegend'

// The weather controls' state, owned by the planner screen and shown by either layout.
export type WeatherControlsProps = {
  plan: PlanView
  hours: number
  hour: number
  onHourChange: (hour: number) => void
  layer: LayerChoice
  onLayerChange: (layer: LayerChoice) => void
  disabled: boolean // a new plan is loading
}

// Desktop: layer picker, legend and the forecast hour in one card floating over the map.
export function WeatherControls({ plan, hours, hour, onHourChange, layer, onLayerChange, disabled }: WeatherControlsProps) {
  return (
    <Card className="absolute bottom-8 left-3 z-10 w-[400px] gap-2 p-3 shadow-lg">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Map weather layer"
        className="w-full"
        value={layer}
        onValueChange={(v) => isLayerChoice(v) && onLayerChange(v)}
      >
        {LAYER_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <LayerLegend layer={layer} />
      <TimeControl plan={plan} hours={hours} hour={hour} onHourChange={onHourChange} disabled={disabled} />
      <p className="text-[11px] text-muted-foreground">Coloured stretches of the route show the weather when the truck passes.</p>
    </Card>
  )
}

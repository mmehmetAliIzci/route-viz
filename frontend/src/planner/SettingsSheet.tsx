import { Settings } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DemoScenario } from '../api/planApi'
import { applyTheme, readThemeChoice, saveThemeChoice, type ThemeChoice } from '../theme/theme'

const SPACINGS = [10, 25, 50] as const
export type Spacing = (typeof SPACINGS)[number]

export type DemoChoice = DemoScenario | 'off'
const DEMO_CHOICES: { value: DemoChoice; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'wind', label: 'Wind' },
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
]

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

type Props = {
  spacingMi: Spacing
  onSpacingChange: (spacing: Spacing) => void
  demo: DemoChoice
  onDemoChange: (demo: DemoChoice) => void
  demoDisabled?: boolean // a plan is loading; a new demo choice would race it
  triggerClassName?: string // lets a layout give the gear a background, e.g. over the map
}

const chipClass = 'h-14 flex-1 text-base'

// Settings that rarely change: how often to check the weather, demo weather, and the theme.
export function SettingsSheet({ spacingMi, onSpacingChange, demo, onDemoChange, demoDisabled = false, triggerClassName }: Props) {
  const [theme, setTheme] = useState<ThemeChoice>(readThemeChoice)

  function chooseTheme(value: string) {
    const next = THEMES.find((t) => t.value === value)?.value
    if (!next) return
    setTheme(next)
    saveThemeChoice(next)
    applyTheme(next)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-12', triggerClassName)} aria-label="Settings">
          <Settings className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Settings</SheetTitle>
          <SheetDescription>How often the planner checks the weather, demo weather, and its theme.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-4 pb-6">
          <div className="grid gap-2">
            <Label id="settings-spacing-label" className="text-[15px] text-muted-foreground uppercase">
              Check weather every
            </Label>
            <ToggleGroup
              type="single"
              variant="outline"
              role="radiogroup"
              aria-labelledby="settings-spacing-label"
              className="w-full"
              value={String(spacingMi)}
              onValueChange={(v) => {
                const next = SPACINGS.find((s) => String(s) === v)
                if (next) onSpacingChange(next)
              }}
            >
              {SPACINGS.map((s) => (
                <ToggleGroupItem key={s} value={String(s)} className={chipClass} aria-label={`${s} miles`}>
                  {s} mi
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid gap-2">
            <Label id="settings-demo-label" className="text-[15px] text-muted-foreground uppercase">
              Demo weather
            </Label>
            <ToggleGroup
              type="single"
              variant="outline"
              role="radiogroup"
              aria-labelledby="settings-demo-label"
              className="w-full"
              value={demo}
              disabled={demoDisabled}
              onValueChange={(v) => {
                const next = DEMO_CHOICES.find((c) => c.value === v)
                if (next) onDemoChange(next.value)
              }}
            >
              {DEMO_CHOICES.map((c) => (
                <ToggleGroupItem key={c.value} value={c.value} className={chipClass}>
                  {c.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-sm text-muted-foreground">
              A synthetic storm sweeping the corridor, so every risk level shows on any day. Not a forecast.
            </p>
          </div>
          <div className="grid gap-2">
            <Label id="settings-theme-label" className="text-[15px] text-muted-foreground uppercase">
              Theme
            </Label>
            <ToggleGroup
              type="single"
              variant="outline"
              role="radiogroup"
              aria-labelledby="settings-theme-label"
              className="w-full"
              value={theme}
              onValueChange={chooseTheme}
            >
              {THEMES.map((t) => (
                <ToggleGroupItem key={t.value} value={t.value} className={chipClass}>
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-sm text-muted-foreground">System follows your device. Saved on this device.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

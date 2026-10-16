import { Settings } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { applyTheme, readThemeChoice, saveThemeChoice, type ThemeChoice } from '../theme/theme'

const SPACINGS = [10, 25, 50] as const
export type Spacing = (typeof SPACINGS)[number]

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
]

type Props = {
  spacingMi: Spacing
  onSpacingChange: (spacing: Spacing) => void
  triggerClassName?: string // lets a layout give the gear a background, e.g. over the map
}

const chipClass = 'h-14 flex-1 text-base'

// Settings that rarely change: how often to check the weather, and day or night colors.
export function SettingsSheet({ spacingMi, onSpacingChange, triggerClassName }: Props) {
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
          <SheetDescription>How the planner checks weather and looks.</SheetDescription>
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
            <Label id="settings-theme-label" className="text-[15px] text-muted-foreground uppercase">
              Colors
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
            <p className="text-sm text-muted-foreground">Saved on this device.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

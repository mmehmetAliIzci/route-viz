import { Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type Props = {
  form: ReactNode
  savedTrips: ReactNode
  error: string | null
  settings?: ReactNode // given where the screen has no other place for settings; shows the app header
  onCancel?: () => void // given while editing a trip that already has a plan
}

// Plan a trip: the form, the saved trips and any planning error. Used for the first plan and for editing.
export function TripPanel({ form, savedTrips, error, settings, onCancel }: Props) {
  return (
    <div className="grid gap-4">
      {settings && (
        <header className="flex items-center gap-2">
          <Truck className="size-5" aria-hidden />
          <div className="min-w-0 flex-1">
            <h1 className="text-base leading-tight font-semibold">Truck weather routes</h1>
            <p className="text-sm text-muted-foreground">Three routes, weather at the time you pass</p>
          </div>
          {settings}
        </header>
      )}
      {onCancel && (
        <Button type="button" variant="outline" className="h-12 justify-self-start px-5 text-base" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {error && <PlanError message={error} />}
      {form}
      {savedTrips}
    </div>
  )
}

export function PlanError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Could not plan this trip</AlertTitle>
      <AlertDescription>{message} A saved trip still shows how the app works.</AlertDescription>
    </Alert>
  )
}

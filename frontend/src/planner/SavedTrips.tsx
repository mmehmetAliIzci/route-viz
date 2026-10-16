import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listSamples } from '../api/planApi'

type Props = {
  disabled: boolean
  onOpen: (sampleId: string) => void
}

// Recorded trips that open instantly, without calling TomTom or Open-Meteo.
export function SavedTrips({ disabled, onOpen }: Props) {
  const samples = useQuery({ queryKey: ['samples'], queryFn: ({ signal }) => listSamples(signal), staleTime: Infinity })
  if (!samples.data?.length) return null
  return (
    <div className="grid gap-2">
      <p className="text-[15px] font-medium tracking-wide text-muted-foreground uppercase">Saved trips</p>
      <ul className="grid gap-2">
        {samples.data.map((s) => (
          <li key={s.id}>
            <Button
              variant="secondary"
              className="h-[60px] w-full justify-start gap-3 px-4 text-base"
              disabled={disabled}
              onClick={() => onOpen(s.id)}
            >
              <History className="size-5" />
              <span className="truncate">{s.label}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

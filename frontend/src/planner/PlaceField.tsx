import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { searchPlaces, type Place } from '../api/planApi'

const MIN_CHARS = 3
const DEBOUNCE_MS = 300

type Props = {
  id: string
  label: string
  value: Place | null
  onChange: (place: Place) => void
  // 'row' is a plain full-width row with a small label above the value, for stacking inside one card.
  variant?: 'field' | 'row'
}

// Combobox for a US place. The trip only accepts a place picked from the suggestions.
export function PlaceField({ id, label, value, onChange, variant = 'field' }: Props) {
  const row = variant === 'row'
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), DEBOUNCE_MS)

  const results = useQuery({
    queryKey: ['places', query.toLowerCase()],
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: open && query.length >= MIN_CHARS,
    staleTime: 30 * 60 * 1000,
  })

  return (
    <div className={row ? 'relative' : 'grid gap-1.5'}>
      <Label htmlFor={id} className={row ? 'pointer-events-none absolute top-2 left-4 z-10 text-sm text-muted-foreground' : undefined}>
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={
              row
                ? 'h-16 w-full justify-between rounded-none border-0 bg-transparent pt-5 pr-16 pl-4 text-base font-normal shadow-none focus-visible:ring-inset hover:bg-muted/50 dark:bg-transparent dark:hover:bg-muted/50'
                : 'h-11 w-full justify-between px-3 font-normal'
            }
          >
            <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>
              {value?.label ?? 'Search a US city or address'}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Type a city or address" value={text} onValueChange={setText} />
            <CommandList>
              <CommandEmpty>{emptyMessage(query, results.isFetching, results.isError)}</CommandEmpty>
              {results.data && results.data.length > 0 && (
                <CommandGroup>
                  {results.data.map((p) => (
                    <CommandItem
                      key={`${p.label}-${p.lat}-${p.lon}`}
                      value={`${p.label}-${p.lat}-${p.lon}`}
                      onSelect={() => {
                        onChange(p)
                        setOpen(false)
                      }}
                    >
                      <MapPin />
                      {p.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function emptyMessage(query: string, fetching: boolean, failed: boolean): string {
  if (query.length < MIN_CHARS) return `Type at least ${MIN_CHARS} letters.`
  if (fetching) return 'Searching…'
  if (failed) return 'Place search is unavailable right now.'
  return 'No US places found.'
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

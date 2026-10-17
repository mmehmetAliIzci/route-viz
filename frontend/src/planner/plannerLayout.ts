import type { ReactNode } from 'react'
import type { PlanView } from './model/planView'
import type { WeatherControlsProps } from './WeatherControls'

export type PlannerScreenState = 'idle' | 'planning' | 'ready' | 'error'

// How the map is oriented: north up, or rotated so the trip runs up the screen.
export type MapOrientation = { routeUp: boolean; toggle: () => void }

// Everything the phone and desktop layouts need. PlannerScreen owns all of it; the layouts only arrange it.
export type PlannerLayoutProps = {
  screen: PlannerScreenState
  view: PlanView | null // the last plan that arrived, kept on screen while a new one loads
  selectedId: number | null
  onSelectRoute: (routeId: number) => void
  replanning: boolean // a new plan is loading while `view` is still showing
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  map: ReactNode
  weather: WeatherControlsProps | null // null until a plan with a heatmap is on screen
  orientation: MapOrientation
  form: ReactNode
  savedTrips: ReactNode
  settings: ReactNode
  error: string | null
}

import { useEffect, useRef } from 'react'

const PLAN_STATE = { planner: 'plan' } as const

function onPlanEntry(): boolean {
  return (window.history.state as { planner?: string } | null)?.planner === 'plan'
}

// The browser's back button returns from a plan to the trip form. Showing a plan pushes one
// history entry; going back pops it and opens the form, going forward shows the plan again.
// `onNavigate(showingPlan)` tells the owner which side the history landed on.
export function usePlanHistory(showingPlan: boolean, onNavigate: (showingPlan: boolean) => void): { back: () => void } {
  const onNavigateRef = useRef(onNavigate)
  useEffect(() => {
    onNavigateRef.current = onNavigate
  })

  useEffect(() => {
    if (showingPlan && !onPlanEntry()) window.history.pushState(PLAN_STATE, '')
  }, [showingPlan])

  useEffect(() => {
    const onPop = () => onNavigateRef.current(onPlanEntry())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // What the Edit and back buttons call: the same as the browser's back button when the plan
  // entry is on top, so forward still works afterwards.
  return {
    back: () => {
      if (onPlanEntry()) window.history.back()
      else onNavigateRef.current(false)
    },
  }
}

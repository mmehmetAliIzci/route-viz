import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PlannerScreen } from './planner/PlannerScreen'
import { startTheme } from './theme/theme'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })
startTheme()
const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PlannerScreen />
    </QueryClientProvider>
  </StrictMode>,
)

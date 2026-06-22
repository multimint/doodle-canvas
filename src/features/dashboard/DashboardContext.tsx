import { createContext, useContext, type ReactNode } from 'react'
import type { DashboardViewProps } from './DashboardView'

// Single source for the dashboard's shared state. The Dashboard orchestrator owns the state and
// provides it here; the desktop/mobile chrome and every page read what they need via
// `useDashboard()` instead of threading a 16-field prop bag through two layers of components.
export interface DashboardContextValue extends DashboardViewProps {
  mobile: boolean
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({
  value,
  children,
}: {
  value: DashboardContextValue
  children: ReactNode
}) {
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within a DashboardProvider')
  return ctx
}

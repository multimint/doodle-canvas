import type { User } from 'firebase/auth'
import type { CanvasDoc } from '../../lib/types'

// The dashboard is a 4-page sidebar app. Each page renders its own in-page header.
export type NavKey = 'home' | 'documents' | 'planner' | 'shared'

// Everything the mobile and desktop Dashboard layouts need. The Dashboard orchestrator owns this
// state; the views and page components are purely presentational and derive their own filtered
// lists from `owned`/`shared` + `searchQuery`.
export interface DashboardViewProps {
  user: User
  uid: string
  userInitial: string
  userColor: string
  owned: CanvasDoc[]
  shared: CanvasDoc[]
  ownedSet: Set<string>
  loading: boolean
  creating: boolean
  searchQuery: string
  setSearchQuery: (v: string) => void
  totalOwned: number
  activeNav: NavKey
  setActiveNav: (k: NavKey) => void
  onSignOut: () => void
  onCreate: () => void
}

import type { User } from 'firebase/auth'
import type { CanvasDoc } from '../../lib/types'

export type NavKey = 'all' | 'shared'

export const HEADINGS: Record<NavKey, [string, string]> = {
  all: ['All canvases', 'Everything you and your team are working on'],
  shared: ['Shared with me', 'Canvases your collaborators invited you to'],
}

// Everything the mobile and desktop Dashboard layouts need. The Dashboard orchestrator
// owns this state; the views are purely presentational.
export interface DashboardViewProps {
  user: User
  uid: string
  userInitial: string
  userColor: string
  owned: CanvasDoc[]
  shared: CanvasDoc[]
  loading: boolean
  creating: boolean
  filteredCanvases: CanvasDoc[]
  ownedSet: Set<string>
  q: string
  activeNav: NavKey
  setActiveNav: (k: NavKey) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  totalOwned: number
  onSignOut: () => void
  onCreate: () => void
}

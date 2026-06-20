export type ToolType = 'pen' | 'brush' | 'marker' | 'eraser' | 'rect' | 'circle' | 'line' | 'text' | 'sticker' | 'hand' | 'select'

export interface UserDoc {
  email: string
  displayName: string
  photoURL: string
  canvasCount: number
}

export const STROKE_CAP = 2000

export interface CanvasDoc {
  id: string
  title: string
  ownerId: string
  members: string[]
  pendingInvites: string[]
  width: 1920
  height: 1080
  createdAt: number
  updatedAt: number
  snapshotStrokeIds?: string[]
  snapshotAt?: { toMillis(): number } | null
  deleteAt?: import('firebase/firestore').Timestamp
}

export interface StrokeData {
  points?: number[]
  x?: number
  y?: number
  width?: number
  height?: number
  radiusX?: number
  radiusY?: number
  text?: string
  fontSize?: number
  rotation?: number
  stickerId?: string
  stroke?: string
  strokeWidth?: number
  fill?: string
  globalCompositeOperation?: string
}

export interface Stroke {
  id: string
  type: 'path' | 'brush' | 'marker' | 'rect' | 'circle' | 'line' | 'text' | 'sticker' | 'eraser'
  authorId: string
  data: StrokeData
  timestamp: number
}

export interface CursorPos {
  x: number
  y: number
  color: string
  tool?: ToolType // the friend's active tool, so their cursor shows what they're holding
  strokeWidth?: number // their effective stroke size, to size the tool-footprint cursor
  marquee?: { x0: number; y0: number; x1: number; y1: number } // live rubber-band while friend is dragging a selection
  selectedIds?: string[] // IDs of text boxes the friend has multi-selected (2+)
}

// A friend's live focus on a Text Box: which box they have selected or are editing, and (while
// editing) the text they're currently typing, so others see the box outlined + the text update
// in real time.
export interface TextFocus {
  boxId: string
  editing: boolean
  color: string
  text?: string
}

export interface PresenceEntry {
  displayName: string
  photoURL: string
  color: string
  joinedAt: number
}

export const USER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

export function pickUserColor(uid: string): string {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash)
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

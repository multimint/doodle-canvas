// Shared UI-state shapes for the single active Text Box and the transient multi-select
// transform. Kept in one place so DrawingStage and its render sub-components agree.

// The single ACTIVE Text Box — the one box being created, selected, or edited.
//   id === null      -> creating a brand-new box (commit builds the stroke)
//   editing === true -> textarea open (Konva text for this id is hidden)
//   editing === false-> just selected (Konva text visible, handles shown)
// x/y/width/height are the UNROTATED top-left frame; rotation in degrees.
export interface ActiveBox {
  id: string | null
  editing: boolean
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fontSize: number
  color: string
  strokeWidth: number
  initial: string
}

// The single ACTIVE Sticker — the one being selected, dragged, or resized.
//   id === null -> just placed, waiting for Firebase to assign an id
export interface ActiveSticker {
  id: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

// Transient geometry while resizing a box in a MULTI-selection — overrides the box's
// stored geometry so it reflows live until the persisted stroke catches up.
export interface XformBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

// Shared canvas magic numbers, centralised so the selection overlays and the stage agree and a
// visual tweak lands in one place. Per-tool/per-kind values live on their registries (tools/,
// documents/); these are cross-cutting render constants with no natural home there.

// Selection chrome (BoxControls + MultiSelectOverlay)
export const HANDLE_SIZE = 11 // resize-handle size, constant screen px
export const ROTATE_GAP = 26 // rotate-knob gap above the top edge, screen px
export const SELECTION_ACCENT = '#3d5afe' // dashed border + handle stroke colour
export const SELECTION_Z = 5 // overlay stacking above the canvas + marker layers

// Highlighter translucency. Markers paint opaquely onto their own layer (so per-pixel the
// latest/topmost stroke wins and same-colour overlaps never darken), and the whole layer is then
// shown at this alpha — one flat, uniform translucency regardless of how strokes nest.
export const MARKER_LAYER_OPACITY = 0.82

// The pointer-capture lifecycle shared by the selection overlays' handle drags (BoxControls,
// MultiSelectOverlay): capture the pointer so move/up keep firing on the handle even as the cursor
// leaves it, stream each move as a world-space point, and clean the listeners up on release. The
// per-handle resize/rotate math and commit behaviour stay with each caller — only the plumbing is
// shared here.

export interface PointerDragHandlers {
  // Called on every pointermove with the cursor converted to world coordinates.
  onMove: (world: { x: number; y: number }) => void
  // Called once on pointerup, after the listeners are removed and the capture released.
  onEnd: () => void
}

export function beginPointerDrag(
  e: React.PointerEvent,
  toWorld: (clientX: number, clientY: number) => { x: number; y: number },
  handlers: PointerDragHandlers,
): void {
  e.preventDefault()
  e.stopPropagation()
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => handlers.onMove(toWorld(ev.clientX, ev.clientY))
  const up = (ev: PointerEvent) => {
    el.releasePointerCapture(ev.pointerId)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    handlers.onEnd()
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}

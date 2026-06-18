# ADR 0002: Text Boxes are mutable Strokes, edited in place

**Status:** Accepted

## Context

Until now every Stroke was immutable: a Member could create one or delete one, never change it. The `useStrokes` cache exploits this — it returns the same cached JS object for a Stroke ID across snapshots so react-konva's reconciler skips `setAttrs`, which is what keeps the per-frame wiggle node mutations from being reset.

The Text Box feature breaks that assumption. A Text Box must be **moved** (drag) and **re-edited** (change its text) after creation, and those changes must propagate to every Member in real time, exactly like the original strokes do.

Two ways to support "edit an existing Stroke":

1. **Delete-and-recreate** — on every move/edit, `remove` the old Stroke and `push` a new one.
2. **Update in place** — overwrite the existing Stroke's `data` at its existing RTDB key.

## Decision

Update Text Boxes **in place**.

- `useStrokes.updateStroke(id, patch)` does an RTDB `update` on `canvases/{id}/strokes/{strokeId}/data`. RTDB validation only requires the four top-level fields (`type`, `authorId`, `data`, `timestamp`) to exist, which a `data`-subpath write preserves — so no Security Rules change was needed.
- The `useStrokes` snapshot cache is made **selectively cache-busting**: for `type === 'text'` it compares the cached `data.x/y/width/text` against the incoming value and rebuilds the object only when they differ. All other Stroke types keep the reuse path, preserving the wiggle optimization. A client's own echoed write compares equal, so there is no render loop.
- Interactivity is gated behind **Select Mode** (no draw tool active): only there are Text Boxes draggable, double-click-to-edit, and Delete-key removable.

## Consequences

- A Text Box keeps its original RTDB key and `timestamp` across edits, so its z-order (draw order) is stable when moved or re-edited.
- The immutable-Stroke invariant is now "immutable except Text Boxes." Any future code that assumes a cached Stroke object never changes its `data` must account for this — the cache-busting is keyed specifically on `type === 'text'`.
- Moves and text edits are **not** in the Undo Stack; only create/delete is undoable. Reverting a move/edit means manually moving/editing back.
- A move is committed on drag-end (one write), not streamed; other Members see the box jump to its new position rather than glide. Consistent with how non-`brush` strokes already render statically.
- Delete-and-recreate was rejected because it would churn RTDB keys (breaking z-order and any future per-Stroke references) and produce two events per edit instead of one.

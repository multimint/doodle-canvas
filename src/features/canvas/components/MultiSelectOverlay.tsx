import { Group, Rect } from 'react-konva'
import type Konva from 'konva'
import type { Stroke, StrokeData } from '../../../lib/types'
import {
  handleAnchor,
  resizeFromPointer,
  textAABB,
  RESIZE_HANDLES,
  type AABB,
  type Box,
  type RotBox,
} from '../utils/textBoxGeometry'
import type { XformBox } from './textBoxTypes'

interface MultiSelectOverlayProps {
  multiIds: string[]
  multiRect: Box
  multiOffset: { dx: number; dy: number } | null
  xform: XformBox | null
  strokes: Stroke[]
  zoom: number
  stageRef: React.RefObject<Konva.Stage>
  handleStartRef: React.MutableRefObject<RotBox | null>
  multiDragStart: React.MutableRefObject<{ x: number; y: number } | null>
  setMultiOffset: (o: { dx: number; dy: number } | null) => void
  setMultiRect: (b: Box | null) => void
  setXform: (x: XformBox | null) => void
  clearSelection: () => void
  onUpdateStroke?: (id: string, patch: Partial<StrokeData>) => void
}

// Group selection (2+ boxes): drag the transparent union Rect to move all, Delete to
// remove all. Each box also shows its own dashed outline plus 8 resize ("expand")
// handles — but NO rotate. Resizing a handle affects only that one box (via xform);
// only move/delete act on the whole group.
export function MultiSelectOverlay({
  multiIds,
  multiRect,
  multiOffset,
  xform,
  strokes,
  zoom,
  stageRef,
  handleStartRef,
  multiDragStart,
  setMultiOffset,
  setMultiRect,
  setXform,
  clearSelection,
  onUpdateStroke,
}: MultiSelectOverlayProps) {
  const off = multiOffset ?? { dx: 0, dy: 0 }
  const hs = 11 / zoom
  // Recompute the union bounds from current geometry (xform overrides the box being
  // resized) so the group-move area tracks a resize.
  const recomputeUnion = () => {
    const u = multiIds.reduce<AABB>(
      (acc, mid) => {
        const ms = strokes.find((k) => k.id === mid)
        if (!ms) return acc
        const g = xform?.id === mid ? xform : ms.data
        const a = textAABB(g)
        return {
          minX: Math.min(acc.minX, a.minX),
          minY: Math.min(acc.minY, a.minY),
          maxX: Math.max(acc.maxX, a.maxX),
          maxY: Math.max(acc.maxY, a.maxY),
        }
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    )
    setMultiRect({
      x: u.minX,
      y: u.minY,
      width: u.maxX - u.minX,
      height: u.maxY - u.minY,
    })
  }
  return (
    <>
      {/* Group-move area: transparent, above box bodies but below handles. */}
      <Rect
        x={multiRect.x + off.dx}
        y={multiRect.y + off.dy}
        width={multiRect.width}
        height={multiRect.height}
        fill='transparent'
        draggable
        onClick={() => {
          // The transparent move-rect covers the whole union, so a click in the empty
          // gap between selected boxes lands here, not on the Stage — deselect all
          // unless the click is actually on a box. (onClick only fires for a pure
          // click, never after a drag.)
          const wp = stageRef.current?.getRelativePointerPosition()
          if (!wp) return
          const overBox = multiIds.some((id) => {
            const s = strokes.find((k) => k.id === id)
            if (!s) return false
            const a = textAABB(s.data)
            return (
              wp.x >= a.minX && wp.x <= a.maxX && wp.y >= a.minY && wp.y <= a.maxY
            )
          })
          if (!overBox) clearSelection()
        }}
        onMouseEnter={(e) => {
          const c = e.target.getStage()?.container()
          if (c) c.style.cursor = 'move'
        }}
        onMouseLeave={(e) => {
          const c = e.target.getStage()?.container()
          if (c) c.style.cursor = 'default'
        }}
        onDragStart={() => {
          multiDragStart.current = { x: multiRect.x, y: multiRect.y }
        }}
        onDragMove={(e) => {
          const st = multiDragStart.current
          if (!st) return
          setMultiOffset({ dx: e.target.x() - st.x, dy: e.target.y() - st.y })
        }}
        onDragEnd={(e) => {
          const st = multiDragStart.current
          multiDragStart.current = null
          if (!st) return
          const dx = e.target.x() - st.x,
            dy = e.target.y() - st.y
          multiIds.forEach((id) => {
            const s = strokes.find((k) => k.id === id)
            if (s)
              onUpdateStroke?.(id, {
                x: (s.data.x ?? 0) + dx,
                y: (s.data.y ?? 0) + dy,
              })
          })
          setMultiRect({
            x: st.x + dx,
            y: st.y + dy,
            width: multiRect.width,
            height: multiRect.height,
          })
          setMultiOffset(null)
        }}
      />
      {/* Per-box outline + resize handles (rendered above the move area). */}
      {multiIds.map((id) => {
        const s = strokes.find((k) => k.id === id)
        if (!s) return null
        const g = xform?.id === id ? xform : s.data
        const W = g.width ?? 0,
          H = g.height ?? 0
        const rot = (xform?.id === id ? xform.rotation : s.data.rotation) ?? 0
        const bx = (g.x ?? 0) + off.dx,
          by = (g.y ?? 0) + off.dy
        const startRect = { x: g.x ?? 0, y: g.y ?? 0, width: W, height: H, rotation: rot }
        return (
          <Group
            key={`msel-${id}`}
            x={bx + W / 2}
            y={by + H / 2}
            offsetX={W / 2}
            offsetY={H / 2}
            rotation={rot}
          >
            <Rect
              x={0}
              y={0}
              width={W}
              height={H}
              stroke='#3d5afe'
              strokeWidth={1.5 / zoom}
              dash={[6 / zoom, 4 / zoom]}
              listening={false}
            />
            {RESIZE_HANDLES.map(({ role, cursor: hCursor }) => {
              const a = handleAnchor(role, { x: 0, y: 0, width: W, height: H })
              return (
                <Rect
                  key={role}
                  x={a.x - hs / 2}
                  y={a.y - hs / 2}
                  width={hs}
                  height={hs}
                  fill='#ffffff'
                  stroke='#3d5afe'
                  strokeWidth={1.5 / zoom}
                  hitStrokeWidth={22 / zoom}
                  draggable
                  onMouseEnter={(e) => {
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = hCursor
                  }}
                  onMouseLeave={(e) => {
                    const c = e.target.getStage()?.container()
                    if (c) c.style.cursor = 'default'
                  }}
                  onDragStart={() => {
                    handleStartRef.current = startRect
                  }}
                  onDragMove={(e) => {
                    const st = handleStartRef.current
                    const wp = stageRef.current?.getRelativePointerPosition()
                    if (!st || !wp) return
                    const nb = resizeFromPointer(role, st, wp)
                    setXform({ id, ...nb })
                    const la = handleAnchor(role, {
                      x: 0,
                      y: 0,
                      width: nb.width,
                      height: nb.height,
                    })
                    e.target.position({ x: la.x - hs / 2, y: la.y - hs / 2 })
                  }}
                  onDragEnd={() => {
                    if (xform && xform.id === id) {
                      onUpdateStroke?.(id, {
                        x: xform.x,
                        y: xform.y,
                        width: xform.width,
                        height: xform.height,
                        rotation: xform.rotation,
                      })
                    }
                    recomputeUnion()
                  }}
                />
              )
            })}
          </Group>
        )
      })}
    </>
  )
}

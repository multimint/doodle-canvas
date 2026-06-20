import { useRef } from 'react'
import type { Stroke, StrokeData } from '../../../lib/types'
import {
  handleAnchor,
  resizeFromPointer,
  textAABB,
  RESIZE_HANDLES,
  type AABB,
  type Box,
  type HandleRole,
  type RotBox,
} from '../utils/textBoxGeometry'
import type { XformBox } from './textBoxTypes'
import type { Camera } from '../engine/camera'

// Group selection (2+ boxes), as DOM overlays. Group MOVE is handled by the stage's pointer
// FSM (dragging inside the union); this overlay draws each box's dashed outline + 8 resize
// handles (NO rotate). Resizing a handle affects only that box via `xform`; on release it
// persists and recomputes the union rect. Reuses the same world-space resize math as the old
// Konva version (textBoxGeometry), driven by the stage's toWorld() converter.

const HS = 11
const ACCENT = '#3d5afe'

interface Props {
  multiIds: string[]
  multiRect: Box
  multiOffset: { dx: number; dy: number } | null
  xform: XformBox | null
  strokes: Stroke[]
  cam: Camera
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  handleStartRef: React.MutableRefObject<RotBox | null>
  setXform: (x: XformBox | null) => void
  setMultiRect: (b: Box | null) => void
  onUpdateStroke?: (id: string, patch: Partial<StrokeData>) => void
}

export function MultiSelectOverlay({
  multiIds,
  multiOffset,
  xform,
  strokes,
  cam,
  toWorld,
  handleStartRef,
  setXform,
  setMultiRect,
  onUpdateStroke,
}: Props) {
  const off = multiOffset ?? { dx: 0, dy: 0 }
  // Latest geometry during a resize, so commit + union recompute use the FINAL value rather
  // than the xform captured when the pointerup listener was attached (a stale closure).
  const latest = useRef<RotBox | null>(null)

  const recomputeUnion = (overrideId?: string, override?: RotBox | null) => {
    const u = multiIds.reduce<AABB>(
      (acc, mid) => {
        const ms = strokes.find((k) => k.id === mid)
        if (!ms) return acc
        const g =
          overrideId === mid && override
            ? override
            : xform?.id === mid
              ? xform
              : ms.data
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
    setMultiRect({ x: u.minX, y: u.minY, width: u.maxX - u.minX, height: u.maxY - u.minY })
  }

  const startDrag = (
    e: React.PointerEvent,
    id: string,
    role: HandleRole,
    startRect: RotBox,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    handleStartRef.current = startRect
    latest.current = startRect
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const st = handleStartRef.current
      if (!st) return
      const nb = resizeFromPointer(role, st, toWorld(ev.clientX, ev.clientY))
      latest.current = nb
      setXform({ id, ...nb })
    }
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      const fb = latest.current
      if (fb)
        onUpdateStroke?.(id, {
          x: fb.x,
          y: fb.y,
          width: fb.width,
          height: fb.height,
          rotation: fb.rotation,
        })
      recomputeUnion(id, fb)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  return (
    <>
      {multiIds.map((id) => {
        const s = strokes.find((k) => k.id === id)
        if (!s) return null
        const g = xform?.id === id ? xform : s.data
        const W = (g.width ?? 0) * cam.zoom
        const H = (g.height ?? 0) * cam.zoom
        const rot = (xform?.id === id ? xform.rotation : s.data.rotation) ?? 0
        const left = ((g.x ?? 0) + off.dx) * cam.zoom + cam.panX
        const top = ((g.y ?? 0) + off.dy) * cam.zoom + cam.panY
        const startRect: RotBox = {
          x: g.x ?? 0,
          y: g.y ?? 0,
          width: g.width ?? 0,
          height: g.height ?? 0,
          rotation: rot,
        }
        return (
          <div
            key={`msel-${id}`}
            style={{
              position: 'absolute',
              left,
              top,
              width: W,
              height: H,
              transform: `rotate(${rot}deg)`,
              transformOrigin: 'center center',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                border: `1.5px dashed ${ACCENT}`,
                boxSizing: 'border-box',
              }}
            />
            {RESIZE_HANDLES.map(({ role, cursor }) => {
              const a = handleAnchor(role as HandleRole, { x: 0, y: 0, width: W, height: H })
              return (
                <div
                  key={role}
                  style={{
                    position: 'absolute',
                    left: a.x - HS / 2,
                    top: a.y - HS / 2,
                    width: HS,
                    height: HS,
                    background: '#fff',
                    border: `1.5px solid ${ACCENT}`,
                    boxSizing: 'border-box',
                    cursor,
                    pointerEvents: 'auto',
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => startDrag(e, id, role, startRect)}
                />
              )
            })}
          </div>
        )
      })}
    </>
  )
}

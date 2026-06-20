import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import Konva from 'konva'
import type { Stroke } from '../../../lib/types'
import {
  frameIndex,
  buildVariants,
  hashStr,
  rectToPerimeter,
  ellipseToPerimeter,
} from '../utils/wiggleUtils'

// With autoDrawEnabled=true (default), every points()/x()/y() mutation in applyFrame
// calls _requestDraw() → batchDraw() — scheduling async deferred draws that can race
// our synchronous layer.draw(). Disabling it gives us full, exclusive control: the
// only repaints are the layer.draw() calls in this hook.
Konva.autoDrawEnabled = false

// How a registered stroke is boiled:
//   'line'  — swap the node's points() to a precomputed jittered variant (pen, line,
//             eraser, marker, and the roughened rect/circle outlines)
//   'shape' — bump the 'animT' attr; the brush's sceneFunc reads it as a frame index
//   'text'  — nudge the glyph node within its box, unless the box is selected/editing
type WiggleKind = 'line' | 'shape' | 'text'

interface WiggleEntry {
  node: Konva.Node
  kind: WiggleKind
  salt: number
  base?: number[]           // line: un-jittered points, for reset
  variants?: Float32Array[] // line: jittered variants per frame (Fix 3: typed array, built lazily)
  pendingSW?: number        // strokeWidth stored at register time; present until variants built
}

interface LiveEntry {
  node: Konva.Line | Konva.Shape
  isShape: boolean          // brush → animT; everything else → points swap
  // The live stroke's clean (un-jittered) points, recomputed by DrawingStage every render.
  // Read instead of node.points() so the boil never feeds on its own jittered output.
  pointsRef?: React.RefObject<number[]>
  base?: number[]
  variants?: Float32Array[] // Fix 3: typed array
}

function kindFor(type: Stroke['type']): WiggleKind {
  if (type === 'brush') return 'shape'
  if (type === 'text') return 'text'
  return 'line'
}

// The clean, un-jittered points the line node is rendered with — pulled from the stroke's
// stored data, NEVER from node.points() (which the boil overwrites with jittered variants).
// Reading the node back would let each register/refresh build a variant on top of the last
// one's jitter, so the stroke would grow a little every time. Mirrors strokeShapes.tsx so
// the base lines up vertex-for-vertex with what's drawn (rect/circle trace their outline).
function basePoints(stroke: Stroke): number[] {
  const d = stroke.data ?? {}
  if (stroke.type === 'rect') {
    return rectToPerimeter(d.x ?? 0, d.y ?? 0, d.width ?? 0, d.height ?? 0)
  }
  if (stroke.type === 'circle') {
    return ellipseToPerimeter(d.x ?? 0, d.y ?? 0, d.radiusX ?? 0, d.radiusY ?? 0)
  }
  return d.points ?? []
}

// Konva's points() setter types as number[] but accepts any ArrayLike<number> at runtime.
// We store Float32Array variants for lower memory/GC; this cast bridges the type gap.
function setPoints(node: Konva.Line, arr: Float32Array) {
  node.points(arr as unknown as number[])
}

export function useWiggle(
  layerRef: React.RefObject<Konva.Layer>,
  enabled: boolean,
) {
  const registryRef      = useRef<Map<string, WiggleEntry>>(new Map())
  const liveEntryRef     = useRef<LiveEntry | null>(null)
  const frozenTextRef    = useRef<Set<string>>(new Set())
  const rafRef           = useRef<number>(0)
  const lastFrameRef     = useRef<number>(-1)
  const enabledRef       = useRef(enabled)
  const pendingBuildsRef = useRef<Set<string>>(new Set())
  // Fix 2: only run applyFrame when strokes actually changed (react-konva reset node points).
  // Set by markStrokesDirty() called from DrawingStage during render on strokes/wiggle change.
  const strokesDirtyRef  = useRef(true)

  useEffect(() => { enabledRef.current = enabled }, [enabled])

  // Fix 1: separate draws — main layer only for the rAF tick (bgLayer never changes during
  // animation), full stage for React commits (new markers/erasers may have just mounted).
  const drawLayer = useCallback(() => {
    layerRef.current?.draw()
  }, [layerRef])

  const drawAll = useCallback(() => {
    const layer = layerRef.current
    if (!layer) return
    const stage = layer.getStage()
    if (stage) stage.draw()
    else layer.draw()
  }, [layerRef])

  // Move every registered node to its position for boil frame `fi`. Pure node mutation —
  // the caller owns the draw.
  const applyFrame = useCallback((fi: number) => {
    registryRef.current.forEach((entry) => {
      if (entry.kind === 'shape') {
        entry.node.setAttr('animT', fi)
      } else if (entry.kind === 'line') {
        // variants may be absent if not yet built (initial load deferred); skip cleanly
        if (entry.variants) setPoints(entry.node as Konva.Line, entry.variants[fi])
      } else {
        // text: bump animT so the glyph node's sceneFunc warps the outlines through
        // #wiggle-filter-{fi}. Pause (animT = -1, draw clean) while the box is selected/edited
        // so handles + the editor textarea stay aligned with the glyphs.
        const frozen = frozenTextRef.current.has(entry.node.id())
        entry.node.setAttr('animT', frozen ? -1 : fi)
      }
    })

    const live = liveEntryRef.current
    if (live && live.node.getLayer()) {
      if (live.isShape) live.node.setAttr('animT', fi)
      else if (live.variants) setPoints(live.node as Konva.Line, live.variants[fi])
    }
  }, [])

  // The live stroke's geometry changes as the user draws, so rebuild its variants from
  // the freshly committed points (react-konva has just set node.points() to the base).
  const refreshLiveVariants = useCallback(() => {
    const live = liveEntryRef.current
    if (!live || live.isShape || !live.node.getLayer()) return
    const base = live.pointsRef?.current
    if (!base) return
    const node = live.node as Konva.Line
    live.base = base
    live.variants = buildVariants(base, node.strokeWidth(), 0)
  }, [])

  // Eagerly build variants for all pending entries (called from the first rAF tick after
  // a bulk load so that the initial paint is unblocked and wiggle starts one frame later).
  const flushPendingBuilds = useCallback(() => {
    const pending = pendingBuildsRef.current
    if (pending.size === 0) return
    for (const id of pending) {
      const entry = registryRef.current.get(id)
      if (entry && entry.base !== undefined && entry.pendingSW !== undefined) {
        entry.variants = buildVariants(entry.base, entry.pendingSW, entry.salt)
        entry.pendingSW = undefined
      }
    }
    pending.clear()
  }, [])

  const tick = useCallback((t: DOMHighResTimeStamp) => {
    if (!enabledRef.current) return
    // Flush any variants deferred from a bulk initial load
    flushPendingBuilds()
    const fi = frameIndex(t)
    // Only repaint when the boil frame actually flips (~12fps) rather than every rAF.
    if (fi !== lastFrameRef.current) {
      lastFrameRef.current = fi
      applyFrame(fi)
      // Fix 1: bgLayer (markers/erasers) never changes during animation — draw main layer only.
      drawLayer()
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [applyFrame, drawLayer, flushPendingBuilds])

  const resetAll = useCallback(() => {
    registryRef.current.forEach((entry) => {
      if (entry.kind === 'shape') entry.node.setAttr('animT', 0)
      else if (entry.kind === 'line' && entry.base) (entry.node as Konva.Line).points(entry.base)
      else if (entry.kind === 'text') entry.node.setAttr('animT', -1)
    })
    const live = liveEntryRef.current
    if (live) {
      if (live.isShape) live.node.setAttr('animT', 0)
      else if (live.base) (live.node as Konva.Line).points(live.base)
    }
    lastFrameRef.current = -1
    drawAll()
  }, [drawAll])

  useEffect(() => {
    if (enabled) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
      resetAll()
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, tick, resetAll])

  // After every React commit: redraw so Konva shows the latest state. Only call applyFrame
  // (which iterates all N registered nodes) when strokes actually changed — non-stroke
  // commits (tool change, color picker, modal open, etc.) don't reset any node's points,
  // so the rAF-applied jitter is already correct and re-applying is pure waste (Fix 2).
  useLayoutEffect(() => {
    if (enabledRef.current) {
      refreshLiveVariants()
      const pending = pendingBuildsRef.current

      if (pending.size <= 5) {
        // Small pending set (single new stroke): build eagerly and jitter in sync.
        flushPendingBuilds()
        if (strokesDirtyRef.current) {
          // Strokes changed — react-konva may have reset node points for new/mutated strokes.
          const fi = frameIndex(performance.now())
          lastFrameRef.current = fi
          applyFrame(fi)
          strokesDirtyRef.current = false
        } else {
          // No stroke changes: only re-apply the live stroke (committed nodes unchanged).
          const live = liveEntryRef.current
          if (live?.node.getLayer()) {
            const fi = frameIndex(performance.now())
            if (live.isShape) live.node.setAttr('animT', fi)
            else if (live.variants) setPoints(live.node as Konva.Line, live.variants[fi])
          }
        }
      } else {
        // Large pending set = initial bulk load: skip applyFrame so the first paint is fast;
        // the rAF tick will flush and start wiggling one frame later (~16ms).
        strokesDirtyRef.current = false
      }
      // Fix 1: use stage.draw() here so bgLayer (new markers/erasers from this commit) paint.
      drawAll()
    } else {
      drawAll()
    }
  })

  const registerStroke = useCallback((id: string, node: Konva.Node, stroke: Stroke) => {
    // Never boil the eraser: a wiggling cut edge oscillates frame-to-frame and lets the
    // boiling spray dots underneath flash into the area you just erased. A static hole holds.
    if (stroke.type === 'eraser') return
    const kind = kindFor(stroke.type)
    const salt = hashStr(id)
    const entry: WiggleEntry = { node, kind, salt }
    if (kind === 'line') {
      const line = node as Konva.Line
      entry.base = basePoints(stroke)
      // Defer buildVariants to the next rAF tick (or eagerly for small batches in useLayoutEffect)
      // so a bulk initial load doesn't block the first paint.
      entry.pendingSW = line.strokeWidth()
      pendingBuildsRef.current.add(id)
    }
    registryRef.current.set(id, entry)
  }, [])

  const unregisterStroke = useCallback((id: string) => {
    registryRef.current.delete(id)
    pendingBuildsRef.current.delete(id)
  }, [])

  const registerLive = useCallback((
    node: Konva.Line | Konva.Shape,
    isShape: boolean,
    pointsRef?: React.RefObject<number[]>,
  ) => {
    const entry: LiveEntry = { node, isShape, pointsRef }
    if (!isShape) {
      const line = node as Konva.Line
      const base = pointsRef?.current ?? []
      entry.base = base
      entry.variants = buildVariants(base, line.strokeWidth(), 0)
    }
    liveEntryRef.current = entry
  }, [])

  const unregisterLive = useCallback(() => {
    liveEntryRef.current = null
  }, [])

  // Which Text Boxes are selected/edited (so their boil pauses). Repaint immediately so a
  // freshly selected box snaps still and a deselected one resumes wiggling.
  const setFrozenText = useCallback((ids: string[]) => {
    frozenTextRef.current = new Set(ids)
    if (enabledRef.current) {
      const fi = lastFrameRef.current >= 0 ? lastFrameRef.current : frameIndex(performance.now())
      applyFrame(fi)
      // Fix 1: text nodes are on the main layer; no need to repaint bgLayer.
      drawLayer()
    }
  }, [applyFrame, drawLayer])

  // Fix 2: called by DrawingStage during render when strokes or wiggle prop changes,
  // so useLayoutEffect knows to re-apply jitter for potentially-reset node points.
  const markStrokesDirty = useCallback(() => {
    strokesDirtyRef.current = true
  }, [])

  return { registerStroke, unregisterStroke, registerLive, unregisterLive, setFrozenText, markStrokesDirty }
}

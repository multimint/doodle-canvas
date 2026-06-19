import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import Konva from 'konva'
import type { Stroke } from '../../../lib/types'
import { frameIndex, buildVariants, nodeJitter, hashStr } from '../utils/wiggleUtils'

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
  base?: number[]        // line: un-jittered points, for reset
  variants?: number[][]  // line: one jittered point array per frame
}

interface LiveEntry {
  node: Konva.Line | Konva.Shape
  isShape: boolean       // brush → animT; everything else → points swap
  base?: number[]
  variants?: number[][]
}

function kindFor(type: Stroke['type']): WiggleKind {
  if (type === 'brush') return 'shape'
  if (type === 'text') return 'text'
  return 'line'
}

export function useWiggle(
  layerRef: React.RefObject<Konva.Layer>,
  enabled: boolean,
) {
  const registryRef   = useRef<Map<string, WiggleEntry>>(new Map())
  const liveEntryRef  = useRef<LiveEntry | null>(null)
  const frozenTextRef = useRef<Set<string>>(new Set())
  const rafRef        = useRef<number>(0)
  const lastFrameRef  = useRef<number>(-1)
  const enabledRef    = useRef(enabled)

  useEffect(() => { enabledRef.current = enabled }, [enabled])

  // Repaint everything. Markers live on a separate background layer (so the eraser can't
  // reach them), so we redraw the whole stage rather than just the main layer.
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
        if (entry.variants) (entry.node as Konva.Line).points(entry.variants[fi])
      } else {
        // text: pause the boil while the box is selected/edited so handles + the editor
        // textarea stay aligned with the glyphs.
        const frozen = frozenTextRef.current.has(entry.node.id())
        if (frozen) {
          entry.node.x(0); entry.node.y(0)
        } else {
          const [jx, jy] = nodeJitter(entry.salt, fi)
          entry.node.x(jx); entry.node.y(jy)
        }
      }
    })

    const live = liveEntryRef.current
    if (live && live.node.getLayer()) {
      if (live.isShape) live.node.setAttr('animT', fi)
      else if (live.variants) (live.node as Konva.Line).points(live.variants[fi])
    }
  }, [])

  // The live stroke's geometry changes as the user draws, so rebuild its variants from
  // the freshly committed points (react-konva has just set node.points() to the base).
  const refreshLiveVariants = useCallback(() => {
    const live = liveEntryRef.current
    if (!live || live.isShape || !live.node.getLayer()) return
    const node = live.node as Konva.Line
    const base = node.points()
    live.base = base
    live.variants = buildVariants(base, node.strokeWidth(), 0)
  }, [])

  const tick = useCallback((t: DOMHighResTimeStamp) => {
    if (!enabledRef.current) return
    const fi = frameIndex(t)
    // Only repaint when the boil frame actually flips (~12fps) rather than every rAF.
    if (fi !== lastFrameRef.current) {
      lastFrameRef.current = fi
      applyFrame(fi)
      drawAll()
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [applyFrame, drawAll])

  const resetAll = useCallback(() => {
    registryRef.current.forEach((entry) => {
      if (entry.kind === 'shape') entry.node.setAttr('animT', 0)
      else if (entry.kind === 'line' && entry.base) (entry.node as Konva.Line).points(entry.base)
      else if (entry.kind === 'text') { entry.node.x(0); entry.node.y(0) }
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

  // After every React commit: if wiggle is on, re-apply offsets and draw synchronously so
  // react-konva's attr resets are never visible. If off, still draw so prop changes from
  // reconciliation are visible (autoDrawEnabled=false means Konva won't do it itself).
  useLayoutEffect(() => {
    if (enabledRef.current) {
      refreshLiveVariants()
      const fi = frameIndex(performance.now())
      lastFrameRef.current = fi
      applyFrame(fi)
      drawAll()
    } else {
      drawAll()
    }
  })

  const registerStroke = useCallback((id: string, node: Konva.Node, stroke: Stroke) => {
    const kind = kindFor(stroke.type)
    const salt = hashStr(id)
    const entry: WiggleEntry = { node, kind, salt }
    if (kind === 'line') {
      const line = node as Konva.Line
      const base = line.points()
      entry.base = base
      entry.variants = buildVariants(base, line.strokeWidth(), salt)
    }
    registryRef.current.set(id, entry)
  }, [])

  const unregisterStroke = useCallback((id: string) => {
    registryRef.current.delete(id)
  }, [])

  const registerLive = useCallback((
    node: Konva.Line | Konva.Shape,
    isShape: boolean,
  ) => {
    const entry: LiveEntry = { node, isShape }
    if (!isShape) {
      const line = node as Konva.Line
      const base = line.points()
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
      drawAll()
    }
  }, [applyFrame, drawAll])

  return { registerStroke, unregisterStroke, registerLive, unregisterLive, setFrozenText }
}

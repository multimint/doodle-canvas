import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import Konva from 'konva'
import type { Stroke } from '../../../lib/types'

// With autoDrawEnabled=true (default), every points()/x()/y() mutation in runFrame
// calls _requestDraw() → batchDraw() — scheduling async deferred draws that can race
// our synchronous layer.draw(). Disabling it gives us full, exclusive control: the
// only repaints are the layer.draw() calls in runFrame and useLayoutEffect below.
Konva.autoDrawEnabled = false

const AMPLITUDE = 2.5
const FREQUENCY = 0.0018
// (used by rect/circle/text wiggle — path/line strokes are intentionally static)

interface WiggleEntry {
  node: Konva.Node
  stroke: Stroke
}

interface LiveEntry {
  node: Konva.Line | Konva.Shape
  // non-null for pen (wiggle points), null for brush (animT only)
  pointsRef: React.RefObject<number[]> | null
}

export function useWiggle(
  layerRef: React.RefObject<Konva.Layer>,
  enabled: boolean,
) {
  const registryRef  = useRef<Map<string, WiggleEntry>>(new Map())
  const liveEntryRef = useRef<LiveEntry | null>(null)
  const rafRef       = useRef<number>(0)
  const enabledRef   = useRef(enabled)

  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const runFrame = useCallback((t: DOMHighResTimeStamp) => {
    registryRef.current.forEach(({ node, stroke }) => {
      const { type, data } = stroke

      if (type === 'brush') {
        node.setAttr('animT', t)
      } else if (type === 'rect' || type === 'circle' || type === 'text') {
        // Use position as spatial phase so nearby shapes don't wiggle in lockstep
        const px = (data.x ?? 0) * 0.05
        const py = (data.y ?? 0) * 0.05
        node.x((data.x ?? 0) + Math.sin(t * FREQUENCY + px) * AMPLITUDE)
        node.y((data.y ?? 0) + Math.cos(t * FREQUENCY + py) * AMPLITUDE)
      }
    })

    const live = liveEntryRef.current
    if (live && live.node.getLayer() && !live.pointsRef) {
      // Brush live stroke: advance the spray jitter clock
      live.node.setAttr('animT', t)
    }

    layerRef.current?.draw()
  }, [layerRef])

  const tick = useCallback((t: DOMHighResTimeStamp) => {
    if (!enabledRef.current) return
    runFrame(t)
    rafRef.current = requestAnimationFrame(tick)
  }, [runFrame])

  const resetAll = useCallback(() => {
    registryRef.current.forEach(({ node, stroke }) => {
      const { type, data } = stroke
      if (type === 'brush') {
        node.setAttr('animT', 0)
      } else if (type === 'rect' || type === 'circle' || type === 'text') {
        node.x(data.x ?? 0)
        node.y(data.y ?? 0)
      }
    })
    const live = liveEntryRef.current
    if (live && !live.pointsRef) {
      live.node.setAttr('animT', 0)
    }
    layerRef.current?.draw()
  }, [layerRef])

  useEffect(() => {
    if (enabled) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
      resetAll()
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, tick, resetAll])

  // After every React commit: if wiggle is on, re-apply offsets and draw
  // synchronously so react-konva's attr resets are never visible to the user.
  // If wiggle is off, still draw so prop changes from reconciliation are visible
  // (autoDrawEnabled=false means Konva won't do it automatically).
  useLayoutEffect(() => {
    if (enabledRef.current) {
      runFrame(performance.now())
    } else {
      layerRef.current?.draw()
    }
  })

  const registerStroke = useCallback((id: string, node: Konva.Node, stroke: Stroke) => {
    if (stroke.type === 'eraser') return
    registryRef.current.set(id, { node, stroke })
  }, [])

  const unregisterStroke = useCallback((id: string) => {
    registryRef.current.delete(id)
  }, [])

  const registerLive = useCallback((
    node: Konva.Line | Konva.Shape,
    pointsRef: React.RefObject<number[]> | null,
  ) => {
    liveEntryRef.current = { node, pointsRef }
  }, [])

  const unregisterLive = useCallback(() => {
    liveEntryRef.current = null
  }, [])

  return { registerStroke, unregisterStroke, registerLive, unregisterLive }
}

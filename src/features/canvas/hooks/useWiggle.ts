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
const SPREAD    = 0.45

interface WiggleEntry {
  node: Konva.Node
  stroke: Stroke
  seed: number
}

interface LiveEntry {
  node: Konva.Line
  pointsRef: React.RefObject<number[]>
}

function seedFrom(id: string): number {
  let s = 0
  for (let i = 0; i < id.length; i++) s = id.charCodeAt(i) + ((s << 5) - s)
  return s
}

export function useWiggle(
  layerRef: React.RefObject<Konva.Layer>,
  enabled: boolean,
) {
  const registryRef  = useRef<Map<string, WiggleEntry>>(new Map())
  const liveEntryRef = useRef<LiveEntry | null>(null)
  const rafRef       = useRef<number>(0)
  const enabledRef   = useRef(enabled)
  const lastTRef     = useRef<DOMHighResTimeStamp>(0)

  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const runFrame = useCallback((t: DOMHighResTimeStamp) => {
    lastTRef.current = t

    registryRef.current.forEach(({ node, stroke, seed }) => {
      const { type, data } = stroke

      if (type === 'path' || type === 'line') {
        const raw = data.points ?? []
        const perturbed: number[] = []
        for (let i = 0; i < raw.length; i += 2) {
          const idx = i / 2
          perturbed.push(
            raw[i]     + Math.sin(t * FREQUENCY + idx * SPREAD       + seed) * AMPLITUDE,
            raw[i + 1] + Math.cos(t * FREQUENCY + idx * SPREAD * 1.3 + seed) * AMPLITUDE,
          )
        }
        ;(node as Konva.Line).points(perturbed)
      } else if (type === 'rect' || type === 'circle' || type === 'text') {
        node.x((data.x ?? 0) + Math.sin(t * FREQUENCY + seed)       * AMPLITUDE)
        node.y((data.y ?? 0) + Math.cos(t * FREQUENCY + seed * 1.3) * AMPLITUDE)
      }
    })

    const live = liveEntryRef.current
    if (live && live.node.getLayer()) {
      const raw = live.pointsRef.current ?? []
      if (raw.length >= 4) {
        const perturbed: number[] = []
        for (let i = 0; i < raw.length; i += 2) {
          const idx = i / 2
          perturbed.push(
            raw[i]     + Math.sin(t * FREQUENCY + idx * SPREAD      ) * AMPLITUDE,
            raw[i + 1] + Math.cos(t * FREQUENCY + idx * SPREAD * 1.3) * AMPLITUDE,
          )
        }
        live.node.points(perturbed)
      }
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
      if (type === 'path' || type === 'line') {
        ;(node as Konva.Line).points(data.points ?? [])
      } else if (type === 'rect' || type === 'circle' || type === 'text') {
        node.x(data.x ?? 0)
        node.y(data.y ?? 0)
      }
    })
    const live = liveEntryRef.current
    if (live) live.node.points(live.pointsRef.current ?? [])
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
    registryRef.current.set(id, { node, stroke, seed: seedFrom(id) })
  }, [])

  const unregisterStroke = useCallback((id: string) => {
    registryRef.current.delete(id)
  }, [])

  const registerLive = useCallback((node: Konva.Line, pointsRef: React.RefObject<number[]>) => {
    liveEntryRef.current = { node, pointsRef }
  }, [])

  const unregisterLive = useCallback(() => {
    liveEntryRef.current = null
  }, [])

  return { registerStroke, unregisterStroke, registerLive, unregisterLive }
}

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type Konva from 'konva'
import type { Stroke } from '../../../lib/types'

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

  // Keep enabledRef in sync without restarting the loop
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  // runFrame reads everything from refs — stable, never recreated
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

    // draw() is synchronous — paints immediately rather than deferring via rAF
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

  // Re-apply wiggle immediately after every React commit so react-konva's
  // reconciliation (which resets node attrs to original values) never shows
  // through to the user before our rAF fires. Use performance.now() so the
  // wiggle phase is always current, not a stale rAF timestamp.
  useLayoutEffect(() => {
    if (enabledRef.current) runFrame(performance.now())
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

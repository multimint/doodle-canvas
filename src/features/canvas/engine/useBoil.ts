import { useEffect, useRef } from 'react'
import { frameIndex } from '../utils/wiggleUtils'

// The boil clock. One rAF loop for the whole canvas: it advances the shared 3-frame index at
// ~12fps (frameIndex from wiggleUtils) and calls `redraw(frame)` only when the frame actually
// flips — not every rAF — so the immediate-mode canvas repaints at the boil rate, not 60fps.
// When wiggle is off the frame pins to 0, so the canvas settles on the clean geometry and the
// loop costs nothing until something else triggers a redraw.
//
// Non-animation repaints (camera move, strokes change, selection) are the caller's job: it
// reads `frameRef.current` and calls the same redraw with the current frame. Keeping the frame
// in a ref means those repaints always match whatever the boil is showing.
export function useBoil(enabled: boolean, redraw: (frame: number) => void) {
  const redrawRef = useRef(redraw)
  redrawRef.current = redraw
  const enabledRef = useRef(enabled)
  const frameRef = useRef(0)
  const lastFrameRef = useRef(-1)
  const rafRef = useRef(0)

  useEffect(() => {
    enabledRef.current = enabled
    // Flipping the toggle: settle on (or resume from) a frame immediately rather than waiting
    // for the next flip, so turning wiggle off snaps to clean geometry at once.
    const fi = enabled ? frameIndex(performance.now()) : 0
    frameRef.current = fi
    lastFrameRef.current = fi
    redrawRef.current(fi)
  }, [enabled])

  useEffect(() => {
    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick)
      const fi = enabledRef.current ? frameIndex(t) : 0
      if (fi !== lastFrameRef.current) {
        lastFrameRef.current = fi
        frameRef.current = fi
        redrawRef.current(fi)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return { frameRef }
}

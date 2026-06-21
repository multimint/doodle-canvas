import { useEffect, useState } from 'react'
import { frameIndex } from '../../canvas/utils/wiggleUtils'

// One boil clock for the *whole* month grid. Instead of every Day Doodle thumbnail running its
// own rAF (42 loops on the calendar), PlannerPage calls this once and passes the frame down to
// each thumbnail — a single shared animation loop. Mirrors useBoil's cadence: it advances the
// 3-frame wiggle index at ~12fps (frameIndex) and only re-renders when the frame actually flips,
// so all cards wiggle in sync at the boil rate, not 60fps. When `enabled` is false it pins to 0.
export function useSharedBoil(enabled: boolean): number {
  const [frame, setFrame] = useState(() => (enabled ? frameIndex(performance.now()) : 0))

  useEffect(() => {
    if (!enabled) {
      setFrame(0)
      return
    }
    let raf = 0
    let last = -1
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      const fi = frameIndex(t)
      if (fi !== last) {
        last = fi
        setFrame(fi)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled])

  return frame
}

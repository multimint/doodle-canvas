import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Camera,
  clampZoom,
  clampPan,
  fitCamera,
  fitFixedFrame,
  fitZoom,
  zoomToward,
  MIN_ZOOM,
  MAX_ZOOM,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../engine/camera'

// The imperative handle the minimap and zoom controls drive: jump the viewport, and read
// the rendered scene canvas to blit a thumbnail. Replaces the Konva-based NavHandle
// (getLayer → getSceneCanvas) so nothing downstream depends on Konva.
export interface NavHandle {
  applyViewport: (zoom: number, pan: { x: number; y: number }) => void
  getSceneCanvas: () => HTMLCanvasElement | null
  // Zoom toward the viewport centre (used by the on-screen zoom buttons).
  stepZoom: (dir: 1 | -1) => void
  // Jump back to 100% with the fixed canvas centred.
  resetView: () => void
  // Current container size in CSS px (minimap viewport math).
  getSize: () => { w: number; h: number }
}

interface TouchPoint {
  clientX: number
  clientY: number
}

interface Options {
  containerRef: React.RefObject<HTMLDivElement>
  navRef?: React.MutableRefObject<NavHandle | null>
  // Reads the current scene canvas for the minimap (the stage owns the canvas refs).
  getSceneCanvas?: () => HTMLCanvasElement | null
  onViewportChange?: (zoom: number, pan: { x: number; y: number }) => void
  // Called when a pinch begins, so the caller can abandon an in-progress stroke.
  onPinchStart?: () => void
  // When set, the viewport is locked to this fixed world frame: it is fit-and-centred (with
  // upscaling) into the container on every resize instead of the once-only 1:1-capped fitCamera.
  // Used by the Day Doodle modal so its 120×90 frame fills the modal and can't be panned/zoomed.
  fixedFrame?: { width: number; height: number }
  // When set, the viewport is *bounded* to this world frame: it starts fit-to-frame, the user may
  // zoom in, but pan is clamped to the frame edges and zoom can't drop below fit. Used by the
  // Daily Planner ("no infinite" sheet). Mutually exclusive with fixedFrame.
  boundedFrame?: { width: number; height: number }
}

// Owns the canvas viewport: zoom + pan (kept in both a ref for synchronous handler reads
// and state for rendering), the fit-to-container sizing, the wheel/pinch gesture math, and
// the NavHandle. Mirrors the old useViewport but built on native events + the pure Camera
// model instead of a Konva stage, so it carries no rendering-backend dependency.
export function useCamera({
  containerRef,
  navRef,
  getSceneCanvas,
  onViewportChange,
  onPinchStart,
  fixedFrame,
  boundedFrame,
}: Options) {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const camRef = useRef<Camera>({ panX: 0, panY: 0, zoom: 1 })
  const [cam, setCam] = useState<Camera>(camRef.current)
  const initializedRef = useRef(false)
  const lastTouchRef = useRef<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)

  // Bounded view: floor zoom at fit and clamp pan to the frame so the user can zoom in but never
  // pan/zoom out past the sheet. Reads the live container size from a resize-tracked ref. Depends on
  // the frame's primitive dimensions (not the object) so it — and setCamera below — stay stable
  // across renders even though callers pass a fresh boundedFrame object each time.
  const bw = boundedFrame?.width
  const bh = boundedFrame?.height
  const containerRef2 = useRef(containerSize)
  containerRef2.current = containerSize
  const boundCamera = useCallback(
    (next: Camera): Camera => {
      if (!bw || !bh) return next
      const { w, h } = containerRef2.current
      if (w === 0 || h === 0) return next
      const minZoom = fitZoom(w, h, bw, bh)
      const z = Math.max(minZoom, next.zoom)
      return clampPan({ ...next, zoom: z }, w, h, bw, bh)
    },
    [bw, bh],
  )

  const setCamera = useCallback(
    (next: Camera) => {
      const bounded = boundCamera(next)
      camRef.current = bounded
      setCam(bounded)
      onViewportChange?.(bounded.zoom, { x: bounded.panX, y: bounded.panY })
    },
    [onViewportChange, boundCamera],
  )

  // NavHandle-shaped jump used by minimap / zoom controls.
  const applyViewport = useCallback(
    (zoom: number, pan: { x: number; y: number }) => {
      setCamera({ zoom, panX: pan.x, panY: pan.y })
    },
    [setCamera],
  )

  // Translate the viewport by a client-space delta (hand-tool pan drag).
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const c = camRef.current
      setCamera({ ...c, panX: c.panX + dx, panY: c.panY + dy })
    },
    [setCamera],
  )

  // Container sizing + browser-gesture suppression. The wheel/two-finger listeners are
  // non-passive so the canvas can own scroll/zoom instead of the page.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const preventScroll = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', preventScroll, { passive: false })
    const preventTwoFingerScroll = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault()
    }
    el.addEventListener('touchstart', preventTwoFingerScroll, { passive: false })
    el.addEventListener('touchmove', preventTwoFingerScroll, { passive: false })

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      setContainerSize({ w: width, h: height })
      // Keep the synchronous size ref fresh so setCamera's bounded clamp uses the new size now,
      // not the stale state from before this resize.
      containerRef2.current = { w: width, h: height }
      if (fixedFrame) {
        // Re-fit the locked frame on every resize so it always fills the container exactly.
        setCamera(fitFixedFrame(width, height, fixedFrame.width, fixedFrame.height))
      } else if (boundedFrame) {
        // Bounded view: fit-to-frame on first sizing; afterwards keep the user's zoom but re-clamp
        // pan (and re-floor zoom) to the new container via setCamera's bounding.
        if (!initializedRef.current) {
          initializedRef.current = true
          setCamera(fitFixedFrame(width, height, boundedFrame.width, boundedFrame.height))
        } else {
          setCamera(camRef.current)
        }
      } else if (!initializedRef.current) {
        initializedRef.current = true
        setCamera(fitCamera(width, height))
      }
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', preventScroll)
      el.removeEventListener('touchstart', preventTwoFingerScroll)
      el.removeEventListener('touchmove', preventTwoFingerScroll)
    }
  }, [containerRef, setCamera, fixedFrame?.width, fixedFrame?.height, boundedFrame?.width, boundedFrame?.height])

  // Wheel zoom toward the pointer. anchorX/Y are container-relative px. Stepped to 0.1 and
  // snapped, matching the old wheel feel.
  const handleWheelZoom = useCallback(
    (deltaY: number, anchorX: number, anchorY: number) => {
      const c = camRef.current
      const dir = deltaY < 0 ? 1 : -1
      const stepped = Math.round((c.zoom + dir * 0.1) * 10) / 10
      setCamera(zoomToward(c, stepped, anchorX, anchorY))
    },
    [setCamera],
  )

  const handleTouchStart = useCallback(
    (touches: TouchPoint[]) => {
      if (touches.length < 2) return
      onPinchStart?.()
      lastTouchRef.current = {
        x1: touches[0].clientX,
        y1: touches[0].clientY,
        x2: touches[1].clientX,
        y2: touches[1].clientY,
      }
    },
    [onPinchStart],
  )

  const handleTouchMove = useCallback(
    (touches: TouchPoint[]) => {
      if (touches.length < 2 || !lastTouchRef.current) return
      const prev = lastTouchRef.current
      const cur = {
        x1: touches[0].clientX,
        y1: touches[0].clientY,
        x2: touches[1].clientX,
        y2: touches[1].clientY,
      }
      const prevMidX = (prev.x1 + prev.x2) / 2
      const prevMidY = (prev.y1 + prev.y2) / 2
      const curMidX = (cur.x1 + cur.x2) / 2
      const curMidY = (cur.y1 + cur.y2) / 2
      const prevDist = Math.hypot(prev.x2 - prev.x1, prev.y2 - prev.y1)
      const curDist = Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1)

      const c = camRef.current
      const scale = prevDist > 1 ? curDist / prevDist : 1
      const newZoom = clampZoom(c.zoom * scale)
      const ratio = newZoom / c.zoom
      // Track the pinch midpoint while zooming toward it (uses client coords directly,
      // matching the previous implementation's behaviour).
      setCamera({
        zoom: newZoom,
        panX: curMidX - (prevMidX - c.panX) * ratio,
        panY: curMidY - (prevMidY - c.panY) * ratio,
      })
      lastTouchRef.current = cur
    },
    [setCamera],
  )

  // Zoom toward the viewport centre by one 0.1 step (the on-screen zoom buttons).
  const stepZoom = useCallback(
    (dir: 1 | -1) => {
      const c = camRef.current
      const { w, h } = containerSize
      const stepped = Math.round((c.zoom + dir * 0.1) * 10) / 10
      setCamera(zoomToward(c, stepped, w / 2, h / 2))
    },
    [containerSize, setCamera],
  )

  // Reset to 100% with the fixed canvas extent centred in the container — or, for a bounded view,
  // back to fit-to-frame (its natural "whole sheet" framing).
  const resetView = useCallback(() => {
    const { w, h } = containerSize
    if (boundedFrame) {
      setCamera(fitFixedFrame(w, h, boundedFrame.width, boundedFrame.height))
      return
    }
    setCamera({ zoom: 1, panX: (w - CANVAS_WIDTH) / 2, panY: (h - CANVAS_HEIGHT) / 2 })
  }, [containerSize, setCamera, boundedFrame])

  const handleTouchEnd = useCallback(() => {
    lastTouchRef.current = null
    const c = camRef.current
    const snapped = clampZoom(Math.round(c.zoom * 10) / 10)
    if (snapped === c.zoom) return
    const { w, h } = containerSize
    // Re-centre the snap on the current viewport centre.
    const vpCx = -c.panX / c.zoom + w / 2
    const vpCy = -c.panY / c.zoom + h / 2
    setCamera({
      zoom: snapped,
      panX: w / 2 - vpCx * snapped,
      panY: h / 2 - vpCy * snapped,
    })
  }, [containerSize, setCamera])

  // Expose the jump + scene-canvas reader to the minimap / zoom controls.
  useEffect(() => {
    if (!navRef) return
    navRef.current = {
      applyViewport,
      getSceneCanvas: () => getSceneCanvas?.() ?? null,
      stepZoom,
      resetView,
      getSize: () => containerSize,
    }
    return () => {
      navRef.current = null
    }
  }, [navRef, applyViewport, getSceneCanvas, stepZoom, resetView, containerSize])

  return {
    cam,
    camRef,
    containerSize,
    applyViewport,
    panBy,
    handleWheelZoom,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    MIN_ZOOM,
    MAX_ZOOM,
  }
}

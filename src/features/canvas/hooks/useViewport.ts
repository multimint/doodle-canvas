import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { NavHandle } from '../components/DrawingStage'

const CANVAS_WIDTH = 1920
const CANVAS_HEIGHT = 1080
const MIN_ZOOM = 0.25
const MAX_ZOOM = 3

interface Options {
  stageRef: React.RefObject<Konva.Stage>
  containerRef: React.RefObject<HTMLDivElement>
  layerRef: React.RefObject<Konva.Layer>
  navRef?: React.MutableRefObject<NavHandle | null>
  onViewportChange?: (zoom: number, pan: { x: number; y: number }) => void
  // Called when a pinch begins, so the caller can abandon an in-progress stroke.
  onPinchStart?: () => void
}

// Owns the canvas viewport: zoom + pan (kept in both refs for synchronous handler
// reads and state for rendering), the wheel/pinch gesture handlers, the fit-to-
// container sizing, and the NavHandle the minimap/zoom controls drive. Keeping all of
// this behind one interface keeps DrawingStage focused on drawing, not on transforms.
export function useViewport({
  stageRef,
  containerRef,
  layerRef,
  navRef,
  onViewportChange,
  onPinchStart,
}: Options) {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const initializedRef = useRef(false)
  const lastTouchRef = useRef<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)

  const applyViewport = useCallback(
    (newZoom: number, newPan: { x: number; y: number }) => {
      zoomRef.current = newZoom
      panRef.current = newPan
      setZoom(newZoom)
      setPan(newPan)
      onViewportChange?.(newZoom, newPan)
    },
    [onViewportChange],
  )

  // Translate the viewport by a client-space delta (used by the hand-tool pan drag).
  const panBy = useCallback(
    (dx: number, dy: number) => {
      applyViewport(zoomRef.current, {
        x: panRef.current.x + dx,
        y: panRef.current.y + dy,
      })
    },
    [applyViewport],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Prevent browser scroll when wheeling over canvas
    const preventScroll = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', preventScroll, { passive: false })

    // Prevent browser pinch-zoom / overscroll on two-finger touch
    const preventTwoFingerScroll = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault()
    }
    el.addEventListener('touchstart', preventTwoFingerScroll, {
      passive: false,
    })
    el.addEventListener('touchmove', preventTwoFingerScroll, {
      passive: false,
    })

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      setContainerSize({ w: width, h: height })

      if (!initializedRef.current) {
        initializedRef.current = true
        const fitZoom = Math.min(1, width / CANVAS_WIDTH, height / CANVAS_HEIGHT)
        applyViewport(fitZoom, {
          x: (width - CANVAS_WIDTH * fitZoom) / 2,
          y: (height - CANVAS_HEIGHT * fitZoom) / 2,
        })
      }
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', preventScroll)
      el.removeEventListener('touchstart', preventTwoFingerScroll)
      el.removeEventListener('touchmove', preventTwoFingerScroll)
    }
  }, [applyViewport, containerRef])

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return

    const dir = e.evt.deltaY < 0 ? 1 : -1
    const newZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.round((zoomRef.current + dir * 0.1) * 10) / 10),
    )
    const ratio = newZoom / zoomRef.current
    applyViewport(newZoom, {
      x: pointer.x - (pointer.x - panRef.current.x) * ratio,
      y: pointer.y - (pointer.y - panRef.current.y) * ratio,
    })
  }

  const handleTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) return
    onPinchStart?.() // cancel any ongoing single-touch stroke
    const t = e.evt.touches
    lastTouchRef.current = {
      x1: t[0].clientX,
      y1: t[0].clientY,
      x2: t[1].clientX,
      y2: t[1].clientY,
    }
  }

  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2 || !lastTouchRef.current) return
    const prev = lastTouchRef.current
    const t = e.evt.touches
    const cur = {
      x1: t[0].clientX,
      y1: t[0].clientY,
      x2: t[1].clientX,
      y2: t[1].clientY,
    }

    const prevMidX = (prev.x1 + prev.x2) / 2
    const prevMidY = (prev.y1 + prev.y2) / 2
    const curMidX = (cur.x1 + cur.x2) / 2
    const curMidY = (cur.y1 + cur.y2) / 2
    const prevDist = Math.hypot(prev.x2 - prev.x1, prev.y2 - prev.y1)
    const curDist = Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1)

    const scale = prevDist > 1 ? curDist / prevDist : 1
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * scale))
    const ratio = newZoom / zoomRef.current
    applyViewport(newZoom, {
      x: curMidX - (prevMidX - panRef.current.x) * ratio,
      y: curMidY - (prevMidY - panRef.current.y) * ratio,
    })
    lastTouchRef.current = cur
  }

  const handleTouchEnd = () => {
    lastTouchRef.current = null
    const stage = stageRef.current
    if (!stage) return
    const snapped = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.round(zoomRef.current * 10) / 10),
    )
    if (snapped !== zoomRef.current) {
      const vpCx = -panRef.current.x / zoomRef.current + stage.width() / 2
      const vpCy = -panRef.current.y / zoomRef.current + stage.height() / 2
      applyViewport(snapped, {
        x: stage.width() / 2 - vpCx * snapped,
        y: stage.height() / 2 - vpCy * snapped,
      })
    }
  }

  // Expose applyViewport + raw layer canvas to parent (minimap / zoom controls).
  useEffect(() => {
    if (!navRef) return
    navRef.current = {
      applyViewport,
      getLayer: () => layerRef.current,
    }
    return () => {
      navRef.current = null
    }
  }, [navRef, applyViewport, layerRef])

  return {
    zoom,
    pan,
    zoomRef,
    panRef,
    containerSize,
    applyViewport,
    panBy,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }
}

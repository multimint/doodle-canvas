import type { Stroke, CursorPos } from '../../../lib/types'
import { textAABB } from '../utils/textBoxGeometry'
import type { Camera } from '../engine/camera'
import { SELECTION_Z } from '../constants'

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// One stacking level below the local selection chrome, so a friend's outline never sits on top of
// the handles the user is dragging.
const REMOTE_Z = SELECTION_Z - 1

interface Props {
  // The local user's in-progress marquee rubber-band (world coords), if any.
  marquee: { x0: number; y0: number; x1: number; y1: number } | null
  // Friends' broadcast cursors, carrying their live marquee and multi-selection ids.
  friendCursors?: Record<string, CursorPos>
  strokes: Stroke[]
  cam: Camera
}

// Presentational overlay for selection chrome that isn't the local user's handles: the local
// marquee rubber-band, plus each friend's live marquee and multi-selection outlines.
export function RemoteSelectionOverlay({ marquee, friendCursors, strokes, cam }: Props) {
  return (
    <>
      {/* Local marquee rubber-band. */}
      {marquee && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(marquee.x0, marquee.x1) * cam.zoom + cam.panX,
            top: Math.min(marquee.y0, marquee.y1) * cam.zoom + cam.panY,
            width: Math.abs(marquee.x1 - marquee.x0) * cam.zoom,
            height: Math.abs(marquee.y1 - marquee.y0) * cam.zoom,
            border: '1px solid #3d5afe',
            background: 'rgba(61,90,254,0.12)',
            pointerEvents: 'none',
            zIndex: REMOTE_Z,
          }}
        />
      )}

      {/* Friends' marquees + multi-select outlines. */}
      {friendCursors &&
        Object.entries(friendCursors).map(([fuid, c]) => {
          const els: React.ReactNode[] = []
          if (c.marquee) {
            const { x0, y0, x1, y1 } = c.marquee
            els.push(
              <div
                key={`fm-${fuid}`}
                style={{
                  position: 'absolute',
                  left: Math.min(x0, x1) * cam.zoom + cam.panX,
                  top: Math.min(y0, y1) * cam.zoom + cam.panY,
                  width: Math.abs(x1 - x0) * cam.zoom,
                  height: Math.abs(y1 - y0) * cam.zoom,
                  border: `1.5px dashed ${c.color}`,
                  background: hexToRgba(c.color, 0.1),
                  pointerEvents: 'none',
                  zIndex: REMOTE_Z,
                }}
              />,
            )
          }
          if (c.selectedIds && c.selectedIds.length >= 2) {
            c.selectedIds.forEach((id) => {
              const s = strokes.find((k) => k.id === id)
              if (!s) return
              const a = textAABB(s.data)
              els.push(
                <div
                  key={`fs-${fuid}-${id}`}
                  style={{
                    position: 'absolute',
                    left: a.minX * cam.zoom + cam.panX,
                    top: a.minY * cam.zoom + cam.panY,
                    width: (a.maxX - a.minX) * cam.zoom,
                    height: (a.maxY - a.minY) * cam.zoom,
                    border: `1.5px dashed ${c.color}`,
                    pointerEvents: 'none',
                    zIndex: REMOTE_Z,
                  }}
                />,
              )
            })
          }
          return els
        })}
    </>
  )
}

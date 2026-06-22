import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { documentKind, DEFAULT_DOCUMENT_KIND } from '../canvas/documents/registry'
import { newCanvasId, createCanvas } from '../../data/canvases'
import { addDayLink } from './planner/plannerLinks'

interface CreateCanvasOptions {
  // Document-kind template to create from (defaults to the plain Canvas).
  kindId?: string
  // Document name. Falls back to the kind's default title (or 'Untitled Canvas') when blank.
  title?: string
  // Link the new canvas to a Planner day on create (used by the Planner's Add-document flow).
  linkTo?: { uid: string; iso: string }
}

// Creates a new canvas (delegating the Firestore/RTDB writes to the canvases repository),
// holds the in-flight `creating`/`creatingId` state for the overlay, and navigates to
// the new canvas. Limit enforcement stays in the caller so it can surface a modal.
export function useCreateCanvas(uid: string) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const createCanvasFlow = async ({ kindId = DEFAULT_DOCUMENT_KIND, title, linkTo }: CreateCanvasOptions = {}) => {
    setCreating(true)
    try {
      const kind = documentKind(kindId)
      const finalTitle = title?.trim() || kind.defaultTitle || 'Untitled Canvas'
      const canvasId = newCanvasId()
      setCreatingId(canvasId)

      // Run the write alongside a minimum delay so the creating overlay doesn't flash.
      await Promise.all([
        createCanvas(canvasId, { uid, title: finalTitle, width: kind.width, height: kind.height, kindId: kind.id }),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ])

      // Pin the new canvas to its Planner day, if requested, before navigating into it.
      if (linkTo) {
        await addDayLink(linkTo.uid, linkTo.iso, {
          canvasId,
          title: finalTitle,
          kind: kind.id,
        }).catch((e) => console.error('Failed to link new canvas to day', e))
      }

      navigate(`/canvas/${canvasId}`)
    } finally {
      setCreating(false)
      setCreatingId(null)
    }
  }

  return { creating, creatingId, createCanvas: createCanvasFlow }
}

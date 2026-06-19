import { useEffect, useRef } from 'react'
import type { ToolType } from '../../../lib/types'

interface Options {
  toolRef: React.MutableRefObject<ToolType>
  setTool: (t: ToolType) => void
  onUndo: () => void
  onRedo: () => void
}

// Global keyboard shortcuts for the canvas: Ctrl/Cmd+Z undo, +Shift redo, and hold
// Space to temporarily switch to the hand (pan) tool, restoring the previous tool on
// release. Ignores typing in inputs/textareas.
export function useCanvasKeyboard({ toolRef, setTool, onUndo, onRedo }: Options) {
  const prevToolRef = useRef<ToolType>('pen')
  const spaceActivatedHandRef = useRef(false)

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        onRedo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        onUndo()
        return
      }
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault()
        if (toolRef.current !== 'hand') {
          prevToolRef.current = toolRef.current
          spaceActivatedHandRef.current = true
          setTool('hand')
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        if (spaceActivatedHandRef.current) {
          spaceActivatedHandRef.current = false
          if (toolRef.current === 'hand') {
            setTool(prevToolRef.current)
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [onUndo, onRedo, setTool, toolRef])
}

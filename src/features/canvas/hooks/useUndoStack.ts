import { useRef, useCallback } from 'react'
import type { Stroke } from '../../../lib/types'

export function useUndoStack() {
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<Omit<Stroke, 'id'>[]>([])

  const push = useCallback((strokeId: string) => {
    undoStack.current.push(strokeId)
    redoStack.current = []
  }, [])

  const pop = useCallback((): string | undefined => {
    return undoStack.current.pop()
  }, [])

  const pushRedo = useCallback((stroke: Omit<Stroke, 'id'>) => {
    redoStack.current.push(stroke)
  }, [])

  const popRedo = useCallback((): Omit<Stroke, 'id'> | undefined => {
    return redoStack.current.pop()
  }, [])

  return { push, pop, pushRedo, popRedo }
}

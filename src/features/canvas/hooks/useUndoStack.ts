import { useRef, useCallback } from 'react'

export function useUndoStack() {
  const stackRef = useRef<string[]>([])

  const push = useCallback((strokeId: string) => {
    stackRef.current.push(strokeId)
  }, [])

  const pop = useCallback((): string | undefined => {
    return stackRef.current.pop()
  }, [])

  return { push, pop }
}

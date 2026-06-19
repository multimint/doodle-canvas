import { useState, useEffect } from 'react'

// Tracks whether the viewport is below a breakpoint, so the Dashboard can swap between
// its mobile and desktop layouts.
export function useIsMobile(bp = 760) {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < bp : false,
  )
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp)
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return m
}

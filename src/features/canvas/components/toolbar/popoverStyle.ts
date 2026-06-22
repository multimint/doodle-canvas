import type { CSSProperties } from 'react'

// Anchor a toolbar popover above the bar (horizontal/mobile) or to its right (vertical/desktop).
export function popoverAnchor(horizontal: boolean): CSSProperties {
  return horizontal
    ? { bottom: 'calc(100% + 8px)', left: 0 }
    : { left: 'calc(100% + 12px)', top: 0 }
}

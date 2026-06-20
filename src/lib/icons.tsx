const M_PATHS: Record<string, string> = {
  pen:      '<path d="M4 20l4.6-1.3L19 8.3 15.7 5 5.3 15.4 4 20z"/><path d="M14.5 6.2l3.3 3.3"/>',
  brush:    '<line x1="18" y1="2" x2="22" y2="6"/><path d="M7.5 20.5L2 22l1.5-5.5L17.5 2.5a2.121 2.121 0 0 1 3 3z"/>',
  spray:    '<rect x="7" y="10" width="8" height="11" rx="2.5"/><path d="M9 10V7h4v3"/><path d="M13 8h2.5"/><circle cx="17.5" cy="6" r="0.7" fill="currentColor" stroke="none"/><circle cx="19" cy="7.5" r="0.7" fill="currentColor" stroke="none"/><circle cx="17.5" cy="9" r="0.7" fill="currentColor" stroke="none"/>',
  marker:   '<path d="M14 4.5l5.5 5.5-9 9-5.5.9.9-5.5z"/><path d="M3 22h6"/>',
  line:     '<path d="M5 19L19 5"/>',
  square:   '<rect x="4.5" y="6" width="15" height="12" rx="3"/>',
  circle:   '<circle cx="12" cy="12" r="7.6"/>',
  text:     '<path d="M5 7V5.2h14V7M12 5.2v13.6M9.4 18.8h5.2"/>',
  eraser:   '<path d="M8.5 18.5 3.8 13.8a1.8 1.8 0 0 1 0-2.5l7-7a1.8 1.8 0 0 1 2.5 0l4.4 4.4a1.8 1.8 0 0 1 0 2.5l-6.6 6.6H8.5z"/><path d="M5.5 19.5h13"/>',
  search:   '<circle cx="11" cy="11" r="6.3"/><path d="M20 20l-4.2-4.2"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  share:    '<path d="M12 15.5V4.5M8.2 7.8 12 4l3.8 3.8"/><path d="M5.5 12.5V18a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5.5"/>',
  undo:     '<path d="M9 7.5 4 12.5l5 5"/><path d="M4 12.5h10.5a5 5 0 0 1 0 10H10"/>',
  redo:     '<path d="M15 7.5l5 5-5 5"/><path d="M20 12.5H9.5a5 5 0 0 0 0 10H14"/>',
  back:     '<path d="M15 5l-7 7 7 7"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7"/>',
  dots:     '<circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  grid:     '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  users:    '<circle cx="9.2" cy="8.8" r="3.4"/><path d="M3.6 19.2a5.6 5.6 0 0 1 11.2 0"/><path d="M16 6.2a3.1 3.1 0 0 1 0 5.6M17 19.2a4.9 4.9 0 0 0-2.6-4.3"/>',
  clock:    '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  download: '<path d="M12 4v10M8 10.5l4 4 4-4"/><path d="M5 18.5h14"/>',
  wiggle:   '<path d="M3 12 Q5.5 7 8 12 Q10.5 17 13 12 Q15.5 7 18 12 Q19.5 15 21 12"/>',
  hand:     '<path d="M7 11.5V5.5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0v4.5m0-3a1.5 1.5 0 0 1 3 0v5.5M7 11.5a1.5 1.5 0 0 0-3 0v3a7 7 0 0 0 14 0v-5.5a1.5 1.5 0 0 0-3 0"/>',
  minus:    '<path d="M5 12h14"/>',
  'zoom-in':  '<circle cx="11" cy="11" r="6.3"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="6.3"/><path d="M20 20l-4.2-4.2M8 11h6"/>',
}

interface IconProps {
  name: string
  size?: number
  sw?: number
  color?: string
  style?: React.CSSProperties
}

export function Icon({ name, size = 22, sw = 2, color, style }: IconProps) {
  return (
    <span
      style={{ display: 'inline-flex', color: color || 'currentColor', ...style }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${M_PATHS[name] ?? ''}</svg>`,
      }}
    />
  )
}

export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{ display: 'inline-flex' }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 48 48"><path fill="#4285F4" d="M45 24c0-1.5-.1-3-.4-4.4H24v8.4h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1C42.7 36.3 45 30.7 45 24z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5C3 17.1 2 20.4 2 24s1 6.9 2.5 9.9l7.3-5.6z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.1 12.2-9.1z"/></svg>`,
      }}
    />
  )
}

export const MCOLORS = ['#3d5afe', '#ff5d73', '#ffb01f', '#15cf7f', '#9b5de5', '#ff62b0', '#12c2e9']

import { ICON_PATHS } from '../assets/icons'

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
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] ?? ''}</svg>`,
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

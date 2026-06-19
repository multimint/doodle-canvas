import { useState, useEffect } from 'react'
import { Icon, GoogleG } from '../../lib/icons'

// The sign-in card and its small presentational companions (brand mark, live-count pill,
// hand-drawn squiggle underline, rotating word). The card is content-only; layout and
// auth wiring live in GoogleSignIn.

/* ---------- Brand ---------- */
export function Brand({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const big = size === 'lg'
  return (
    <div className="m-row m-g10">
      <div style={{ width: big ? 34 : 30, height: big ? 34 : 30, borderRadius: big ? 11 : 9, background: 'var(--m-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--m-shadow-sm)' }}>
        <Icon name="pen" size={big ? 18 : 16} color="#fff" />
      </div>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: big ? 18 : 16, color: 'var(--m-ink)' }}>Doodle Canvas</span>
    </div>
  )
}

/* ---------- LivePill ---------- */
export function LivePill() {
  return (
    <div className="m-row m-g8" style={{ padding: '7px 13px 7px 11px', borderRadius: 999, background: 'var(--m-surface)', boxShadow: 'var(--m-shadow-sm), inset 0 0 0 1px var(--m-line)' }}>
      <span className="m-live-dot" />
      <span style={{ fontSize: 12.5, color: 'var(--m-ink-2)', fontWeight: 500 }}><b style={{ color: 'var(--m-ink)', fontWeight: 700 }}>1,204</b> doodling now</span>
    </div>
  )
}

/* ---------- wobbly hand-drawn underline ---------- */
function Squiggle({ color = 'var(--m-primary)', width = 120, height = 13, sw = 4, style }: {
  color?: string; width?: number | string; height?: number; sw?: number; style?: React.CSSProperties
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 120 13" fill="none" preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible', ...style }}>
      <path d="M4 8 C 22 2, 38 12, 56 7 S 90 2, 116 8" stroke={color} strokeWidth={sw}
        strokeLinecap="round" filter="url(#dood-boil)" />
    </svg>
  )
}

/* ---------- RotWord ---------- */
function RotWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % words.length), 2100)
    return () => clearInterval(t)
  }, [words.length])
  return <span key={i} className="m-word">{words[i]}</span>
}

/* ---------- SignInPanel ---------- */
export function SignInPanel({ onSignIn, onGuest, guestLoading, error, compact = false, sheet = false }: {
  onSignIn: () => void; onGuest: () => void; guestLoading: boolean; error: string | null
  compact?: boolean; sheet?: boolean
}) {
  const d = (n: number) => ({ animationDelay: `${n}s` })
  return (
    <div className="m-card m-col m-enter" style={{
      width: sheet ? '100%' : (compact ? 'min(94vw, 412px)' : 444),
      maxWidth: sheet ? '100%' : '94vw',
      padding: sheet ? '26px 24px calc(24px + env(safe-area-inset-bottom))' : (compact ? '34px 28px' : '44px 48px'),
      borderRadius: sheet ? '30px 30px 0 0' : 30,
      boxShadow: sheet ? '0 -14px 38px rgba(20,23,45,.14)' : 'var(--m-shadow-lg)',
      border: sheet ? 'none' : '1px solid var(--m-line)',
      borderTop: sheet ? '1px solid var(--m-line)' : undefined,
      gap: compact ? 16 : 19,
      ...d(0.05),
    }}>
      {sheet && <div style={{ height: 2 }} />}
      <div className="m-eyebrow m-enter" style={d(0.12)}>Collaborative whiteboard</div>
      <div className="m-h1 m-enter" style={{ fontSize: compact ? 36 : 46, lineHeight: 1.12, ...d(0.18) }}>
        A space to<br />
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <RotWord words={['sketch', 'plan', 'brainstorm', 'riff', 'play']} />
          <Squiggle color="var(--m-primary)" width="100%" height={10} sw={4.5}
            style={{ position: 'absolute', left: 0, right: 0, bottom: -4 }} />
        </span>
        <br />together.
      </div>
      <div className="m-lead m-enter" style={{ fontSize: compact ? 16 : 18, fontFamily: 'var(--disp)', lineHeight: 1.45, ...d(0.26) }}>
        Sign in to open your canvases and pick up exactly where you and your collaborators left off.
      </div>
      <div className="m-col m-g10 m-enter" style={{ marginTop: 4, ...d(0.34) }}>
        <button className="m-btn m-btn-outline m-btn-lg" style={{ width: '100%' }} onClick={onSignIn}>
          <GoogleG /> Continue with Google
        </button>
        <button className="m-btn m-btn-ghost" style={{ width: '100%' }} onClick={onGuest} disabled={guestLoading}>
          {guestLoading ? 'Starting…' : 'Explore as a guest'}
        </button>
      </div>
      {error && <p style={{ fontSize: 13.5, color: 'var(--m-coral)', textAlign: 'center', margin: 0 }}>{error}</p>}
      <div className="m-tiny m-faint m-enter" style={{ marginTop: 2, ...d(0.42) }}>
        By continuing you agree to our <u>Terms</u> &amp; <u>Privacy</u>.
      </div>
    </div>
  )
}

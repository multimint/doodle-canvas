import { useState, useEffect, useRef } from 'react'
import { MCOLORS } from '../../lib/icons'

// All the purely decorative background for the sign-in screen: parallax orbs/shapes and
// the self-drawing doodle wreath. None of it is interactive; Stage is the only export.

/* ---------- tiny decorative element ---------- */
function Deco({ type, c, sz, w = 3 }: { type: string; c: string; sz: number; w?: number }) {
  if (type === 'dot') return <span style={{ display: 'block', width: sz, height: sz, borderRadius: '50%', background: c }} />
  if (type === 'ring') return <span style={{ display: 'block', width: sz, height: sz, borderRadius: '50%', boxShadow: `inset 0 0 0 ${w}px ${c}` }} />
  if (type === 'sq') return <span style={{ display: 'block', width: sz, height: sz, borderRadius: Math.max(2, sz * 0.18), background: c, transform: 'rotate(45deg)' }} />
  if (type === 'sqo') return <span style={{ display: 'block', width: sz, height: sz, borderRadius: Math.max(2, sz * 0.18), boxShadow: `inset 0 0 0 ${w}px ${c}`, transform: 'rotate(45deg)' }} />
  if (type === 'tri') return <span style={{ display: 'block', width: 0, height: 0, borderLeft: `${sz / 2}px solid transparent`, borderRight: `${sz / 2}px solid transparent`, borderBottom: `${sz}px solid ${c}` }} />
  if (type === 'plus') {
    const t = Math.max(2, Math.round(sz * 0.22))
    return <span style={{ display: 'block', width: sz, height: sz, background: `linear-gradient(${c},${c}) center/100% ${t}px no-repeat, linear-gradient(${c},${c}) center/${t}px 100% no-repeat` }} />
  }
  if (type === 'spark') return (
    <svg width={sz} height={sz} viewBox="0 0 24 24" style={{ display: 'block', overflow: 'visible' }}>
      <path d="M12 1 L12 23 M1 12 L23 12 M4.5 4.5 L19.5 19.5 M19.5 4.5 L4.5 19.5" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
  return null
}

/* ---------- parallax field: orbs + shapes ---------- */
function ParallaxField() {
  const C = MCOLORS
  const orbs = [
    { l: '7%',  t: '15%', sz: 230, c: C[0], op: .12, depth: 0.28, blur: 16 },
    { l: '73%', t: '11%', sz: 180, c: C[1], op: .12, depth: 0.34, blur: 16 },
    { l: '11%', t: '61%', sz: 200, c: C[4], op: .11, depth: 0.26, blur: 18 },
    { l: '71%', t: '59%', sz: 170, c: C[3], op: .12, depth: 0.32, blur: 16 },
    { l: '45%', t: '38%', sz: 170, c: C[2], op: .06, depth: 0.18, blur: 22 },
  ]
  const bits: { type: string; l: string; t: string; sz: number; c: string; op: number; depth: number; fl?: number; fd?: number; rot?: string; w?: number }[] = [
    { type: 'dot',   l: '29%', t: '24%', sz: 11, c: C[2], op: .95, depth: 1.55, fl: 1, fd: 7.2, rot: '0deg' },
    { type: 'sq',    l: '74%', t: '34%', sz: 13, c: C[3], op: .9,  depth: 1.6,  fl: 1, fd: 8.1, rot: '0deg' },
    { type: 'dot',   l: '64%', t: '79%', sz: 12, c: C[5], op: .92, depth: 1.5 },
    { type: 'spark', l: '22%', t: '40%', sz: 22, c: C[6], op: .85, depth: 1.7,  fl: 1, fd: 6.4, rot: '-8deg' },
    { type: 'ring',  l: '80%', t: '66%', sz: 18, c: C[1], op: .8,  depth: 1.45, w: 3 },
    { type: 'tri',   l: '34%', t: '78%', sz: 15, c: C[2], op: .85, depth: 1.62, fl: 1, fd: 7.6, rot: '6deg' },
    { type: 'dot',   l: '17%', t: '30%', sz: 8,  c: C[0], op: .8,  depth: 1.05, fl: 1, fd: 8.8, rot: '0deg' },
    { type: 'dot',   l: '83%', t: '22%', sz: 9,  c: C[1], op: .8,  depth: 1.1 },
    { type: 'plus',  l: '60%', t: '17%', sz: 16, c: C[4], op: .7,  depth: 0.95, fl: 1, fd: 9,   rot: '0deg' },
    { type: 'sqo',   l: '14%', t: '78%', sz: 16, c: C[6], op: .7,  depth: 1.0,  w: 3 },
    { type: 'ring',  l: '88%', t: '46%', sz: 13, c: C[3], op: .7,  depth: 1.12, fl: 1, fd: 8.2, rot: '0deg', w: 3 },
    { type: 'dot',   l: '40%', t: '14%', sz: 7,  c: C[5], op: .75, depth: 0.9 },
    { type: 'dot',   l: '52%', t: '86%', sz: 8,  c: C[0], op: .75, depth: 1.0,  fl: 1, fd: 7.8, rot: '0deg' },
    { type: 'spark', l: '90%', t: '78%', sz: 16, c: C[2], op: .7,  depth: 1.08 },
    { type: 'dot',   l: '24%', t: '58%', sz: 6,  c: C[4], op: .5,  depth: 0.55 },
    { type: 'dot',   l: '78%', t: '52%', sz: 6,  c: C[3], op: .5,  depth: 0.6,  fl: 1, fd: 10,  rot: '0deg' },
    { type: 'dot',   l: '46%', t: '66%', sz: 5,  c: C[1], op: .45, depth: 0.5 },
    { type: 'dot',   l: '57%', t: '46%', sz: 5,  c: C[6], op: .4,  depth: 0.45 },
    { type: 'dot',   l: '36%', t: '50%', sz: 5,  c: C[2], op: .4,  depth: 0.5,  fl: 1, fd: 9.4, rot: '0deg' },
    { type: 'dot',   l: '68%', t: '30%', sz: 6,  c: C[5], op: .5,  depth: 0.58 },
  ]
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        {orbs.map((o, i) => (
          <div key={i} className="m-dood" style={{ left: o.l, top: o.t, ['--depth' as string]: o.depth }}>
            <div className="m-blob" style={{ width: o.sz, height: o.sz, background: o.c, opacity: o.op, filter: `blur(${o.blur}px)`, animationDelay: `${i * 0.7}s`, ['--rot' as string]: '0deg', position: 'static' }} />
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
        {bits.map((b, i) => {
          const inner = <Deco type={b.type} c={b.c} sz={b.sz} w={b.w} />
          return (
            <div key={i} className="m-dood" style={{ left: b.l, top: b.t, ['--depth' as string]: b.depth, opacity: b.op }}>
              {b.fl
                ? <div className="m-dood-float" style={{ ['--fdur' as string]: `${b.fd}s`, ['--rot' as string]: b.rot }}>{inner}</div>
                : inner}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ---------- self-drawing doodle wreath ---------- */
const DOODLE_SHAPES = [
  'M6 58 q11 -25 22 0 t22 0 t22 0 t22 0',
  'M50 16 C26 16 14 50 40 62 C72 75 92 38 70 18 C57 9 44 13 50 18',
  'M50 10 l11 24 26 3 -19 18 5 26 -23 -13 -23 13 5 -26 -19 -18 26 -3z',
  'M50 82 C18 56 24 22 50 40 C76 22 82 56 50 82 Z',
  'M58 50 c-8 -18 -34 -10 -34 12 c0 26 38 32 52 4 c12 -26 -16 -50 -42 -36',
  'M12 50 L84 50 M62 30 L86 50 62 70',
  'M50 10 L50 90 M10 50 L90 50 M22 22 L78 78 M78 22 L22 78',
  'M8 56 C40 76 68 76 92 48',
  'M10 50 q13 -22 26 0 t26 0 t26 0',
  'M52 12 L26 52 L48 52 L40 90 L76 44 L52 44 Z',
  'M50 14 L86 78 L14 78 Z',
  'M20 50 L80 50 M50 20 L50 80',
  'M22 52 L42 74 L82 26',
  'M26 26 L74 74 M74 26 L26 74',
  'M50 12 L80 50 L50 88 L20 50 Z',
  'M30 22 L70 22 L88 50 L70 78 L30 78 L12 50 Z',
  'M38 50 C38 36 20 36 20 50 C20 64 38 64 50 50 C62 36 80 36 80 50 C80 64 62 64 50 50',
  'M50 30 A20 20 0 1 0 50.1 30 M50 6 L50 16 M50 84 L50 94 M6 50 L16 50 M84 50 L94 50',
  'M64 16 A38 38 0 1 0 64 84 A30 30 0 1 1 64 16 Z',
  'M50 50 q-16 -20 0 -28 q16 8 0 28 M50 50 q20 -16 28 0 q-8 16 -28 0 M50 50 q16 20 0 28 q-16 -8 0 -28 M50 50 q-20 16 -28 0 q8 -16 28 0',
  'M50 14 A36 36 0 1 0 50.1 14 M38 44 L38 50 M62 44 L62 50 M36 64 Q50 78 64 64',
  'M30 72 Q48 12 80 34 Q62 80 30 72 Z M36 64 Q54 50 70 42',
  'M20 26 H80 V60 H46 L30 78 L34 60 H20 Z',
  'M50 12 C28 46 34 78 50 78 C66 78 72 46 50 12 Z',
  'M18 72 L26 32 L42 56 L50 26 L58 56 L74 32 L82 72 Z',
  'M22 54 L50 24 L78 54 M30 48 L30 80 L70 80 L70 48',
  'M12 40 L28 60 L44 40 L60 60 L76 40 L88 56',
  'M50 18 A32 32 0 1 0 50.1 18 M50 34 A16 16 0 1 0 50.1 34',
  'M30 18 L30 84 M30 22 L76 36 L30 52',
  'M50 20 L50 80 M20 50 L80 50 M28 28 L72 72 M72 28 L28 72',
]

const ROUGH_FILTERS = [
  { id: 'dood-r0', bf: 0.016, sc: 3.0, seed: 2 },
  { id: 'dood-r1', bf: 0.021, sc: 2.5, seed: 9 },
  { id: 'dood-r2', bf: 0.014, sc: 3.4, seed: 5 },
  { id: 'dood-r3', bf: 0.024, sc: 2.2, seed: 13 },
]

function RoughDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        {ROUGH_FILTERS.map(f => (
          <filter key={f.id} id={f.id} x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency={f.bf} numOctaves="2" seed={f.seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={f.sc} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  )
}

function DoodleSlot({ left, top, size, sw, rot, fdur, drawDur, holdDur, eraseDur, startDelay, filterId }: {
  left: string; top: string; size: number; sw: number; rot: string
  fdur: number; drawDur: number; holdDur: number; eraseDur: number; startDelay: number; filterId: string
}) {
  const C = MCOLORS
  const [st, setSt] = useState({ off: 1, op: 0, trans: 'none', si: 0, ci: 0 })

  useEffect(() => {
    let si = Math.floor(Math.random() * DOODLE_SHAPES.length)
    let ci = Math.floor(Math.random() * C.length)
    let to: ReturnType<typeof setTimeout>
    let alive = true
    const set = (p: Partial<typeof st>) => { if (alive) setSt(s => ({ ...s, ...p })) }
    const drawTrans = `stroke-dashoffset ${drawDur}s cubic-bezier(.45,.05,.3,1), opacity .35s ease`
    const eraseTrans = `stroke-dashoffset ${eraseDur}s cubic-bezier(.55,.1,.4,1), opacity ${eraseDur}s ease-in`

    function draw() { set({ off: 0, op: 1, trans: drawTrans, si, ci }); to = setTimeout(hold, drawDur * 1000) }
    function hold() { to = setTimeout(erase, holdDur * 1000) }
    function erase() { set({ off: 1, op: 0, trans: eraseTrans }); to = setTimeout(swap, eraseDur * 1000) }
    function swap() {
      let n = si; while (n === si) n = Math.floor(Math.random() * DOODLE_SHAPES.length)
      let m = ci; while (m === ci) m = Math.floor(Math.random() * C.length)
      si = n; ci = m
      set({ off: 1, op: 0, trans: 'none', si, ci })
      to = setTimeout(draw, 90)
    }
    set({ off: 1, op: 0, trans: 'none', si, ci })
    to = setTimeout(draw, startDelay * 1000)
    return () => { alive = false; clearTimeout(to) }
  }, [])

  return (
    <div style={{ position: 'absolute', left, top }}>
      <div className="m-dood-float" style={{ ['--rot' as string]: rot, ['--fdur' as string]: `${fdur}s` }}>
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible', display: 'block' }}>
          <path
            d={DOODLE_SHAPES[st.si]}
            stroke={C[st.ci]}
            strokeWidth={sw}
            pathLength="1"
            filter={`url(#${filterId})`}
            style={{ fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: 1, strokeDashoffset: st.off, opacity: st.op, transition: st.trans }}
          />
        </svg>
      </div>
    </div>
  )
}

function DoodleField({ compact = false }: { compact?: boolean }) {
  const desktopSlots = [
    { l: '18%', t: '16%', sz: 116, sw: 7, rot: '-6deg',  fdur: 7.5, draw: 1.6, hold: 2.8, erase: 1.1, delay: 0.2 },
    { l: '68%', t: '13%', sz: 96,  sw: 7, rot: '8deg',   fdur: 8.2, draw: 1.9, hold: 3.4, erase: 1.3, delay: 1.1 },
    { l: '47%', t: '7%',  sz: 62,  sw: 6.5, rot: '0deg', fdur: 6.0, draw: 1.2, hold: 2.2, erase: 0.9, delay: 2.0 },
    { l: '8%',  t: '48%', sz: 104, sw: 7, rot: '-10deg', fdur: 8.8, draw: 2.1, hold: 3.0, erase: 1.4, delay: 0.6 },
    { l: '79%', t: '46%', sz: 96,  sw: 7, rot: '4deg',   fdur: 7.2, draw: 1.5, hold: 2.6, erase: 1.0, delay: 1.6 },
    { l: '21%', t: '70%', sz: 94,  sw: 6.5, rot: '6deg', fdur: 8.0, draw: 1.8, hold: 3.6, erase: 1.2, delay: 0.9 },
    { l: '71%', t: '68%', sz: 96,  sw: 6.5, rot: '-8deg',fdur: 7.6, draw: 1.7, hold: 2.4, erase: 1.1, delay: 2.6 },
    { l: '45%', t: '84%', sz: 110, sw: 7, rot: '2deg',   fdur: 6.6, draw: 1.4, hold: 3.2, erase: 1.0, delay: 1.4 },
  ]
  const mobileSlots = [
    { l: '8%',  t: '9%',  sz: 104, sw: 7, rot: '-6deg',  fdur: 7.5, draw: 1.6, hold: 2.8, erase: 1.1, delay: 0.2 },
    { l: '64%', t: '7%',  sz: 96,  sw: 7, rot: '8deg',   fdur: 8.2, draw: 1.9, hold: 3.4, erase: 1.3, delay: 1.1 },
    { l: '40%', t: '4%',  sz: 58,  sw: 6.5, rot: '0deg', fdur: 6.0, draw: 1.2, hold: 2.2, erase: 0.9, delay: 2.0 },
    { l: '4%',  t: '34%', sz: 96,  sw: 7, rot: '-10deg', fdur: 8.8, draw: 2.1, hold: 3.0, erase: 1.4, delay: 0.6 },
    { l: '70%', t: '30%', sz: 92,  sw: 7, rot: '4deg',   fdur: 7.2, draw: 1.5, hold: 2.6, erase: 1.0, delay: 1.6 },
    { l: '22%', t: '50%', sz: 88,  sw: 6.5, rot: '6deg', fdur: 8.0, draw: 1.8, hold: 3.6, erase: 1.2, delay: 0.9 },
    { l: '66%', t: '50%', sz: 90,  sw: 6.5, rot: '-8deg',fdur: 7.6, draw: 1.7, hold: 2.4, erase: 1.1, delay: 2.6 },
    { l: '44%', t: '34%', sz: 86,  sw: 7, rot: '2deg',   fdur: 6.6, draw: 1.4, hold: 3.2, erase: 1.0, delay: 1.4 },
  ]
  const slots = compact ? mobileSlots : desktopSlots
  const k = compact ? 0.86 : 1
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      <RoughDefs />
      {slots.map((s, i) => (
        <DoodleSlot key={i} left={s.l} top={s.t} size={s.sz * k} sw={s.sw} rot={s.rot} fdur={s.fdur}
          drawDur={s.draw} holdDur={s.hold} eraseDur={s.erase} startDelay={s.delay}
          filterId={ROUGH_FILTERS[i % ROUGH_FILTERS.length].id} />
      ))}
    </div>
  )
}

/* ---------- SVG doodle filters (roughen + boil) ---------- */
function DoodleDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <filter id="dood-rough" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="dood-boil" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="1" result="n">
            <animate attributeName="baseFrequency" dur="6.3s" repeatCount="indefinite"
              values="0.020;0.024;0.018;0.022;0.020" />
            <animate attributeName="seed" dur="11s" repeatCount="indefinite"
              values="1;4;7;2;1" calcMode="discrete" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur="3.7s" repeatCount="indefinite"
              values="1.1;1.7;1.3;1.6;1.1" />
          </feDisplacementMap>
        </filter>
      </defs>
    </svg>
  )
}

/* ---------- Stage: parallax root ---------- */
export function Stage({ children, compact }: { children?: React.ReactNode; compact?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null)

  function onPointerMove(e: React.PointerEvent) {
    const box = stageRef.current; if (!box) return
    const r = box.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    const amp = compact ? 26 : 44
    box.style.setProperty('--mx', (nx * amp).toFixed(1) + 'px')
    box.style.setProperty('--my', (ny * amp).toFixed(1) + 'px')
  }
  function onPointerLeave() {
    const box = stageRef.current; if (!box) return
    box.style.setProperty('--mx', '0px')
    box.style.setProperty('--my', '0px')
  }

  return (
    <div ref={stageRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}
      className="m-canvas-surface"
      style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}
    >
      <DoodleDefs />
      <ParallaxField />
      <DoodleField compact={compact} />
      {children}
    </div>
  )
}

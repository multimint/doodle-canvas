// Vector sticker draw functions. Each draws centered at (0,0) with `size` as the
// half-width radius. strokeColor controls the outline; fill colors are hardcoded per
// sticker to match the reference design. Intended for use inside a Konva sceneFunc
// via ctx._context (raw CanvasRenderingContext2D) or directly on an HTML canvas.

export const STICKER_IDS = [
  'flower', 'sun', 'moon', 'cloud', 'cat',
  'frog', 'rainbow', 'boba', 'bear', 'mushroom', 'star',
] as const

export const STICKER_LABELS: Record<string, string> = {
  flower:   'Flower',
  sun:      'Sun',
  moon:     'Moon',
  cloud:    'Cloud',
  cat:      'Cat',
  frog:     'Frog',
  rainbow:  'Rainbow',
  boba:     'Boba',
  bear:     'Bear',
  mushroom: 'Mushroom',
  star:     'Star',
}

function drawCuteFace(
  ctx: CanvasRenderingContext2D,
  s: number,
  eyeY: number,
  eyeXDist: number,
  mouthY: number,
  mouthRad: number,
) {
  const prev = ctx.fillStyle
  ctx.fillStyle = ctx.strokeStyle as string
  ctx.beginPath(); ctx.arc(-eyeXDist, eyeY, s * 0.05, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(eyeXDist,  eyeY, s * 0.05, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(0, mouthY, mouthRad, 0, Math.PI, false); ctx.stroke()
  ctx.fillStyle = prev
}

type DrawFn = (ctx: CanvasRenderingContext2D, s: number) => void

const STICKERS: Record<string, DrawFn> = {
  flower: (ctx, s) => {
    ctx.fillStyle = '#ff75a0'
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(i * Math.PI * 2 / 5)
      ctx.beginPath(); ctx.arc(s * 0.4, 0, s * 0.25, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
      ctx.restore()
    }
    ctx.fillStyle = '#feca57'
    ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    drawCuteFace(ctx, s, -s * 0.02, s * 0.08, s * 0.02, s * 0.04)
  },

  sun: (ctx, s) => {
    ctx.fillStyle = '#ff9f43'
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 4)
      ctx.beginPath()
      ctx.moveTo(s * 0.3, -s * 0.1); ctx.lineTo(s * 0.65, 0); ctx.lineTo(s * 0.3, s * 0.1)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.restore()
    }
    ctx.fillStyle = '#ffdd59'
    ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#ffb8b8'
    ctx.beginPath()
    ctx.arc(-s * 0.18, s * 0.05, s * 0.06, 0, Math.PI * 2)
    ctx.arc( s * 0.18, s * 0.05, s * 0.06, 0, Math.PI * 2)
    ctx.fill()
    drawCuteFace(ctx, s, -s * 0.05, s * 0.1, s * 0.05, s * 0.05)
  },

  moon: (ctx, s) => {
    ctx.fillStyle = '#fffa78'
    ctx.beginPath()
    ctx.arc(-s * 0.1, 0, s * 0.48, -Math.PI * 0.7, Math.PI * 0.7, false)
    ctx.arc(-s * 0.38, 0, s * 0.44, Math.PI * 0.55, -Math.PI * 0.55, true)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#ffb8b8'
    ctx.beginPath(); ctx.arc(s * 0.1, s * 0.06, s * 0.05, 0, Math.PI * 2); ctx.fill()
    ctx.save(); ctx.translate(s * 0.14, 0)
    drawCuteFace(ctx, s, -s * 0.06, s * 0.06, s * 0.02, s * 0.04)
    ctx.restore()
  },

  cloud: (ctx, s) => {
    ctx.fillStyle = '#f1f2f6'
    ctx.beginPath()
    ctx.arc(-s * 0.25,  s * 0.05, s * 0.25, Math.PI * 0.5, Math.PI * 1.5)
    ctx.arc( 0,        -s * 0.1,  s * 0.32, Math.PI, 0)
    ctx.arc( s * 0.25,  s * 0.05, s * 0.25, Math.PI * 1.5, Math.PI * 0.5)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#ffb8b8'
    ctx.beginPath()
    ctx.arc(-s * 0.15, s * 0.04, s * 0.05, 0, Math.PI * 2)
    ctx.arc( s * 0.15, s * 0.04, s * 0.05, 0, Math.PI * 2)
    ctx.fill()
    drawCuteFace(ctx, s, -s * 0.02, s * 0.1, s * 0.03, s * 0.04)
  },

  cat: (ctx, s) => {
    const prev = ctx.strokeStyle
    ctx.fillStyle = '#ffb142'
    ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.48, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-s*0.38,-s*0.15); ctx.lineTo(-s*0.45,-s*0.55); ctx.lineTo(-s*0.12,-s*0.25); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo( s*0.38,-s*0.15); ctx.lineTo( s*0.45,-s*0.55); ctx.lineTo( s*0.12,-s*0.25); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#ffb8b8'
    ctx.beginPath(); ctx.moveTo(-s*0.32,-s*0.18); ctx.lineTo(-s*0.38,-s*0.44); ctx.lineTo(-s*0.16,-s*0.24); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo( s*0.32,-s*0.18); ctx.lineTo( s*0.38,-s*0.44); ctx.lineTo( s*0.16,-s*0.24); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#1c1a27'
    ctx.beginPath(); ctx.arc(-s*0.18, 0, s*0.1, 0, Math.PI*2); ctx.arc(s*0.18, 0, s*0.1, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(-s*0.21,-s*0.03, s*0.04, 0, Math.PI*2); ctx.arc(s*0.15,-s*0.03, s*0.04, 0, Math.PI*2); ctx.fill()
    ctx.beginPath(); ctx.arc(-s*0.15, s*0.04, s*0.02, 0, Math.PI*2); ctx.arc(s*0.21, s*0.04, s*0.02, 0, Math.PI*2); ctx.fill()
    ctx.strokeStyle = '#1c1a27'
    ctx.beginPath()
    ctx.moveTo(0, s*0.06); ctx.quadraticCurveTo(-s*0.06, s*0.14, -s*0.12, s*0.08)
    ctx.moveTo(0, s*0.06); ctx.quadraticCurveTo( s*0.06, s*0.14,  s*0.12, s*0.08)
    ctx.stroke()
    ctx.strokeStyle = prev
  },

  frog: (ctx, s) => {
    ctx.fillStyle = '#7bed9f'
    ctx.beginPath(); ctx.arc(-s*0.22,-s*0.1, s*0.18, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc( s*0.22,-s*0.1, s*0.18, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(0, s*0.1, s*0.45, s*0.35, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#ffb8b8'
    ctx.beginPath(); ctx.arc(-s*0.25, s*0.12, s*0.06, 0, Math.PI*2); ctx.fill()
    ctx.beginPath(); ctx.arc( s*0.25, s*0.12, s*0.06, 0, Math.PI*2); ctx.fill()
    drawCuteFace(ctx, s, -s*0.1, s*0.22, s*0.1, s*0.08)
  },

  rainbow: (ctx, s) => {
    const bands = ['#ff4757', '#ffa502', '#eccc68', '#2ed573', '#1e90ff']
    const prevWidth = ctx.lineWidth
    bands.forEach((c, i) => {
      ctx.strokeStyle = c
      ctx.lineWidth = s * 0.09
      ctx.beginPath(); ctx.arc(0, s*0.25, s*0.55 - i*s*0.08, Math.PI, 0, false); ctx.stroke()
    })
    ctx.lineWidth = prevWidth
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(-s*0.48, s*0.25, s*0.16, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(-s*0.32, s*0.25, s*0.14, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc( s*0.32, s*0.25, s*0.14, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc( s*0.48, s*0.25, s*0.16, 0, Math.PI*2); ctx.fill(); ctx.stroke()
  },

  boba: (ctx, s) => {
    ctx.fillStyle = '#ff781f'
    ctx.fillRect(s*0.05, -s*0.6, s*0.08, s*0.3); ctx.strokeRect(s*0.05, -s*0.6, s*0.08, s*0.3)
    ctx.fillStyle = '#ffeaa7'
    ctx.beginPath()
    ctx.moveTo(-s*0.25,-s*0.3); ctx.lineTo(s*0.25,-s*0.3); ctx.lineTo(s*0.18,s*0.45); ctx.lineTo(-s*0.18,s*0.45)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#2d3436'
    ctx.beginPath()
    ctx.arc(-s*0.08, s*0.35, 4, 0, Math.PI*2)
    ctx.arc( s*0.06, s*0.38, 4, 0, Math.PI*2)
    ctx.arc(-s*0.02, s*0.25, 4, 0, Math.PI*2)
    ctx.arc( s*0.1,  s*0.28, 4, 0, Math.PI*2)
    ctx.fill()
    drawCuteFace(ctx, s, -s*0.05, s*0.1, 0, s*0.04)
  },

  bear: (ctx, s) => {
    ctx.fillStyle = '#cc8e35'
    ctx.beginPath(); ctx.arc(-s*0.3,-s*0.18, s*0.16, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc( s*0.3,-s*0.18, s*0.16, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, 0, s*0.42, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(0, s*0.1, s*0.14, 0, Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#000000'
    ctx.beginPath(); ctx.arc(0, s*0.06, 3, 0, Math.PI*2); ctx.fill()
    drawCuteFace(ctx, s, -s*0.08, s*0.16, s*0.12, 2)
  },

  mushroom: (ctx, s) => {
    ctx.fillStyle = '#fff5e6'
    ctx.fillRect(-s*0.15, s*0.05, s*0.3, s*0.45); ctx.strokeRect(-s*0.15, s*0.05, s*0.3, s*0.45)
    ctx.fillStyle = '#ff4d4d'
    ctx.beginPath(); ctx.arc(0, s*0.05, s*0.5, Math.PI, 0, false); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(-s*0.2,-s*0.15, s*0.08, 0, Math.PI*2); ctx.fill()
    ctx.beginPath(); ctx.arc( s*0.2,-s*0.18, s*0.07, 0, Math.PI*2); ctx.fill()
    ctx.beginPath(); ctx.arc( 0,    -s*0.3,  s*0.09, 0, Math.PI*2); ctx.fill()
    drawCuteFace(ctx, s, s*0.18, s*0.06, s*0.26, 2)
  },

  star: (ctx, s) => {
    ctx.fillStyle = '#ffea00'
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 === 0) ? s * 0.55 : s * 0.24
      const a = Math.PI * 2 * i / 10 - Math.PI / 2
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath(); ctx.fill(); ctx.stroke()
    drawCuteFace(ctx, s, -s*0.04, s*0.08, s*0.04, s*0.03)
  },
}

export function drawSticker(
  ctx: CanvasRenderingContext2D,
  id: string,
  size: number,
  strokeColor = '#000000',
): void {
  const fn = STICKERS[id] ?? STICKERS['star']
  ctx.save()
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = Math.max(1.5, size * 0.045)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  fn(ctx, size)
  ctx.restore()
}

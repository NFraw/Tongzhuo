/**
 * TextureFactory — lazily generates PIXI.Texture objects from offscreen canvas.
 *
 * Each card is rasterized once at `CARD_W * dpr × CARD_H * dpr` (DPR capped at 2)
 * and cached in a Map. Total memory for all 54 face textures + 1 back texture is
 * well under 1 MB even at DPR=2.
 */
import { Texture } from 'pixi.js'
import type { Card } from '@huiming/core-shared'

export const CARD_W = 72
export const CARD_H = 100

const DPR = Math.min(window.devicePixelRatio || 1, 2)

// Pixi renders a Canvas texture at its *pixel* dimensions (Sprite.width =
// scale × canvasPixelWidth), regardless of resolution. These are the actual
// CSS-px sizes an un-scaled card sprite consumes, so layout can compute the
// exact scale to render a card at a target logical width.
export const CARD_TEX_W = CARD_W * DPR
export const CARD_TEX_H = CARD_H * DPR

const SUIT_LABELS: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  joker_red: '★', joker_black: '★',
}

const SUIT_COLORS: Record<string, string> = {
  hearts: '#cc2222', diamonds: '#cc2222',
  clubs: '#222222', spades: '#222222',
  joker_red: '#cc2222', joker_black: '#222222',
}

const RANK_DISPLAY: Record<string, string> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K',
}

function key(suit: string, rank: string): string {
  return `${suit}|${rank}`
}

const BACK_KEY = '__back__'
const TABLE_KEY = '__table__'
const GLOW_KEY = '__glow__'

/** Lazily-filled cache. */
const cache = new Map<string, Texture>()

// ---------- internal canvas rendering helpers ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawFace(suit: string, rank: string): HTMLCanvasElement {
  const w = CARD_W * DPR
  const h = CARD_H * DPR
  const r = 8 * DPR
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Background — subtle radial gradient from pure white to a faint grey edge
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(1, '#f4f4f4')
  roundRect(ctx, 0, 0, w, h, r)
  ctx.fillStyle = bg
  ctx.fill()

  // Outer border (thin grey) + inner highlight (crisp white inset)
  roundRect(ctx, 0.5 * DPR, 0.5 * DPR, w - 1 * DPR, h - 1 * DPR, r)
  ctx.strokeStyle = '#c9c9c9'
  ctx.lineWidth = 1.5 * DPR
  ctx.stroke()
  roundRect(ctx, 3 * DPR, 3 * DPR, w - 6 * DPR, h - 6 * DPR, r - 2 * DPR)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1 * DPR
  ctx.stroke()

  const color = SUIT_COLORS[suit] || '#222'
  const suitLabel = SUIT_LABELS[suit] || '?'
  const rankText = RANK_DISPLAY[rank] || rank

  if (suit === 'joker_red' || suit === 'joker_black') {
    // Joker layout: large ★ in center with glow, "JOKER" text
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 8 * DPR
    ctx.fillStyle = color
    ctx.font = `bold ${30 * DPR}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(suitLabel, w / 2, h / 2 - 8 * DPR)
    ctx.restore()

    ctx.fillStyle = color
    ctx.font = `bold ${10 * DPR}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('JOKER', w / 2, h / 2 + 18 * DPR)
  } else {
    // Standard card: corner indices (top-left upright, bottom-right upside-down)
    // and a large central suit mark.
    ctx.fillStyle = color

    // Top-left rank (small shadow for legibility)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 1.5 * DPR
    ctx.font = `bold ${16 * DPR}px system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(rankText, 6 * DPR, 6 * DPR)
    ctx.font = `${12 * DPR}px system-ui, sans-serif`
    ctx.fillText(suitLabel, 6 * DPR, 23 * DPR)
    ctx.restore()

    // Bottom-right rank + suit, rotated 180° (mirrors the top-left corner)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 1.5 * DPR
    ctx.translate(w - 6 * DPR, h - 6 * DPR)
    ctx.rotate(Math.PI)
    ctx.font = `bold ${16 * DPR}px system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(rankText, 0, 0)
    ctx.font = `${12 * DPR}px system-ui, sans-serif`
    ctx.fillText(suitLabel, 0, 17 * DPR)
    ctx.restore()

    // Center large suit with soft glow
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 6 * DPR
    ctx.font = `bold ${34 * DPR}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(suitLabel, w / 2, h / 2 + 4 * DPR)
    ctx.restore()
  }

  return canvas
}

function drawBack(): HTMLCanvasElement {
  const w = CARD_W * DPR
  const h = CARD_H * DPR
  const r = 8 * DPR
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Rounded rect clip
  roundRect(ctx, 0, 0, w, h, r)
  ctx.clip()

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#2b5aa8')
  grad.addColorStop(1, '#16315e')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Diamond-grid pattern overlay
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1 * DPR
  const step = 12 * DPR
  for (let x = -h; x < w + h; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + h, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x - h, h)
    ctx.stroke()
  }

  // Inner border inset highlight
  roundRect(ctx, 3 * DPR, 3 * DPR, w - 6 * DPR, h - 6 * DPR, r - 2 * DPR)
  ctx.strokeStyle = 'rgba(255,255,255,0.30)'
  ctx.lineWidth = 1.2 * DPR
  ctx.stroke()

  // Border
  roundRect(ctx, 0.5 * DPR, 0.5 * DPR, w - 1 * DPR, h - 1 * DPR, r)
  ctx.strokeStyle = '#3a6bc5'
  ctx.lineWidth = 1.5 * DPR
  ctx.stroke()

  // Central star medallion with glow ring
  const cx = w / 2
  const cy = h / 2
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.arc(cx, cy, 13 * DPR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `bold ${22 * DPR}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✦', cx, cy)

  return canvas
}

function drawTable(): HTMLCanvasElement {
  // Fixed logical size — stretched/sampled to cover the screen.
  const w = 1024
  const h = 768
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Radial green felt: bright center, dark edges
  const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.7)
  grad.addColorStop(0, '#2f7d3e')
  grad.addColorStop(0.55, '#226028')
  grad.addColorStop(1, '#173f1b')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Subtle felt speckle for texture
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const a = Math.random() * 0.04
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.fillRect(x, y, 2, 2)
  }

  // Central ellipse table highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(w / 2, h / 2, w * 0.30, h * 0.30, 0, 0, Math.PI * 2)
  ctx.stroke()

  return canvas
}

function drawCardGlow(): HTMLCanvasElement {
  // Same logical size as a card face, but drawn with a transparent centre and a
  // soft warm halo around the edges. Placed as a slightly scaled child of a card
  // sprite, it forms a gentle "selected/ready" ring just outside the card face.
  const w = CARD_W * DPR
  const h = CARD_H * DPR
  const r = 8 * DPR
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Outer soft glow (large blur)
  ctx.shadowColor = 'rgba(255,207,64,0.85)'
  ctx.shadowBlur = 16 * DPR
  ctx.strokeStyle = 'rgba(255,207,64,0.55)'
  ctx.lineWidth = 4 * DPR
  roundRect(ctx, 1 * DPR, 1 * DPR, w - 2 * DPR, h - 2 * DPR, r)
  ctx.stroke()

  // Crisp inner ring
  ctx.shadowBlur = 4 * DPR
  ctx.shadowColor = 'rgba(255,220,120,0.9)'
  ctx.strokeStyle = 'rgba(255,224,130,0.95)'
  ctx.lineWidth = 2 * DPR
  roundRect(ctx, 1 * DPR, 1 * DPR, w - 2 * DPR, h - 2 * DPR, r)
  ctx.stroke()

  return canvas
}

// ---------- public API ----------

/**
 * Get (or lazily create) the face texture for a card.
 */
export function getCardTexture(suit: string, rank: string): Texture {
  const k = key(suit, rank)
  let tex = cache.get(k)
  if (tex) return tex

  const canvas = drawFace(suit, rank)
  tex = Texture.from(canvas, true) // skipCache=true — we manage the cache
  cache.set(k, tex)
  return tex
}

/**
 * Get the shared green-felt table background texture.
 * A single texture is stretched to cover the whole canvas.
 */
export function getTableTexture(): Texture {
  let tex = cache.get(TABLE_KEY)
  if (tex) return tex

  const canvas = drawTable()
  tex = Texture.from(canvas, true)
  cache.set(TABLE_KEY, tex)
  return tex
}

/**
 * Get the shared card-back texture.
 */
export function getCardBackTexture(): Texture {
  let tex = cache.get(BACK_KEY)
  if (tex) return tex

  const canvas = drawBack()
  tex = Texture.from(canvas, true)
  cache.set(BACK_KEY, tex)
  return tex
}

/**
 * Get the shared selection-halo texture (transparent centre + warm edge glow).
 */
export function getCardGlowTexture(): Texture {
  let tex = cache.get(GLOW_KEY)
  if (tex) return tex

  const canvas = drawCardGlow()
  tex = Texture.from(canvas, true)
  cache.set(GLOW_KEY, tex)
  return tex
}

/**
 * Convenience: get texture for a Card object.
 */
export function textureForCard(card: Card): Texture {
  return getCardTexture(card.suit, card.rank)
}

/**
 * Pre-warm the cache with textures for a set of cards (e.g. the initial deal).
 * Purely optional — getCardTexture is lazy by design.
 */
export function prewarm(cards: Card[]): void {
  for (const c of cards) getCardTexture(c.suit, c.rank)
}

/**
 * Pre-warm the entire 54-card deck (4 suits × 13 ranks + 2 jokers) in one go.
 * Called once at renderer mount. Card texture rasterization is synchronous and
 * uses shadow blur, so generating a card mid-animation causes a frame hitch;
 * warming the whole deck up-front removes every mid-play spike.
 */
export function prewarmAllCards(): void {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades']
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
  for (const s of suits) {
    for (const r of ranks) getCardTexture(s, r)
  }
  getCardTexture('joker_red', 'JOKER')
  getCardTexture('joker_black', 'JOKER')
}

/**
 * Destroy all cached textures and free GPU memory.
 */
export function destroyAllTextures(): void {
  for (const tex of cache.values()) {
    try { tex.destroy(true) } catch { /* already destroyed */ }
  }
  cache.clear()
}

/** Current cache size (for debug HUD). */
export function textureCacheSize(): number {
  return cache.size
}

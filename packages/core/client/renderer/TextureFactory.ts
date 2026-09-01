/**
 * TextureFactory — 离屏 canvas 光栅化卡牌纹理工厂
 *
 * 将卡牌绘制到离屏 canvas，然后转为 PIXI.Texture 供 Sprite 使用。
 * 类比 C++：相当于一个 TextureManager，管理所有卡牌纹理的生成和缓存。
 *
 * 纹理生成策略：
 *   - 懒加载：首次 getTexture(suit, rank) 时才生成，生成后 Map 缓存
 *   - 全量预热：prewarmAllCards() 在渲染器挂载时一次性生成 54 张纹理
 *   - 内存占用：DPR=2 时，54 张 × 72×100×4 = ~1.5MB，完全可接受
 *
 * 为什么用 canvas 光栅化而不是直接加载图片？
 *   1. 不需要外部图片资源（减少打包体积和网络请求）
 *   2. 可以精确控制卡牌样式（字体、颜色、布局）
 *   3. 支持任意分辨率（DPR 自适应）
 *
 * 【如果你想修改卡牌外观】：
 *   - drawFace()：正面牌面绘制（花色符号、点数、颜色）
 *   - drawBack()：牌背绘制（蓝色菱形网格 + 星形徽章）
 *   - drawTable()：牌桌背景（绿色毛毡）
 *   - drawCardGlow()：选中光晕（金色边框）
 *   - CARD_W / CARD_H：卡牌逻辑尺寸（CSS 像素）
 */
import { Texture } from 'pixi.js'
import type { Card } from '@huiming/core-shared'

/** 卡牌逻辑宽度（CSS 像素） */
export const CARD_W = 72
/** 卡牌逻辑高度（CSS 像素） */
export const CARD_H = 100

/** 设备像素比，上限 2（避免高 DPI 设备纹理过大） */
const DPR = Math.min(window.devicePixelRatio || 1, 2)

/**
 * 纹理的实际像素尺寸。
 * PixiJS 渲染 canvas 纹理时使用其像素尺寸（而非 CSS 尺寸），
 * 所以 Sprite.width = scale × canvasPixelWidth。
 * 这些值用于 layout.ts 计算正确的 scale。
 */
export const CARD_TEX_W = CARD_W * DPR
export const CARD_TEX_H = CARD_H * DPR

/** 花色符号映射 */
const SUIT_LABELS: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  joker_red: '★', joker_black: '★',
}

/** 花色颜色映射（红/黑） */
const SUIT_COLORS: Record<string, string> = {
  hearts: '#cc2222', diamonds: '#cc2222',
  clubs: '#222222', spades: '#222222',
  joker_red: '#cc2222', joker_black: '#222222',
}

/** 点数显示文本 */
const RANK_DISPLAY: Record<string, string> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K',
}

/** 生成缓存 key */
function key(suit: string, rank: string): string {
  return `${suit}|${rank}`
}

/** 牌背的缓存 key */
const BACK_KEY = '__back__'
/** 牌桌背景的缓存 key */
const TABLE_KEY = '__table__'
/** 选中光晕的缓存 key */
const GLOW_KEY = '__glow__'

/** 纹理缓存（懒加载） */
const cache = new Map<string, Texture>()

// ─── 内部 canvas 绘制辅助函数 ─────────────────────────────────────────────

/**
 * 绘制圆角矩形路径。
 * 类比 C++：相当于一个 drawRoundedRect 辅助函数。
 */
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

/**
 * 绘制卡牌正面。
 *
 * 布局：
 *   - 左上角：点数 + 花色符号（小字）
 *   - 右下角：点数 + 花色符号（旋转 180°，镜像）
 *   - 中央：大号花色符号（带发光阴影）
 *   - Joker：中央大号 ★ + "JOKER" 文字
 *
 * @param suit - 花色（hearts/diamonds/clubs/spades/joker_red/joker_black）
 * @param rank - 点数（A/2~10/J/Q/K，或 JOKER）
 * @returns 离屏 canvas 元素
 */
function drawFace(suit: string, rank: string): HTMLCanvasElement {
  const w = CARD_W * DPR
  const h = CARD_H * DPR
  const r = 8 * DPR
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 背景：白色到浅灰的线性渐变
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(1, '#f4f4f4')
  roundRect(ctx, 0, 0, w, h, r)
  ctx.fillStyle = bg
  ctx.fill()

  // 外边框（灰色）+ 内高光（白色凹陷）
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
    // Joker 布局：中央大号 ★（带发光）+ "JOKER" 文字
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
    // 标准牌布局
    ctx.fillStyle = color

    // 左上角：点数 + 花色（小字，带阴影增加可读性）
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

    // 右下角：点数 + 花色（旋转 180°，镜像左上角）
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

    // 中央：大号花色符号（带柔和发光）
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

/**
 * 绘制牌背。
 *
 * 设计：蓝色渐变背景 + 菱形网格 + 中央星形徽章。
 */
function drawBack(): HTMLCanvasElement {
  const w = CARD_W * DPR
  const h = CARD_H * DPR
  const r = 8 * DPR
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 圆角裁剪
  roundRect(ctx, 0, 0, w, h, r)
  ctx.clip()

  // 蓝色渐变背景
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#2b5aa8')
  grad.addColorStop(1, '#16315e')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // 菱形网格装饰
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

  // 内边框高光
  roundRect(ctx, 3 * DPR, 3 * DPR, w - 6 * DPR, h - 6 * DPR, r - 2 * DPR)
  ctx.strokeStyle = 'rgba(255,255,255,0.30)'
  ctx.lineWidth = 1.2 * DPR
  ctx.stroke()

  // 外边框
  roundRect(ctx, 0.5 * DPR, 0.5 * DPR, w - 1 * DPR, h - 1 * DPR, r)
  ctx.strokeStyle = '#3a6bc5'
  ctx.lineWidth = 1.5 * DPR
  ctx.stroke()

  // 中央星形徽章
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

/**
 * 绘制牌桌背景。
 * 绿色毛毡效果：径向渐变 + 随机噪点 + 中央椭圆高光。
 */
function drawTable(): HTMLCanvasElement {
  const w = 1024
  const h = 768
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 径向渐变：中心亮绿，边缘暗绿
  const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.7)
  grad.addColorStop(0, '#2f7d3e')
  grad.addColorStop(0.55, '#226028')
  grad.addColorStop(1, '#173f1b')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // 随机噪点（模拟毛毡纹理）
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const a = Math.random() * 0.04
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.fillRect(x, y, 2, 2)
  }

  // 中央椭圆高光
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(w / 2, h / 2, w * 0.30, h * 0.30, 0, 0, Math.PI * 2)
  ctx.stroke()

  return canvas
}

/**
 * 绘制选中光晕。
 * 透明中心 + 金色柔和光边，作为卡牌子 Sprite 叠加显示。
 */
function drawCardGlow(): HTMLCanvasElement {
  const w = CARD_W * DPR
  const h = CARD_H * DPR
  const r = 8 * DPR
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 外层柔和光晕（大模糊）
  ctx.shadowColor = 'rgba(255,207,64,0.85)'
  ctx.shadowBlur = 16 * DPR
  ctx.strokeStyle = 'rgba(255,207,64,0.55)'
  ctx.lineWidth = 4 * DPR
  roundRect(ctx, 1 * DPR, 1 * DPR, w - 2 * DPR, h - 2 * DPR, r)
  ctx.stroke()

  // 内层清晰光环
  ctx.shadowBlur = 4 * DPR
  ctx.shadowColor = 'rgba(255,220,120,0.9)'
  ctx.strokeStyle = 'rgba(255,224,130,0.95)'
  ctx.lineWidth = 2 * DPR
  roundRect(ctx, 1 * DPR, 1 * DPR, w - 2 * DPR, h - 2 * DPR, r)
  ctx.stroke()

  return canvas
}

// ─── 公开 API ─────────────────────────────────────────────────────────────

/**
 * 获取卡牌正面纹理（懒加载 + 缓存）。
 *
 * @param suit - 花色
 * @param rank - 点数
 * @returns PIXI.Texture
 */
export function getCardTexture(suit: string, rank: string): Texture {
  const k = key(suit, rank)
  let tex = cache.get(k)
  if (tex) return tex

  const canvas = drawFace(suit, rank)
  tex = Texture.from(canvas, true) // skipCache=true — 我们自己管理缓存
  cache.set(k, tex)
  return tex
}

/**
 * 获取牌桌背景纹理（单例）。
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
 * 获取牌背纹理（单例，所有对手共享）。
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
 * 获取选中光晕纹理（单例）。
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
 * 便捷函数：根据 Card 对象获取纹理。
 */
export function textureForCard(card: Card): Texture {
  return getCardTexture(card.suit, card.rank)
}

/**
 * 预热缓存：为一组卡牌预先生成纹理。
 * 纯可选——getCardTexture 本身就是懒加载的。
 */
export function prewarm(cards: Card[]): void {
  for (const c of cards) getCardTexture(c.suit, c.rank)
}

/**
 * 预热整副牌（4 花色 × 13 点数 + 2 Joker = 54 张）。
 * 渲染器挂载时调用一次，避免对局中生成纹理导致帧率抖动。
 *
 * 为什么需要预热？
 *   卡牌纹理使用 shadow blur 生成，是同步阻塞操作。
 *   如果在出牌动画中首次生成纹理，会导致那一帧卡顿。
 *   提前生成所有纹理，消除对局中的卡顿风险。
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
 * 销毁所有缓存纹理，释放 GPU 内存。
 * 组件卸载时调用。
 */
export function destroyAllTextures(): void {
  for (const tex of cache.values()) {
    try { tex.destroy(true) } catch { /* 已销毁 */ }
  }
  cache.clear()
}

/** 当前缓存大小（调试 HUD 用） */
export function textureCacheSize(): number {
  return cache.size
}

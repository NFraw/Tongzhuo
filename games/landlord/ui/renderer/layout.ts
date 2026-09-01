/**
 * layout.ts — Pure layout computation for the Landlord renderer.
 *
 * Given screen dimensions and card counts, computes pixel positions for every
 * visual element: my hand fan, opponent card backs, bottom cards, last-play zone.
 *
 * All coordinates are in CSS pixels (not device pixels). The renderer applies
 * DPR scaling when setting PIXI sprite positions.
 */

import { CARD_W, CARD_H, CARD_TEX_W } from '@huiming/core-client/renderer'
// Re-export the framework constants so the renderer doesn't need a separate import
export { CARD_W, CARD_H }

// ─── Responsive breakpoints ────────────────────────────────────────────────

interface Breakpoint {
  cardW: number
  cardH: number
  oppW: number   // opponent card-back width
  oppH: number   // opponent card-back height
  handOverlap: number  // negative px overlap between hand cards
  oppOverlap: number   // negative px overlap between opponent card backs
}

const BP_MOBILE: Breakpoint = {
  cardW: 56, cardH: 78,
  oppW: 30, oppH: 42,
  handOverlap: -22, oppOverlap: -16,
}

const BP_DEFAULT: Breakpoint = {
  cardW: 72, cardH: 100,
  oppW: 40, oppH: 56,
  handOverlap: -26, oppOverlap: -20,
}

const BP_DESKTOP: Breakpoint = {
  cardW: 88, cardH: 122,
  oppW: 52, oppH: 72,
  handOverlap: -32, oppOverlap: -26,
}

function pickBreakpoint(w: number): Breakpoint {
  if (w <= 768) return BP_MOBILE
  if (w >= 900) return BP_DESKTOP
  return BP_DEFAULT
}

// ─── Output types ──────────────────────────────────────────────────────────

export interface Vec2 {
  x: number
  y: number
}

export interface CardSlot {
  /** Center-x of the card (relative to screen left). */
  x: number
  /** Center-y of the card (relative to screen top). */
  y: number
  /** Rotation in radians (0 = upright). */
  rotation: number
  /** Scale multiplier (1 = full size). */
  scale: number
  /** Painter's-order z-index (higher = on top). */
  zIndex: number
}

export interface LayoutResult {
  /** Per-card positions for my hand, indexed 0..myHandCount-1. */
  myHand: CardSlot[]
  /** Per-card positions for left opponent's face-down cards, 0..oppLeftCount-1. */
  oppLeft: CardSlot[]
  /** Per-card positions for right opponent's face-down cards, 0..oppRightCount-1. */
  oppRight: CardSlot[]
  /** Exactly 3 positions for the bottom/revealed cards. */
  bottomCards: CardSlot[]
  /** Positions for the last-played cards (variable count, 0 allowed). */
  lastPlay: CardSlot[]
  /** Y offset (negative = up) applied to selected hand cards. */
  selectedOffsetY: number
  /** Zone boundaries (useful for hit-testing / click areas). */
  zones: {
    myHand: { y: number; height: number }
    center: { y: number; height: number }
    top: { y: number; height: number }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Total pixel width of `count` cards with the given overlap. */
function fanWidth(count: number, cardW: number, overlap: number): number {
  if (count <= 0) return 0
  return cardW + (count - 1) * (cardW + overlap)
}

/**
 * Compute evenly-spaced x positions for `count` cards centered at `cx`,
 * with the given overlap. Returns center-x of each card.
 */
function fanPositions(count: number, cardW: number, overlap: number, cx: number): number[] {
  if (count === 0) return []
  const totalW = fanWidth(count, cardW, overlap)
  const startX = cx - totalW / 2 + cardW / 2
  const step = cardW + overlap
  return Array.from({ length: count }, (_, i) => startX + i * step)
}

// ─── Main layout function ──────────────────────────────────────────────────

/**
 * Compute positions for every visual element.
 *
 * @param screenW  Canvas width in CSS pixels
 * @param screenH  Canvas height in CSS pixels
 * @param myHandCount  Number of cards in the player's hand
 * @param oppLeftCount  Number of cards held by the left opponent
 * @param oppRightCount  Number of cards held by the right opponent
 * @param lastPlayCount  Number of cards in the current last-play pile (0 if none)
 */
export function computeLayout(
  screenW: number,
  screenH: number,
  myHandCount: number,
  oppLeftCount: number,
  oppRightCount: number,
  lastPlayCount: number,
): LayoutResult {
  const bp = pickBreakpoint(screenW)

  // ── Zone heights (matching CSS proportions) ──
  const topH = Math.max(screenH * 0.30, 140)
  const centerH = screenH * 0.35
  // myHand zone: bottom of screen, height = cardH + some padding for info bar
  const myHandZoneH = bp.cardH + 48  // 48px for info bar above cards

  const zones = {
    top: { y: 0, height: topH },
    center: { y: topH, height: centerH },
    myHand: { y: screenH - myHandZoneH, height: myHandZoneH },
  }

  const cx = screenW / 2

  // Pixi renders a Canvas texture at its *pixel* width (CARD_TEX_W), so scale
  // must target that to make the sprite render at the breakpoint's intended
  // width. This keeps fan spacing and card size consistent across breakpoints
  // and DPR (previously cards rendered at the texture's pixel width regardless
  // of breakpoint — small & sparse on desktop, oversized on HiDPI).
  const cardScale = bp.cardW / CARD_TEX_W
  const oppScale = bp.oppW / CARD_TEX_W

  // ── My hand ──────────────────────────────────────────────────────────────
  // Cards sit at the bottom, centered horizontally.
  // Selected cards shift up by selectedOffsetY (see return value below).
  const myHandY = screenH - myHandZoneH / 2  // vertical center of my-hand zone
  const myHandXs = fanPositions(myHandCount, bp.cardW, bp.handOverlap, cx)
  const myHand: CardSlot[] = myHandXs.map((x, i) => ({
    x,
    y: myHandY,
    rotation: 0,
    scale: cardScale,
    zIndex: i,  // later cards on top (painter's order)
  }))

  // ── Opponent cards (face-down) ───────────────────────────────────────────
  // Left opponent: top-left area.  Right opponent: top-right area.
  // We show up to 8 visible backs; if more, they overlap more tightly.
  const oppMaxVisible = 8
  const oppLeftVisible = Math.min(oppLeftCount, oppMaxVisible)
  const oppRightVisible = Math.min(oppRightCount, oppMaxVisible)

  // Vertical center of the opponent zone (with some offset for info bars)
  const oppY = topH / 2 + 20  // push down a bit to leave room for info bar

  // Left opponent: cards start from left edge with padding
  const oppLeftPad = 60  // leave room for name/role label
  const oppLeftXs = fanPositions(oppLeftVisible, bp.oppW, bp.oppOverlap, oppLeftPad + fanWidth(oppLeftVisible, bp.oppW, bp.oppOverlap) / 2)
  const oppLeft: CardSlot[] = oppLeftXs.map((x, i) => ({
    x,
    y: oppY,
    rotation: 0,
    scale: oppScale,
    zIndex: i,
  }))

  // Right opponent: mirror of left
  const oppRightPad = 60
  const oppRightTotalW = fanWidth(oppRightVisible, bp.oppW, bp.oppOverlap)
  const oppRightCenterX = screenW - oppRightPad - oppRightTotalW / 2
  const oppRightXs = fanPositions(oppRightVisible, bp.oppW, bp.oppOverlap, oppRightCenterX)
  const oppRight: CardSlot[] = oppRightXs.map((x, i) => ({
    x,
    y: oppY,
    rotation: 0,
    scale: oppScale,
    zIndex: i,
  }))

  // ── Bottom cards (3 revealed cards in the top-center) ────────────────────
  // Shown at 85% of the full card width, centered in the top zone.
  const bottomScale = 0.85
  const bottomCardW = bp.cardW * bottomScale
  const bottomOverlap = bp.handOverlap * bottomScale  // same overlap ratio
  const bottomY = topH / 2 - 10  // slightly above center of top zone
  const bottomXs = fanPositions(3, bottomCardW, bottomOverlap, cx)
  const bottomCards: CardSlot[] = bottomXs.map((x, i) => ({
    x,
    y: bottomY,
    rotation: 0,
    scale: (bp.cardW * bottomScale) / CARD_TEX_W,
    zIndex: i,
  }))

  // ── Last-play area (center of the center zone) ──────────────────────────
  // Cards are played into the vertical center of the screen.
  const lastPlayY = topH + centerH / 2
  const lastPlayXs = fanPositions(lastPlayCount, bp.cardW, bp.handOverlap, cx)
  const lastPlay: CardSlot[] = lastPlayXs.map((x, i) => ({
    x,
    y: lastPlayY,
    rotation: 0,
    scale: cardScale,
    zIndex: i,
  }))

  return {
    myHand,
    oppLeft,
    oppRight,
    bottomCards,
    lastPlay,
    selectedOffsetY: -26,  // lifted up when selected (more noticeable than CSS -18px)
    zones,
  }
}

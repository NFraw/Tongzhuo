/**
 * layout.ts — 斗地主渲染器的纯布局计算
 *
 * 给定屏幕尺寸和卡牌数量，计算每个视觉元素的像素位置。
 * 纯函数：输入 → 输出，无副作用，无状态。
 * 类比 Java：相当于一个 LayoutCalculator 工具类。
 *
 * 所有坐标都是 CSS 像素（非设备像素）。渲染器设置 Sprite 位置时
 * PixiJS 会自动处理 DPR 缩放。
 *
 * 【如果你想修改布局】：
 *   - BP_MOBILE / BP_DEFAULT / BP_DESKTOP：三个响应式断点的卡牌尺寸
 *   - computeLayout()：主计算函数，调整各区域的位置和间距
 *   - zones：三个垂直区域（顶部对手区、中央出牌区、底部手牌区）
 */
import { CARD_W, CARD_H, CARD_TEX_W } from '@tongzhuo/core-client/renderer'
export { CARD_W, CARD_H }

// ─── 响应式断点 ────────────────────────────────────────────────────────────

/**
 * 响应式断点配置。
 * 不同屏幕宽度使用不同的卡牌尺寸和重叠量。
 *
 * cardW/cardH     — 手牌逻辑尺寸（CSS 像素）
 * oppW/oppH       — 对手牌背尺寸
 * handOverlap     — 手牌重叠量（负值 = 向左重叠，值越小重叠越多）
 * oppOverlap      — 对手牌背重叠量
 */
interface Breakpoint {
  cardW: number
  cardH: number
  oppW: number
  oppH: number
  handOverlap: number
  oppOverlap: number
}

/** 手机端（≤768px）：小牌、紧凑排列 */
const BP_MOBILE: Breakpoint = {
  cardW: 56, cardH: 78,
  oppW: 30, oppH: 42,
  handOverlap: -22, oppOverlap: -16,
}

/** 默认（768~900px）：中等尺寸 */
const BP_DEFAULT: Breakpoint = {
  cardW: 72, cardH: 100,
  oppW: 40, oppH: 56,
  handOverlap: -26, oppOverlap: -20,
}

/** 桌面端（≥900px）：大牌、宽松排列 */
const BP_DESKTOP: Breakpoint = {
  cardW: 88, cardH: 122,
  oppW: 52, oppH: 72,
  handOverlap: -32, oppOverlap: -26,
}

/** 根据屏幕宽度选择断点 */
function pickBreakpoint(w: number): Breakpoint {
  if (w <= 768) return BP_MOBILE
  if (w >= 900) return BP_DESKTOP
  return BP_DEFAULT
}

// ─── 输出类型 ──────────────────────────────────────────────────────────────

/** 二维坐标 */
export interface Vec2 {
  x: number
  y: number
}

/**
 * 卡牌槽位：一张卡牌在屏幕上的完整位置信息。
 *
 * x, y       — 中心点坐标（CSS 像素）
 * rotation   — 旋转角度（弧度，0 = 正上方）
 * scale      — 缩放倍数（1 = 纹理原始尺寸）
 * zIndex     — 画家顺序（越大越在上面）
 */
export interface CardSlot {
  x: number
  y: number
  rotation: number
  scale: number
  zIndex: number
}

/**
 * 布局计算结果。
 *
 * myHand           — 我的手牌位置列表
 * oppLeft          — 左对手牌背位置列表
 * oppRight         — 右对手牌背位置列表
 * bottomCards      — 底牌位置列表（3 个）
 * lastPlay         — 出牌区位置列表（可变数量）
 * selectedOffsetY  — 选中时的 Y 偏移量（负值 = 上移）
 * zones            — 三个垂直区域的边界（用于 hit-testing）
 */
export interface LayoutResult {
  myHand: CardSlot[]
  oppLeft: CardSlot[]
  oppRight: CardSlot[]
  bottomCards: CardSlot[]
  lastPlay: CardSlot[]
  selectedOffsetY: number
  zones: {
    myHand: { y: number; height: number }
    center: { y: number; height: number }
    top: { y: number; height: number }
  }
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

/**
 * 计算 N 张牌的总宽度（考虑重叠）。
 *
 * @param count  - 牌数
 * @param cardW  - 单张牌宽度
 * @param overlap - 重叠量（负值）
 * @returns 总宽度
 */
function fanWidth(count: number, cardW: number, overlap: number): number {
  if (count <= 0) return 0
  return cardW + (count - 1) * (cardW + overlap)
}

/**
 * 计算 N 张牌均匀排列后的中心 X 坐标列表。
 *
 * @param count  - 牌数
 * @param cardW  - 单张牌宽度
 * @param overlap - 重叠量
 * @param cx     - 整体中心 X
 * @returns 每张牌的中心 X 坐标
 */
function fanPositions(count: number, cardW: number, overlap: number, cx: number): number[] {
  if (count === 0) return []
  const totalW = fanWidth(count, cardW, overlap)
  const startX = cx - totalW / 2 + cardW / 2
  const step = cardW + overlap
  return Array.from({ length: count }, (_, i) => startX + i * step)
}

// ─── 主布局函数 ──────────────────────────────────────────────────────────────

/**
 * 计算所有视觉元素的位置。
 *
 * @param screenW       - 画布宽度（CSS 像素）
 * @param screenH       - 画布高度（CSS 像素）
 * @param myHandCount   - 我的手牌数
 * @param oppLeftCount  - 左对手牌数
 * @param oppRightCount - 右对手牌数
 * @param lastPlayCount - 出牌区牌数（0 表示无出牌）
 * @returns LayoutResult
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

  // ── 区域高度 ──
  const topH = Math.max(screenH * 0.30, 140)  // 顶部对手区
  const centerH = screenH * 0.35                // 中央出牌区
  const myHandZoneH = bp.cardH + 48             // 底部手牌区（牌高 + 信息栏空间）

  const zones = {
    top: { y: 0, height: topH },
    center: { y: topH, height: centerH },
    myHand: { y: screenH - myHandZoneH, height: myHandZoneH },
  }

  const cx = screenW / 2

  // PixiJS 渲染 canvas 纹理时使用其像素尺寸（CARD_TEX_W），
  // 所以 scale = 目标逻辑宽度 / 纹理像素宽度
  const cardScale = bp.cardW / CARD_TEX_W
  const oppScale = bp.oppW / CARD_TEX_W

  // ── 我的手牌 ──
  const myHandY = screenH - myHandZoneH / 2
  const myHandXs = fanPositions(myHandCount, bp.cardW, bp.handOverlap, cx)
  const myHand: CardSlot[] = myHandXs.map((x, i) => ({
    x,
    y: myHandY,
    rotation: 0,
    scale: cardScale,
    zIndex: i,  // 后面的牌在上面
  }))

  // ── 对手牌背 ──
  const oppMaxVisible = 8
  const oppLeftVisible = Math.min(oppLeftCount, oppMaxVisible)
  const oppRightVisible = Math.min(oppRightCount, oppMaxVisible)

  const oppY = topH / 2 + 20

  // 左对手
  const oppLeftPad = 60
  const oppLeftXs = fanPositions(oppLeftVisible, bp.oppW, bp.oppOverlap, oppLeftPad + fanWidth(oppLeftVisible, bp.oppW, bp.oppOverlap) / 2)
  const oppLeft: CardSlot[] = oppLeftXs.map((x, i) => ({
    x,
    y: oppY,
    rotation: 0,
    scale: oppScale,
    zIndex: i,
  }))

  // 右对手（镜像）
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

  // ── 底牌（3 张，顶部中央） ──
  const bottomScale = 0.85
  const bottomCardW = bp.cardW * bottomScale
  const bottomOverlap = bp.handOverlap * bottomScale
  const bottomY = topH / 2 - 10
  const bottomXs = fanPositions(3, bottomCardW, bottomOverlap, cx)
  const bottomCards: CardSlot[] = bottomXs.map((x, i) => ({
    x,
    y: bottomY,
    rotation: 0,
    scale: (bp.cardW * bottomScale) / CARD_TEX_W,
    zIndex: i,
  }))

  // ── 出牌区（屏幕中央） ──
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
    selectedOffsetY: -26,  // 选中时上移 26px
    zones,
  }
}

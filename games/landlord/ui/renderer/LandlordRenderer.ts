/**
 * LandlordRenderer — 斗地主 PixiJS 渲染器
 *
 * 继承 BaseGameRenderer，维护视觉模型并实现增量 diff/reconcile。
 * 类比 Java：相当于一个 LandlordView + LandlordViewController。
 *
 * 视觉模型：
 *   - 我的手牌：底部扇形排列，点击选中（上移 + 光晕）
 *   - 对手牌背：左上/右上区域，最多显示 8 张
 *   - 底牌：顶部中央 3 张（明叫阶段亮出）
 *   - 出牌区：屏幕中央（上一手出的牌）
 *   - 回合指示器：绿色光点标记当前回合玩家
 *
 * 动画亮点：
 *   - 出牌：手牌缩小淡出 + 中央新牌从下方弹入
 *   - 对手出牌：牌背从对手区飞向中央
 *   - 不出（pass）：中央牌淡出
 *   - 发牌：新手牌从下方交错弹入
 *   - 底牌翻牌：scale.x 1→0→1 翻转动画
 *
 * 【如果你想修改渲染逻辑】：
 *   - doSync()：主入口，调度各子同步方法
 *   - syncMyHand()：手牌增减 + 动画
 *   - syncSelection()：选中状态 + 上移
 *   - syncOpponents()：对手牌背 + 飞行动画
 *   - syncBottomCards()：底牌 + 翻牌动画
 *   - syncLastPlay()：出牌区 + 淡入淡出
 *   - syncTurnIndicator()：回合光点
 *   - layout.ts：坐标计算
 */
import { Application, Container, Sprite, Graphics } from 'pixi.js'
import { gsap } from 'gsap'
import type { Card } from '@huiming/core-shared'
import { BaseGameRenderer, SpritePool, getCardBackTexture, getCardGlowTexture, getTableTexture, textureForCard, prewarmAllCards } from '@huiming/core-client/renderer'
import type { LandlordClientState, PlayedCards } from '../../types'
import { computeLayout, type LayoutResult, type CardSlot } from './layout'

// ─── 视觉模型接口 ──────────────────────────────────────────────────────────

/**
 * 手牌条目：跟踪每张手牌的 Sprite 和选中状态。
 * 用 Map<cardId, HandEntry> 管理，便于快速查找和 diff。
 */
interface HandEntry {
  sprite: Sprite
  card: Card
  selected: boolean
  /** 未选中时的基准 Y 坐标（选中时基于此上移） */
  baseY: number
  /** 选中光晕 Sprite（作为卡牌的子 Sprite，自动跟随位置） */
  glow?: Sprite
}

/**
 * 出牌区条目：Sprite + 对应的 Card 数据。
 */
interface PlayEntry {
  sprite: Sprite
  card: Card
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

/**
 * 生成 PlayedCards 的稳定签名（用于变化检测）。
 * 签名包含：牌型|主点数|牌数|首尾牌ID。
 */
function playSignature(lp: PlayedCards | null): string {
  if (!lp) return ''
  return `${lp.type}|${lp.mainRank}|${lp.cards.length}|${lp.cards[0]?.id ?? ''}|${lp.cards[lp.cards.length - 1]?.id ?? ''}`
}

/** 比较两个 Set 是否相等 */
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// ─── 渲染器主类 ──────────────────────────────────────────────────────────────

export class LandlordRenderer extends BaseGameRenderer {
  // 回调
  private onSelectionChange?: (selectedIds: Set<string>) => void

  // 图层（画家算法：后画的在上面）
  private background: Sprite           // 牌桌背景（最底层）
  private layerOppBacks: Container     // 对手牌背层
  private layerBottom: Container       // 底牌层
  private layerLastPlay: Container     // 出牌区层
  private layerHand: Container         // 我的手牌层
  private layerUI: Container           // UI 元素层（回合指示器等）

  // 视觉状态
  private handEntries = new Map<string, HandEntry>()  // 手牌条目
  private selectedIds = new Set<string>()              // 当前选中的牌 ID
  private lastSyncedSelected = new Set<string>()       // 上次同步的选中状态（防死循环）
  private oppLeftSprites: Sprite[] = []                // 左对手牌背 Sprite 列表
  private oppRightSprites: Sprite[] = []               // 右对手牌背 Sprite 列表
  private bottomEntries: PlayEntry[] = []              // 底牌条目
  private lastPlayEntries: PlayEntry[] = []            // 出牌区条目
  private lastPlaySig = ''                             // 出牌区签名（变化检测）

  // 布局缓存：只在输入变化时重算
  private lastLayout: LayoutResult | null = null
  private layoutInputs: {
    w: number; h: number
    myHand: number; oppLeft: number; oppRight: number; lastPlay: number
  } | null = null

  // 动画触发状态
  private myPlayerIndex = 0
  private oppCounts: [number, number] = [0, 0]
  private prevLastPlayer: number | null = null
  private prevHandIds = new Set<string>()
  /** 上一次的 currentTurn（用于检测回合变化，触发一次性光点动画） */
  private prevTurn = -1

  // UI 元素（回合指示器光点）
  private turnDotLeft: Graphics | null = null
  private turnDotRight: Graphics | null = null
  private turnDotMine: Graphics | null = null

  constructor(app: Application, opts?: { onSelectionChange?: (ids: Set<string>) => void }) {
    super(app)
    this.onSelectionChange = opts?.onSelectionChange

    // 预热所有 54 张卡牌纹理，避免对局中首次生成导致帧率抖动
    prewarmAllCards()

    // 图层必须开启 sortableChildren，否则 zIndex 不生效
    // （PixiJS 默认按 addChild 顺序绘制，忽略 zIndex）
    this.layerOppBacks = new Container()
    this.layerOppBacks.sortableChildren = true
    this.layerBottom = new Container()
    this.layerBottom.sortableChildren = true
    this.layerLastPlay = new Container()
    this.layerLastPlay.sortableChildren = true
    this.layerHand = new Container()
    this.layerHand.sortableChildren = true
    this.layerUI = new Container()

    // 牌桌背景（最底层）
    const tableTex = getTableTexture()
    this.background = new Sprite(tableTex)
    this.background.anchor.set(0.5)
    this.background.x = this.app.screen.width / 2
    this.background.y = this.app.screen.height / 2
    this.background.width = this.app.screen.width
    this.background.height = this.app.screen.height
    app.stage.addChild(this.background)

    // 按画家算法顺序添加图层
    app.stage.addChild(this.layerOppBacks)
    app.stage.addChild(this.layerBottom)
    app.stage.addChild(this.layerLastPlay)
    app.stage.addChild(this.layerHand)
    app.stage.addChild(this.layerUI)

    // 创建回合指示器光点
    this.turnDotLeft = this.createTurnDot()
    this.turnDotRight = this.createTurnDot()
    this.turnDotMine = this.createTurnDot()
    this.layerUI.addChild(this.turnDotLeft, this.turnDotRight, this.turnDotMine)
  }

  // ─── 生命周期 ─────────────────────────────────────────────────────────

  override onResize(): void {
    // 强制下次 sync 重算布局
    this.lastLayout = null
    this.layoutInputs = null
    if (this.background) {
      this.background.x = this.app.screen.width / 2
      this.background.y = this.app.screen.height / 2
      this.background.width = this.app.screen.width
      this.background.height = this.app.screen.height
    }
  }

  override reset(): void {
    super.reset()
    this.handEntries.clear()
    this.selectedIds.clear()
    this.lastSyncedSelected.clear()
    this.oppLeftSprites = []
    this.oppRightSprites = []
    this.bottomEntries = []
    this.lastPlayEntries = []
    this.lastPlaySig = ''
    this.oppCounts = [0, 0]
    this.prevLastPlayer = null
    this.prevHandIds.clear()
    this.prevTurn = -1
    this.lastLayout = null
    this.layoutInputs = null

    // 重置回合指示器
    if (this.turnDotLeft) { this.turnDotLeft.alpha = 0.3; this.turnDotLeft.scale.set(1); gsap.killTweensOf(this.turnDotLeft) }
    if (this.turnDotRight) { this.turnDotRight.alpha = 0.3; this.turnDotRight.scale.set(1); gsap.killTweensOf(this.turnDotRight) }
    if (this.turnDotMine) { this.turnDotMine.alpha = 0.3; this.turnDotMine.scale.set(1); gsap.killTweensOf(this.turnDotMine) }
  }

  override destroy(): void {
    this.handEntries.clear()
    this.selectedIds.clear()
    this.lastSyncedSelected.clear()
    this.oppLeftSprites = []
    this.oppRightSprites = []
    this.bottomEntries = []
    this.lastPlayEntries = []
    super.destroy()
  }

  // ─── 核心同步 ─────────────────────────────────────────────────────────

  /**
   * 每帧同步入口。接收新状态，计算 diff，执行动画。
   *
   * 流程：
   *   1. 检测布局输入是否变化，必要时重算布局
   *   2. 检测哪些手牌刚被打出（用于出牌动画）
   *   3. 调度各子同步方法
   *   4. 更新状态追踪
   */
  protected doSync(state: unknown, selectedIds?: Set<string>): void {
    const s = state as LandlordClientState
    if (!s) return

    const screenW = this.app.screen.width
    const screenH = this.app.screen.height

    // 布局缓存：只在输入变化时重算
    const inputs = {
      w: screenW, h: screenH,
      myHand: s.myHand.length,
      oppLeft: s.otherHandCounts[0],
      oppRight: s.otherHandCounts[1],
      lastPlay: s.gameInfo.lastPlay?.cards.length ?? 0,
    }
    const li = this.layoutInputs
    if (!this.lastLayout || !li ||
        li.w !== inputs.w || li.h !== inputs.h ||
        li.myHand !== inputs.myHand || li.oppLeft !== inputs.oppLeft ||
        li.oppRight !== inputs.oppRight || li.lastPlay !== inputs.lastPlay) {
      this.layoutInputs = inputs
      this.lastLayout = computeLayout(
        screenW, screenH,
        s.myHand.length,
        s.otherHandCounts[0],
        s.otherHandCounts[1],
        s.gameInfo.lastPlay?.cards.length ?? 0,
      )
    }

    this.myPlayerIndex = s.myPlayerIndex

    // 检测刚打出的牌（用于出牌动画）
    const newHandIds = new Set(s.myHand.map(c => c.id))
    const playedCardIds = new Set<string>()
    for (const id of this.prevHandIds) {
      if (!newHandIds.has(id)) playedCardIds.add(id)
    }
    const iJustPlayed = playedCardIds.size > 0 && s.gameInfo.lastPlayer === s.myPlayerIndex

    // 调度各子同步
    this.syncMyHand(s, selectedIds, playedCardIds, iJustPlayed)
    this.syncOpponents(s)
    this.syncBottomCards(s)
    this.syncLastPlay(s)
    this.syncTurnIndicator(s)

    // 更新状态追踪
    this.prevLastPlayer = s.gameInfo.lastPlayer
    this.prevHandIds = newHandIds
  }

  // ─── 手牌同步 ───────────────────────────────────────────────────────────

  /**
   * 同步我的手牌。
   *
   * diff 算法：
   *   - 旧有新无 → 牌被打出，播放出牌动画（缩小淡出）
   *   - 新有旧无 → 新牌加入，播放发牌动画（从下方弹入）
   *   - 新旧都有 → 位置变化时平滑移动
   */
  private syncMyHand(
    s: LandlordClientState,
    selectedIds: Set<string> | undefined,
    playedCardIds: Set<string>,
    iJustPlayed: boolean,
  ): void {
    const layout = this.lastLayout!
    const newIds = new Set(s.myHand.map(c => c.id))
    const oldIds = new Set(this.handEntries.keys())

    // 移除不再在手牌中的卡牌
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const entry = this.handEntries.get(id)!

        // 清除选中光晕
        if (entry.glow) {
          gsap.killTweensOf(entry.glow)
          this.pool.release(entry.glow)
          entry.glow = undefined
        }

        if (iJustPlayed && playedCardIds.has(id)) {
          // 我刚打出这张牌 → 从手牌位置向上缩小淡出
          // 中央的"落地牌"由 syncLastPlay 创建，不会重叠
          gsap.to(entry.sprite, {
            y: entry.sprite.y - 40,
            alpha: 0,
            scale: 0.4,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => this.pool.release(entry.sprite),
          })
        } else {
          // 其他原因移除（如状态修正）→ 直接淡出
          gsap.to(entry.sprite, {
            alpha: 0,
            duration: 0.15,
            onComplete: () => this.pool.release(entry.sprite),
          })
        }
        this.handEntries.delete(id)
      }
    }

    // 添加新牌（交错弹入动画）
    let newCardDelay = 0
    for (let i = 0; i < s.myHand.length; i++) {
      const card = s.myHand[i]
      const slot = layout.myHand[i]
      if (!slot) continue

      if (!this.handEntries.has(card.id)) {
        // 新牌：创建 Sprite，从下方弹入
        const tex = textureForCard(card)
        const sprite = this.pool.acquire(tex)
        sprite.anchor.set(0.5)
        sprite.x = slot.x
        sprite.y = slot.y + 60  // 起始位置：最终位置下方 60px
        sprite.alpha = 0
        sprite.scale.set(slot.scale)
        sprite.zIndex = slot.zIndex
        sprite.eventMode = 'static'  // 允许点击事件
        sprite.cursor = 'pointer'
        sprite.on('pointerdown', () => this.onHandCardClick(card))
        this.layerHand.addChild(sprite)
        this.handEntries.set(card.id, { sprite, card, selected: false, baseY: slot.y })

        // 交错弹入
        gsap.to(sprite, {
          y: slot.y,
          alpha: 1,
          duration: 0.3,
          delay: newCardDelay,
          ease: 'back.out(1.2)',
        })
        newCardDelay += 0.06  // 每张牌间隔 60ms
      } else {
        // 已有牌：平滑移动到新位置
        const entry = this.handEntries.get(card.id)!
        entry.baseY = slot.y
        gsap.killTweensOf(entry.sprite, 'x,y')
        gsap.to(entry.sprite, {
          x: slot.x,
          y: slot.y,
          duration: 0.2,
          ease: 'power2.out',
        })
        entry.sprite.zIndex = slot.zIndex
      }
    }

    this.syncSelection(s, selectedIds)
  }

  // ─── 选中状态 ─────────────────────────────────────────────────────────

  /**
   * 同步选中状态。
   *
   * 防死循环机制：
   *   renderer 内部维护 lastSyncedSelected 镜像。
   *   当 sync 传入的 selected 与镜像相同 → 来自自身点击上报 → 跳过动画。
   *   当 selected 与镜像不同 → 来自 React setState → 播放选中动画。
   */
  private syncSelection(s: LandlordClientState, selectedIds?: Set<string>): void {
    const layout = this.lastLayout!
    const newSelected = selectedIds ?? this.selectedIds
    const fromOurClick = setsEqual(newSelected, this.lastSyncedSelected)

    for (const [id, entry] of this.handEntries) {
      const isSelected = newSelected.has(id)
      if (isSelected === entry.selected) continue

      entry.selected = isSelected
      // 选中时上移，取消时回到基准位置
      const targetY = isSelected
        ? entry.baseY + layout.selectedOffsetY
        : entry.baseY

      gsap.killTweensOf(entry.sprite, 'y')
      gsap.to(entry.sprite, {
        y: targetY,
        duration: 0.15,
        ease: 'power2.out',
        overwrite: 'auto',
      })

      this.setCardGlow(entry, isSelected)
    }

    this.selectedIds = new Set(newSelected)
    if (!fromOurClick) {
      this.lastSyncedSelected = new Set(newSelected)
    }
  }

  /**
   * 显示/隐藏选中光晕。
   * 光晕 Sprite 作为卡牌的子 Sprite，自动跟随位置、上移和缩放。
   */
  private setCardGlow(entry: HandEntry, on: boolean): void {
    if (on && !entry.glow) {
      const glow = this.pool.acquire(getCardGlowTexture())
      glow.anchor.set(0.5)
      glow.position.set(0, 0)
      glow.scale.set(1.15)
      glow.alpha = 0
      glow.eventMode = 'none'  // 不拦截卡牌的点击事件
      entry.sprite.addChild(glow)
      entry.glow = glow
      gsap.to(glow, { alpha: 1, duration: 0.15 })
    } else if (!on && entry.glow) {
      const glow = entry.glow
      entry.glow = undefined
      gsap.to(glow, {
        alpha: 0,
        duration: 0.12,
        onComplete: () => {
          gsap.killTweensOf(glow)
          this.pool.release(glow)
        },
      })
    }
  }

  /** 手牌点击回调：切换选中状态，上报给 React */
  private onHandCardClick(card: Card): void {
    const next = new Set(this.selectedIds)
    if (next.has(card.id)) next.delete(card.id)
    else next.add(card.id)

    this.lastSyncedSelected = new Set(next)
    this.selectedIds = next

    this.syncSelection({ myHand: Array.from(this.handEntries.values()).map(e => e.card) } as any, next)
    this.onSelectionChange?.(next)
  }

  // ─── 对手区域 ─────────────────────────────────────────────────────────

  /**
   * 同步对手牌背。
   *
   * 策略：
   *   - 牌数增加 → 从池中获取新牌背 Sprite，交错排布
   *   - 牌数减少 → 释放多余的牌背 Sprite
   *   - 对手出牌时 → 创建临时牌背飞向中央（飞行动画）
   */
  private syncOpponents(s: LandlordClientState): void {
    const layout = this.lastLayout!
    const newCounts = s.otherHandCounts

    this.syncOppZone(
      this.oppLeftSprites, layout.oppLeft, newCounts[0], this.oppCounts[0], 'left',
      (sprites) => { this.oppLeftSprites = sprites }
    )

    this.syncOppZone(
      this.oppRightSprites, layout.oppRight, newCounts[1], this.oppCounts[1], 'right',
      (sprites) => { this.oppRightSprites = sprites }
    )

    // 检测对手出牌 → 飞行动画
    const oppIndices = [0, 1, 2].filter(i => i !== s.myPlayerIndex)
    const lp = s.gameInfo.lastPlay
    const lastPlayer = s.gameInfo.lastPlayer

    if (lp && lastPlayer !== null && lastPlayer !== s.myPlayerIndex && lastPlayer !== this.prevLastPlayer) {
      const isLeft = lastPlayer === oppIndices[0]
      const oppZone = isLeft ? layout.oppLeft : layout.oppRight
      const oppSprites = isLeft ? this.oppLeftSprites : this.oppRightSprites
      const sourceSlot = oppSprites.length > 0
        ? { x: oppSprites[oppSprites.length - 1].x, y: oppSprites[oppSprites.length - 1].y }
        : oppZone[0] ?? { x: isLeft ? 100 : this.app.screen.width - 100, y: 80 }

      // 创建临时牌背，从对手区飞向中央
      const flySprite = this.pool.acquire(getCardBackTexture())
      flySprite.anchor.set(0.5)
      flySprite.x = sourceSlot.x
      flySprite.y = sourceSlot.y
      flySprite.alpha = 1
      const oppScale = oppSprites.length > 0
        ? oppSprites[oppSprites.length - 1].scale.x
        : (oppZone[0]?.scale ?? 0.56)
      flySprite.scale.set(oppScale)
      // 飞入的牌背放在出牌区牌的下面
      flySprite.zIndex = -1
      this.layerLastPlay.addChild(flySprite)

      const centerSlot = layout.lastPlay[0]
      gsap.to(flySprite, {
        x: centerSlot?.x ?? this.app.screen.width / 2,
        y: centerSlot?.y ?? this.app.screen.height / 2,
        duration: 0.3,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(flySprite, {
            alpha: 0,
            duration: 0.15,
            onComplete: () => this.pool.release(flySprite),
          })
        },
      })
    }

    this.oppCounts = [...newCounts]
  }

  /**
   * 同步单个对手区域的牌背。
   * 只增减必要的牌背 Sprite 并重新排位。
   */
  private syncOppZone(
    current: Sprite[],
    slots: CardSlot[],
    newCount: number,
    oldCount: number,
    side: 'left' | 'right',
    setter: (sprites: Sprite[]) => void,
  ): void {
    const visible = Math.min(newCount, 8)
    const oldVisible = Math.min(oldCount, 8)

    if (visible > oldVisible) {
      // 牌数增加 → 获取新牌背
      const tex = getCardBackTexture()
      for (let i = oldVisible; i < visible; i++) {
        const sprite = this.pool.acquire(tex)
        sprite.anchor.set(0.5)
        const slot = slots[i]
        if (slot) {
          sprite.x = slot.x
          sprite.y = slot.y
          sprite.scale.set(slot.scale)
          sprite.zIndex = slot.zIndex
        }
        this.layerOppBacks.addChild(sprite)
        current.push(sprite)
      }
    } else if (visible < oldVisible) {
      // 牌数减少 → 释放多余牌背
      for (let i = oldVisible - 1; i >= visible; i--) {
        const sprite = current.pop()
        if (sprite) this.pool.release(sprite)
      }
    }

    // 重新排位（平滑移动）
    for (let i = 0; i < current.length; i++) {
      const slot = slots[i]
      if (slot) {
        gsap.to(current[i], {
          x: slot.x,
          y: slot.y,
          duration: 0.2,
          ease: 'power2.out',
        })
        current[i].zIndex = slot.zIndex
      }
    }
  }

  // ─── 底牌 ──────────────────────────────────────────────────────────────

  /**
   * 同步底牌。
   *
   * 变化检测：
   *   - 牌数变化 → 销毁旧底牌，创建新底牌
   *   - 牌内容变化（翻牌） → 翻转动画（scale.x 1→0→1，中间换纹理）
   */
  private syncBottomCards(s: LandlordClientState): void {
    const layout = this.lastLayout!
    const newCards = s.bottomCards

    if (newCards.length !== this.bottomEntries.length) {
      // 牌数变化 → 全部重建
      for (const entry of this.bottomEntries) this.pool.release(entry.sprite)
      this.bottomEntries = []

      for (let i = 0; i < newCards.length; i++) {
        const card = newCards[i]
        const slot = layout.bottomCards[i]
        if (!slot) continue
        const tex = textureForCard(card)
        const sprite = this.pool.acquire(tex)
        sprite.anchor.set(0.5)
        sprite.x = slot.x
        sprite.y = slot.y
        sprite.scale.set(slot.scale)
        sprite.zIndex = slot.zIndex
        this.layerBottom.addChild(sprite)
        this.bottomEntries.push({ sprite, card })
      }
    } else {
      // 牌数不变 → 检查内容变化（翻牌）
      for (let i = 0; i < newCards.length; i++) {
        const card = newCards[i]
        const entry = this.bottomEntries[i]
        const slot = layout.bottomCards[i]
        if (!entry || !slot) continue

        if (entry.card.id !== card.id) {
          entry.card = card
          // 翻牌动画：scale.x 1→0，换纹理，0→1
          gsap.to(entry.sprite.scale, {
            x: 0,
            duration: 0.15,
            onComplete: () => {
              entry.sprite.texture = textureForCard(card)
              gsap.to(entry.sprite.scale, {
                x: slot.scale,
                duration: 0.15,
              })
            },
          })
        }

        gsap.to(entry.sprite, {
          x: slot.x,
          y: slot.y,
          duration: 0.2,
          ease: 'power2.out',
        })
      }
    }
  }

  // ─── 出牌区 ───────────────────────────────────────────────────────────

  /**
   * 同步出牌区。
   *
   * 变化检测：通过签名（牌型|主点数|牌数|首尾ID）判断。
   *   - 签名不变 → 只重新排位
   *   - 签名变化 + 有新出牌 → 从下方弹入新牌
   *   - 签名变化 + pass（lastPlay 为空） → 淡出旧牌
   */
  private syncLastPlay(s: LandlordClientState): void {
    const layout = this.lastLayout!
    const lp = s.gameInfo.lastPlay
    const newSig = playSignature(lp)

    if (newSig === this.lastPlaySig) {
      // 内容不变 → 只重新排位
      for (let i = 0; i < this.lastPlayEntries.length; i++) {
        const slot = layout.lastPlay[i]
        if (slot) {
          gsap.to(this.lastPlayEntries[i].sprite, {
            x: slot.x,
            y: slot.y,
            duration: 0.2,
            ease: 'power2.out',
          })
        }
      }
      return
    }

    // 内容变化 → 清理旧牌
    const isPass = !lp || lp.cards.length === 0
    for (const entry of this.lastPlayEntries) {
      if (isPass) {
        // pass → 淡出
        gsap.to(entry.sprite, {
          alpha: 0,
          duration: 0.3,
          onComplete: () => this.pool.release(entry.sprite),
        })
      } else {
        // 新出牌 → 立即释放（新 Sprite 将从下方弹入）
        this.pool.release(entry.sprite)
      }
    }
    this.lastPlayEntries = []
    this.lastPlaySig = newSig

    if (!lp || lp.cards.length === 0) return

    // 创建新出牌 Sprite（从下方弹入）
    for (let i = 0; i < lp.cards.length; i++) {
      const card = lp.cards[i]
      const slot = layout.lastPlay[i]
      if (!slot) continue
      const tex = textureForCard(card)
      const sprite = this.pool.acquire(tex)
      sprite.anchor.set(0.5)
      sprite.x = slot.x
      sprite.y = slot.y + 40  // 起始位置：最终位置下方 40px
      sprite.scale.set(slot.scale * 0.9)
      sprite.tint = 0xffffff  // 清除池复用可能残留的金色 tint
      sprite.alpha = 0
      gsap.to(sprite, {
        y: slot.y,
        alpha: 1,
        duration: 0.28,
        ease: 'back.out(1.2)',
      })
      gsap.to(sprite.scale, {
        x: slot.scale,
        y: slot.scale,
        duration: 0.28,
        ease: 'back.out(1.2)',
      })

      sprite.zIndex = slot.zIndex
      this.layerLastPlay.addChild(sprite)
      this.lastPlayEntries.push({ sprite, card })
    }
  }

  // ─── 回合指示器 ────────────────────────────────────────────────────────

  /**
   * 同步回合指示器。
   * 三个绿色光点分别标记左对手、右对手、自己的回合状态。
   * 回合变化时播放一次性缩放动画（不使用无限循环动画，让渲染循环可以空闲）。
   */
  private syncTurnIndicator(s: LandlordClientState): void {
    const layout = this.lastLayout!
    const isMyTurn = s.currentTurn === s.myPlayerIndex
    const oppIndices = [0, 1, 2].filter(i => i !== s.myPlayerIndex)
    const isLeftTurn = s.currentTurn === oppIndices[0]
    const isRightTurn = s.currentTurn === oppIndices[1]
    const turnChanged = s.currentTurn !== this.prevTurn

    this.updateTurnDot(this.turnDotLeft, isLeftTurn, 30, layout.zones.top.y + 20, turnChanged)
    this.updateTurnDot(this.turnDotRight, isRightTurn, this.app.screen.width - 30, layout.zones.top.y + 20, turnChanged)
    this.updateTurnDot(this.turnDotMine, isMyTurn, this.app.screen.width / 2, layout.zones.myHand.y - 10, turnChanged)

    this.prevTurn = s.currentTurn
  }

  /**
   * 更新单个回合指示器光点。
   * 回合变化时播放一次性缩放弹跳动画。
   */
  private updateTurnDot(dot: Graphics | null, active: boolean, x: number, y: number, changed: boolean): void {
    if (!dot) return
    dot.x = x
    dot.y = y
    if (active && changed) {
      gsap.killTweensOf(dot)
      dot.alpha = 1
      gsap.fromTo(dot.scale, { x: 1.7, y: 1.7 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' })
    } else {
      dot.alpha = active ? 1 : 0.3
      dot.scale.set(1)
    }
  }

  /** 创建回合指示器光点（绿色圆形） */
  private createTurnDot(): Graphics {
    const g = new Graphics()
    g.circle(0, 0, 6)
    g.fill(0x00ff88)
    return g
  }
}

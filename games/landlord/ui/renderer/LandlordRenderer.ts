/**
 * LandlordRenderer — PixiJS renderer for 斗地主 (Dou Di Zhu).
 *
 * Extends BaseGameRenderer. Maintains a visual model and implements
 * incremental diff/reconcile on each sync() call.
 *
 * Visual model:
 *   - My hand: face-up cards in a fan at the bottom, click to select
 *   - Opponents: face-down card backs at top-left and top-right
 *   - Bottom cards: 3 face-up cards in the top-center
 *   - Last play: variable-count cards in the center
 *   - Turn indicator: glowing dot on the active player's zone
 *
 * Animation highlights:
 *   - Playing cards: hand card lifts away (up + shrink + fade); a clean
 *     face-up card "lands" at the table center (enters from below)
 *   - Opponent play: temp card-back flies from opponent zone to center
 *   - Pass: last-play cards fade out
 *   - Deal: new hand cards stagger in from below
 *   - Bottom reveal: flip animation (scale.x 1→0→1)
 */
import { Application, Container, Sprite, Graphics } from 'pixi.js'
import { gsap } from 'gsap'
import type { Card } from '@huiming/core-shared'
import { BaseGameRenderer, SpritePool, getCardBackTexture, getCardGlowTexture, getTableTexture, textureForCard, prewarmAllCards } from '@huiming/core-client/renderer'
import type { LandlordClientState, PlayedCards } from '../../types'
import { computeLayout, type LayoutResult, type CardSlot } from './layout'

// ─── Visual model ──────────────────────────────────────────────────────────

interface HandEntry {
  sprite: Sprite
  card: Card
  selected: boolean
  /** Baseline Y when not selected (source of truth for selection lift). */
  baseY: number
  /** Optional selection halo (a child of sprite, shown only when selected). */
  glow?: Sprite
}

interface PlayEntry {
  sprite: Sprite
  card: Card
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Build a stable signature for a PlayedCards (for change detection). */
function playSignature(lp: PlayedCards | null): string {
  if (!lp) return ''
  return `${lp.type}|${lp.mainRank}|${lp.cards.length}|${lp.cards[0]?.id ?? ''}|${lp.cards[lp.cards.length - 1]?.id ?? ''}`
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// ─── Renderer ──────────────────────────────────────────────────────────────

export class LandlordRenderer extends BaseGameRenderer {
  // Callbacks
  private onSelectionChange?: (selectedIds: Set<string>) => void

  // Layers (painter's order: back → front)
  private background: Sprite
  private layerOppBacks: Container
  private layerBottom: Container
  private layerLastPlay: Container
  private layerHand: Container
  private layerUI: Container

  // Visual state
  private handEntries = new Map<string, HandEntry>()
  private selectedIds = new Set<string>()
  private lastSyncedSelected = new Set<string>()
  private oppLeftSprites: Sprite[] = []
  private oppRightSprites: Sprite[] = []
  private bottomEntries: PlayEntry[] = []
  private lastPlayEntries: PlayEntry[] = []
  private lastPlaySig = ''

  // Cached layout — recomputed only when its inputs (screen size + card counts)
  // change. Card counts change every time a card is dealt/played/passed, which
  // is why the layout must NOT be cached on screen size alone (a stale `lastPlay`
  // slot list used to hide played cards entirely).
  private lastLayout: LayoutResult | null = null
  private layoutInputs: {
    w: number; h: number
    myHand: number; oppLeft: number; oppRight: number; lastPlay: number
  } | null = null

  // State tracking for animation triggers
  private myPlayerIndex = 0
  private oppCounts: [number, number] = [0, 0]
  private prevLastPlayer: number | null = null
  private prevHandIds = new Set<string>()
  /** Last seen currentTurn index — used to fire a one-shot glow on turn change. */
  private prevTurn = -1

  // UI elements
  private turnDotLeft: Graphics | null = null
  private turnDotRight: Graphics | null = null
  private turnDotMine: Graphics | null = null

  constructor(app: Application, opts?: { onSelectionChange?: (ids: Set<string>) => void }) {
    super(app)
    this.onSelectionChange = opts?.onSelectionChange

    // Rasterize all 54 card faces up-front so no texture is generated mid-animation.
    // Card rasterization uses shadow-blur and is synchronous; doing it on the fly
    // during a deal/play spikes the frame and reads as stutter.
    prewarmAllCards()

    // Layers must be sortable so the `zIndex` computed by layout.ts actually
    // determines painter's order. Without this, stacking falls back to `addChild`
    // order, which depends on sprite-pool reuse timing — so card overlap order
    // (which hand/play card sits on top) becomes inconsistent across frames.
    this.layerOppBacks = new Container()
    this.layerOppBacks.sortableChildren = true
    this.layerBottom = new Container()
    this.layerBottom.sortableChildren = true
    this.layerLastPlay = new Container()
    this.layerLastPlay.sortableChildren = true
    this.layerHand = new Container()
    this.layerHand.sortableChildren = true
    this.layerUI = new Container()

    // Full-canvas green-felt background (bottom-most layer). The 1024×768
    // texture is stretched to cover the screen and repositioned on resize.
    const tableTex = getTableTexture()
    this.background = new Sprite(tableTex)
    this.background.anchor.set(0.5)
    this.background.x = this.app.screen.width / 2
    this.background.y = this.app.screen.height / 2
    this.background.width = this.app.screen.width
    this.background.height = this.app.screen.height
    app.stage.addChild(this.background)

    app.stage.addChild(this.layerOppBacks)
    app.stage.addChild(this.layerBottom)
    app.stage.addChild(this.layerLastPlay)
    app.stage.addChild(this.layerHand)
    app.stage.addChild(this.layerUI)

    this.turnDotLeft = this.createTurnDot()
    this.turnDotRight = this.createTurnDot()
    this.turnDotMine = this.createTurnDot()
    this.layerUI.addChild(this.turnDotLeft, this.turnDotRight, this.turnDotMine)
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  override onResize(): void {
    // Force a layout recompute on the next sync (screen size is a layout input)
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

    // Reset turn indicator dots (not in sprite pool) to a neutral dim state
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

  // ─── Core sync ─────────────────────────────────────────────────────────

  protected doSync(state: unknown, selectedIds?: Set<string>): void {
    const s = state as LandlordClientState
    if (!s) return

    const screenW = this.app.screen.width
    const screenH = this.app.screen.height

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

    // Detect cards that just left my hand (for the lift-away animation)
    const newHandIds = new Set(s.myHand.map(c => c.id))
    const playedCardIds = new Set<string>()
    for (const id of this.prevHandIds) {
      if (!newHandIds.has(id)) playedCardIds.add(id)
    }
    const iJustPlayed = playedCardIds.size > 0 && s.gameInfo.lastPlayer === s.myPlayerIndex

    // Sync each visual element
    this.syncMyHand(s, selectedIds, playedCardIds, iJustPlayed)
    this.syncOpponents(s)
    this.syncBottomCards(s)
    this.syncLastPlay(s)
    this.syncTurnIndicator(s)

    // Track for next frame
    this.prevLastPlayer = s.gameInfo.lastPlayer
    this.prevHandIds = newHandIds
  }

  // ─── My hand ───────────────────────────────────────────────────────────

  private syncMyHand(
    s: LandlordClientState,
    selectedIds: Set<string> | undefined,
    playedCardIds: Set<string>,
    iJustPlayed: boolean,
  ): void {
    const layout = this.lastLayout!
    const newIds = new Set(s.myHand.map(c => c.id))
    const oldIds = new Set(this.handEntries.keys())

    // Remove cards that left my hand
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const entry = this.handEntries.get(id)!

        // Detach the selection halo too, otherwise it rides along on the pooled
        // sprite and would glow on an unrelated card later.
        if (entry.glow) {
          gsap.killTweensOf(entry.glow)
          this.pool.release(entry.glow)
          entry.glow = undefined
        }

        if (iJustPlayed && playedCardIds.has(id)) {
          // I just played this card → lift off the hand, drift up & shrink away.
          // The clean replacement is spawned by syncLastPlay at the table center,
          // so we never overlap a virtual "flying" card with the landed cards.
          gsap.to(entry.sprite, {
            y: entry.sprite.y - 40,
            alpha: 0,
            scale: 0.4,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => this.pool.release(entry.sprite),
          })
        } else {
          // Card left for other reason (e.g., deal correction) — just fade
          gsap.to(entry.sprite, {
            alpha: 0,
            duration: 0.15,
            onComplete: () => this.pool.release(entry.sprite),
          })
        }
        this.handEntries.delete(id)
      }
    }

    // Add new cards (with stagger-in animation from below)
    let newCardDelay = 0
    for (let i = 0; i < s.myHand.length; i++) {
      const card = s.myHand[i]
      const slot = layout.myHand[i]
      if (!slot) continue

      if (!this.handEntries.has(card.id)) {
        const tex = textureForCard(card)
        const sprite = this.pool.acquire(tex)
        sprite.anchor.set(0.5)
        sprite.x = slot.x
        sprite.y = slot.y + 60  // start below final position
        sprite.alpha = 0
        sprite.scale.set(slot.scale)
        sprite.zIndex = slot.zIndex
        sprite.eventMode = 'static'
        sprite.cursor = 'pointer'
        sprite.on('pointerdown', () => this.onHandCardClick(card))
        this.layerHand.addChild(sprite)
        this.handEntries.set(card.id, { sprite, card, selected: false, baseY: slot.y })

        // Stagger in
        gsap.to(sprite, {
          y: slot.y,
          alpha: 1,
          duration: 0.3,
          delay: newCardDelay,
          ease: 'back.out(1.2)',
        })
        newCardDelay += 0.06  // 60ms stagger between cards
      } else {
        // Existing card: reposition smoothly
        const entry = this.handEntries.get(card.id)!
        entry.baseY = slot.y
        gsap.killTweensOf(entry.sprite, 'x,y')  // avoid stacking position tweens
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

  // ─── Selection ─────────────────────────────────────────────────────────

  private syncSelection(s: LandlordClientState, selectedIds?: Set<string>): void {
    const layout = this.lastLayout!
    const newSelected = selectedIds ?? this.selectedIds
    const fromOurClick = setsEqual(newSelected, this.lastSyncedSelected)

    for (const [id, entry] of this.handEntries) {
      const isSelected = newSelected.has(id)
      if (isSelected === entry.selected) continue

      entry.selected = isSelected
      // Lift/drop around the card's baseline Y (immune to hand reordering)
      const targetY = isSelected
        ? entry.baseY + layout.selectedOffsetY
        : entry.baseY

      gsap.killTweensOf(entry.sprite, 'y')  // avoid stacking with selection tweens
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
   * Show/hide the selection halo. The halo sprite is nested as a child of the
   * card sprite so it automatically follows the card's position, lift and scale.
   * The gold *tint* was dropped in favour of this halo — tinting the whole card
   * face yellow looked garish, whereas an edge glow reads as "selected".
   */
  private setCardGlow(entry: HandEntry, on: boolean): void {
    if (on && !entry.glow) {
      const glow = this.pool.acquire(getCardGlowTexture())
      glow.anchor.set(0.5)
      glow.position.set(0, 0)
      glow.scale.set(1.15)
      glow.alpha = 0
      glow.eventMode = 'none'  // never intercept the card's own pointerdown
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

  private onHandCardClick(card: Card): void {
    const next = new Set(this.selectedIds)
    if (next.has(card.id)) next.delete(card.id)
    else next.add(card.id)

    this.lastSyncedSelected = new Set(next)
    this.selectedIds = next

    this.syncSelection({ myHand: Array.from(this.handEntries.values()).map(e => e.card) } as any, next)
    this.onSelectionChange?.(next)
  }

  // ─── Opponents ─────────────────────────────────────────────────────────

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

    // Detect opponent play → fly a card back from their zone to center
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

      // Create a temporary card-back sprite and fly it to center
      const flySprite = this.pool.acquire(getCardBackTexture())
      flySprite.anchor.set(0.5)
      flySprite.x = sourceSlot.x
      flySprite.y = sourceSlot.y
      flySprite.alpha = 1
      // Match the opponent card-back scale (falls back to 0.56 like before)
      const oppScale = oppSprites.length > 0
        ? oppSprites[oppSprites.length - 1].scale.x
        : (oppZone[0]?.scale ?? 0.56)
      flySprite.scale.set(oppScale)
      // Keep the transient fly-in back behind the actual played cards
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
      for (let i = oldVisible - 1; i >= visible; i--) {
        const sprite = current.pop()
        if (sprite) this.pool.release(sprite)
      }
    }

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

  // ─── Bottom cards ──────────────────────────────────────────────────────

  private syncBottomCards(s: LandlordClientState): void {
    const layout = this.lastLayout!
    const newCards = s.bottomCards

    if (newCards.length !== this.bottomEntries.length) {
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
      for (let i = 0; i < newCards.length; i++) {
        const card = newCards[i]
        const entry = this.bottomEntries[i]
        const slot = layout.bottomCards[i]
        if (!entry || !slot) continue

        if (entry.card.id !== card.id) {
          entry.card = card
          // Flip animation: scale.x 1→0, swap texture, 0→1
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

  // ─── Last play ─────────────────────────────────────────────────────────

  private syncLastPlay(s: LandlordClientState): void {
    const layout = this.lastLayout!
    const lp = s.gameInfo.lastPlay
    const newSig = playSignature(lp)

    if (newSig === this.lastPlaySig) {
      // No content change — just reposition
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

    // Content changed — release old sprites (with fade for pass, instant for play)
    const isPass = !lp || lp.cards.length === 0
    for (const entry of this.lastPlayEntries) {
      if (isPass) {
        // Pass: fade out gracefully
        gsap.to(entry.sprite, {
          alpha: 0,
          duration: 0.3,
          onComplete: () => this.pool.release(entry.sprite),
        })
      } else {
        // New play: release immediately (new sprites will appear)
        this.pool.release(entry.sprite)
      }
    }
    this.lastPlayEntries = []
    this.lastPlaySig = newSig

    if (!lp || lp.cards.length === 0) return

    // Create new last-play sprites — every play "lands" from below the slot.
    // A unified entry (vs. the old iJustPlayed scale-1.2 spawn) prevents the
    // ghosting that used to happen when my hand cards also flew to center.
    for (let i = 0; i < lp.cards.length; i++) {
      const card = lp.cards[i]
      const slot = layout.lastPlay[i]
      if (!slot) continue
      const tex = textureForCard(card)
      const sprite = this.pool.acquire(tex)
      sprite.anchor.set(0.5)
      sprite.x = slot.x
      sprite.y = slot.y + 40          // start just below the slot
      sprite.scale.set(slot.scale * 0.9)
      sprite.tint = 0xffffff          // clear any gold selection tint from pool reuse
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

  // ─── Turn indicator ────────────────────────────────────────────────────

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
   * Position a turn-indicator dot and light it up. Uses a *finite* one-shot
   * glow only when the turn *changes* to this dot — never an infinite tween —
   * so the on-demand render loop can go fully idle while waiting.
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

  private createTurnDot(): Graphics {
    const g = new Graphics()
    g.circle(0, 0, 6)
    g.fill(0x00ff88)
    return g
  }
}

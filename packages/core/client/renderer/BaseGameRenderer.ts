/**
 * BaseGameRenderer — abstract base class for game-specific renderers.
 *
 * Subclasses implement `doSync(state)` with their diff/reconcile logic.
 * This base class handles:
 *   - rAF coalescing (batches rapid state updates into a single frame)
 *   - on-demand rendering (only draws when there are active tweens or fresh state)
 *   - resize forwarding
 *   - cleanup / destroy lifecycle
 *
 * Rendering strategy:
 *   The PIXI Application is created with `autoStart: false` so it never runs
 *   an idle render loop. Instead, a single GSAP ticker callback drives rendering:
 *   it draws a frame only when (a) there is at least one active tween/animation,
 *   or (b) a fresh state update was just applied and needs to be shown. This
 *   keeps idle CPU/GPU cost near zero while preserving smooth animation.
 */
import type { Application } from 'pixi.js'
import { gsap } from 'gsap'
import { SpritePool } from './SpritePool'
import { destroyAllTextures } from './TextureFactory'

export abstract class BaseGameRenderer {
  protected app: Application
  protected pool: SpritePool
  private _pendingState: unknown = null
  private _rafId = 0
  private _needsRender = false
  /** True if the previous tick had at least one active tween. */
  private _hadActiveTweens = false
  private _loopRegistered = false

  constructor(app: Application) {
    this.app = app
    this.pool = new SpritePool(app.stage)
    // Run GSAP at the display's native refresh rate (no fixed 60fps cap) so
    // animations are as fluid as the screen allows. Idle cost stays ~zero
    // because renderTick only draws when there are active tweens or new state.
    this.ensureRenderLoop()
    // Draw the initial empty frame
    this.renderOnce()
  }

  /**
   * Queue a state update. Coalesced via requestAnimationFrame so that
   * multiple syncs arriving in the same frame are batched into one reconcile.
   * The *latest* state always wins. After reconciling we mark the frame dirty
   * so the render loop draws it.
   */
  sync(state: unknown, selectedIds?: Set<string>): void {
    this._pendingState = { state, selectedIds }
    if (!this._rafId) {
      this._rafId = requestAnimationFrame(() => {
        this._rafId = 0
        const pending = this._pendingState as { state: unknown; selectedIds?: Set<string> }
        this._pendingState = null
        if (pending) {
          this.doSync(pending.state, pending.selectedIds)
          this._needsRender = true
        }
      })
    }
  }

  /**
   * Subclass implements the actual diff/reconcile logic.
   * Called at most once per animation frame.
   */
  protected abstract doSync(state: unknown, selectedIds?: Set<string>): void

  /**
   * Called when the canvas is resized. Subclasses should reposition sprites.
   * Marks a render as needed.
   */
  onResize(): void {
    this._needsRender = true
  }

  /**
   * Hard-reset: kill all running animations and release all pooled sprites.
   * Call this when a new game round starts or the phase resets.
   */
  reset(): void {
    // Kill GSAP tweens on each active sprite before releasing
    for (const sprite of this.pool.activeSprites()) {
      gsap.killTweensOf(sprite)
    }
    this.pool.releaseAll()
    this._needsRender = true
  }

  /**
   * Full cleanup. Must be called when unmounting to prevent leaks.
   */
  destroy(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = 0
    }
    this._pendingState = null
    if (this._loopRegistered) {
      gsap.ticker.remove(this.renderTick)
      this._loopRegistered = false
    }
    gsap.globalTimeline.clear()
    this.pool.destroy()
    destroyAllTextures()
  }

  // ─── On-demand render loop ─────────────────────────────────────────────

  /** True if GSAP currently has at least one active tween/animation. */
  private hasActiveTweens(): boolean {
    return gsap.globalTimeline.getChildren(true, true, true).length > 0
  }

  /** Render only when there are active animations or a fresh state to draw. */
  private renderTick = (): void => {
    const active = this.hasActiveTweens()
    // Also draw on the frame right after the last tween completes. On that tick
    // the tween is already removed from the timeline, so a check of `active`
    // alone would skip the exact end state — leaving every animation stuck a
    // few pixels short until the next state arrives (a subtle jitter).
    if (this._needsRender || active || this._hadActiveTweens) {
      this._needsRender = false
      this.app.renderer.render(this.app.stage)
    }
    this._hadActiveTweens = active
  }

  /** Register the render callback on GSAP's ticker exactly once. */
  private ensureRenderLoop(): void {
    if (this._loopRegistered) return
    gsap.ticker.add(this.renderTick)
    this._loopRegistered = true
  }

  /** Force a single render immediately. */
  protected renderOnce(): void {
    this.app.renderer.render(this.app.stage)
  }
}

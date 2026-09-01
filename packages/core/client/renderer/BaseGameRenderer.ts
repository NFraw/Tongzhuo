/**
 * BaseGameRenderer — 游戏渲染器的抽象基类
 *
 * 子类实现 doSync(state) 方法，包含 diff/reconcile 逻辑。
 * 基类负责：
 *   - rAF 合并：将同帧内的多次 sync 合并为一次 reconcile
 *   - 按需渲染：只在有活跃动画或新状态时才绘制帧
 *   - 尺寸变化转发
 *   - 清理/销毁生命周期
 *
 * 渲染策略：
 *   PIXI Application 以 autoStart: false 创建，不会自动运行渲染循环。
 *   取而代之的是 GSAP ticker 回调驱动渲染：
 *   只在 (a) 有活跃的 tween/动画，或 (b) 刚收到新状态需要显示时才绘制帧。
 *   这样空闲时 CPU/GPU 开销接近零，同时动画依然流畅。
 *
 * 类比 C++：相当于一个抽象基类 Renderer，子类实现 virtual doSync()。
 *
 * 【如果你想继承此类】：
 *   1. 继承 BaseGameRenderer
 *   2. 实现 protected abstract doSync(state, selectedIds?)
 *   3. 可选覆盖 onResize()、reset()、destroy()
 *   4. 在构造函数中设置初始 Sprite 和 Container
 */
import type { Application } from 'pixi.js'
import { gsap } from 'gsap'
import { SpritePool } from './SpritePool'
import { destroyAllTextures } from './TextureFactory'

export abstract class BaseGameRenderer {
  protected app: Application
  protected pool: SpritePool
  /** 待处理的状态更新（rAF 合并用） */
  private _pendingState: unknown = null
  /** rAF 请求 ID（用于取消） */
  private _rafId = 0
  /** 是否需要在下一帧渲染 */
  private _needsRender = false
  /** 上一帧是否有活跃的 tween（用于判断动画结束帧） */
  private _hadActiveTweens = false
  /** GSAP ticker 回调是否已注册 */
  private _loopRegistered = false

  constructor(app: Application) {
    this.app = app
    this.pool = new SpritePool(app.stage)
    // 以显示器原生刷新率运行 GSAP（不固定 60fps），动画更流畅
    // 空闲时 renderTick 发现没有活跃 tween，跳过绘制，开销接近零
    this.ensureRenderLoop()
    // 绘制初始空帧
    this.renderOnce()
  }

  /**
   * 排队一个状态更新。通过 requestAnimationFrame 合并，
   * 同帧内多次 sync 只执行一次 reconcile。最新状态总是胜出。
   * reconcile 后标记帧为脏，让渲染循环绘制它。
   *
   * @param state       - 游戏状态（如 LandlordClientState）
   * @param selectedIds - 选中的卡牌 ID 集合（可选）
   *
   * 调用处：GameCanvas.tsx → useEffect 中调用 renderer.sync(state)
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
   * 子类实现的 diff/reconcile 逻辑。
   * 每个动画帧最多调用一次。
   *
   * @param state       - 游戏状态
   * @param selectedIds - 选中的卡牌 ID 集合
   */
  protected abstract doSync(state: unknown, selectedIds?: Set<string>): void

  /**
   * 画布尺寸变化时调用。子类应重新定位 Sprite。
   * 标记需要渲染。
   *
   * 调用处：GameCanvas.tsx → ResizeObserver 回调
   */
  onResize(): void {
    this._needsRender = true
  }

  /**
   * 硬重置：杀死所有运行中的动画，释放所有池化 Sprite。
   * 新一局开始或阶段重置时调用。
   */
  reset(): void {
    // 先杀死所有活跃 Sprite 上的 GSAP tween，避免释放后还回调
    for (const sprite of this.pool.activeSprites()) {
      gsap.killTweensOf(sprite)
    }
    this.pool.releaseAll()
    this._needsRender = true
  }

  /**
   * 完全清理。卸载时必须调用，防止内存泄漏。
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

  // ─── 按需渲染循环 ─────────────────────────────────────────────────────

  /** GSAP 当前是否有至少一个活跃的 tween/动画 */
  private hasActiveTweens(): boolean {
    return gsap.globalTimeline.getChildren(true, true, true).length > 0
  }

  /**
   * 只在有活跃动画或需要渲染时才绘制帧。
   *
   * 关键细节：动画结束的那一帧也要绘制。
   * 因为 tween 完成时已从 timeline 移除，如果只检查 active，
   * 会跳过精确的结束状态——导致动画差几个像素才到终点。
   */
  private renderTick = (): void => {
    const active = this.hasActiveTweens()
    if (this._needsRender || active || this._hadActiveTweens) {
      this._needsRender = false
      this.app.renderer.render(this.app.stage)
    }
    this._hadActiveTweens = active
  }

  /** 注册 GSAP ticker 回调（仅注册一次） */
  private ensureRenderLoop(): void {
    if (this._loopRegistered) return
    gsap.ticker.add(this.renderTick)
    this._loopRegistered = true
  }

  /** 立即绘制一帧 */
  protected renderOnce(): void {
    this.app.renderer.render(this.app.stage)
  }
}

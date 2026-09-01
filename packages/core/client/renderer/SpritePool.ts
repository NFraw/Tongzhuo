/**
 * SpritePool — PIXI.Sprite 对象池
 *
 * 对象池模式：避免频繁 new/destroy Sprite，减少 GC 压力。
 * 类比 C++：相当于一个预分配的对象池，acquire = 从池中取，release = 归还。
 *
 * 工作流程：
 *   acquire(texture) → 从池中取一个空闲 Sprite（或新建），设置纹理，加入父容器
 *   release(sprite)  → 从父容器移除，清除事件监听，放回池中等待复用
 *
 * 为什么需要对象池？
 *   每次 new Sprite + destroy 会触发 GPU 资源分配/释放和 JS GC。
 *   对象池让 Sprite 可以反复使用，避免这些开销。
 *   在动画密集的游戏中（如出牌飞行动画），这能显著减少卡顿。
 *
 * 【如果你想修改池行为】：
 *   - acquire() 中重置 Sprite 属性（alpha、scale、rotation、zIndex 等）
 *   - release() 中清理的属性
 *   - destroy() 中的清理逻辑
 */
import { Sprite, Container, Texture } from 'pixi.js'

export class SpritePool {
  /** 空闲 Sprite 池（等待被复用） */
  private pool: Sprite[] = []
  /** 当前正在使用的 Sprite 集合 */
  private active = new Set<Sprite>()
  /** 所有 Sprite 的父容器（通常是 app.stage 或某个 layer Container） */
  private parent: Container

  constructor(parent: Container) {
    this.parent = parent
  }

  /** 当前正在使用的 Sprite 数量（调试用） */
  get activeCount(): number {
    return this.active.size
  }

  /** 遍历所有正在使用的 Sprite（用于 reset 时杀死动画） */
  *activeSprites(): IterableIterator<Sprite> {
    yield* this.active
  }

  /** 池中空闲的 Sprite 数量（调试用） */
  get idleCount(): number {
    return this.pool.length
  }

  /**
   * 从池中获取一个 Sprite，设置纹理，加入父容器。
   *
   * @param texture - 要显示的纹理
   * @returns 配置好的 Sprite
   *
   * 调用处：
   *   - LandlordRenderer.ts → syncMyHand()、syncOpponents()、syncBottomCards()、syncLastPlay()
   *   - 任何需要显示卡牌/牌背的地方
   */
  acquire(texture: Texture): Sprite {
    let sprite = this.pool.pop()
    if (!sprite) {
      sprite = new Sprite(texture)
    } else {
      sprite.texture = texture
    }
    // 重置所有视觉属性（防止上一次使用的残留状态）
    sprite.visible = true
    sprite.alpha = 1
    sprite.scale.set(1)
    sprite.rotation = 0
    // 重置 zIndex：调用者会在 acquire 后立即设置新的 zIndex。
    // 如果不重置，复用的 Sprite 会保留上次的 zIndex（如手牌 zIndex=10），
    // 导致新的用途（如出牌区）中卡牌堆叠顺序错乱。
    sprite.zIndex = 0
    this.parent.addChild(sprite)
    this.active.add(sprite)
    return sprite
  }

  /**
   * 归还 Sprite 到池中。
   * 从父容器移除，清除所有事件监听，设为不可见。
   *
   * @param sprite - 要归还的 Sprite
   *
   * 调用处：
   *   - LandlordRenderer.ts → syncMyHand()（手牌移除）、syncLastPlay()（出牌区清理）
   *   - BaseGameRenderer.ts → reset()（全部归还）
   */
  release(sprite: Sprite): void {
    if (!this.active.has(sprite)) return
    this.active.delete(sprite)
    sprite.removeAllListeners()   // 清除点击等事件监听
    sprite.removeFromParent()     // 从父容器移除
    sprite.visible = false
    this.pool.push(sprite)
  }

  /**
   * 归还所有活跃的 Sprite。
   * 新一局开始或阶段切换时调用。
   */
  releaseAll(): void {
    for (const s of [...this.active]) this.release(s)
  }

  /**
   * 销毁所有 Sprite（池中 + 活跃的），释放 GPU 资源。
   * 组件卸载时调用。
   */
  destroy(): void {
    for (const s of this.active) {
      s.removeAllListeners()
      s.removeFromParent()
      s.destroy()
    }
    for (const s of this.pool) s.destroy()
    this.active.clear()
    this.pool.length = 0
  }
}

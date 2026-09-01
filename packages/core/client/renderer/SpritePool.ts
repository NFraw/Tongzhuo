/**
 * SpritePool — simple acquire/release pool for PIXI.Sprite objects.
 *
 * Sprites returned to the pool are hidden (visible=false, removed from parent)
 * and their event listeners are stripped. On acquire, the sprite is re-parented
 * and made visible again.
 */
import { Sprite, Container, Texture } from 'pixi.js'

export class SpritePool {
  private pool: Sprite[] = []
  private active = new Set<Sprite>()
  private parent: Container

  constructor(parent: Container) {
    this.parent = parent
  }

  /** Number of sprites currently in use. */
  get activeCount(): number {
    return this.active.size
  }

  /** Iterate over all currently active sprites. */
  *activeSprites(): IterableIterator<Sprite> {
    yield* this.active
  }

  /** Number of sprites available for reuse. */
  get idleCount(): number {
    return this.pool.length
  }

  /**
   * Get a sprite from the pool (or create a new one) with the given texture,
   * add it to the parent container, and mark it as active.
   */
  acquire(texture: Texture): Sprite {
    let sprite = this.pool.pop()
    if (!sprite) {
      sprite = new Sprite(texture)
    } else {
      sprite.texture = texture
    }
    sprite.visible = true
    sprite.alpha = 1
    sprite.scale.set(1)
    sprite.rotation = 0
    // Reset painter's order too: the callers set an explicit zIndex right after
    // acquire, and container layers are sortableChildren. A stale zIndex from a
    // previous life (e.g. a hand card with zIndex 10 reused as a last-play card)
    // would otherwise randomly mis-stack the cards.
    sprite.zIndex = 0
    this.parent.addChild(sprite)
    this.active.add(sprite)
    return sprite
  }

  /**
   * Return a sprite to the pool. Removes it from its parent,
   * strips all event listeners, and makes it invisible.
   */
  release(sprite: Sprite): void {
    if (!this.active.has(sprite)) return
    this.active.delete(sprite)
    sprite.removeAllListeners()
    sprite.removeFromParent()
    sprite.visible = false
    this.pool.push(sprite)
  }

  /**
   * Release all active sprites back to the pool.
   */
  releaseAll(): void {
    for (const s of [...this.active]) this.release(s)
  }

  /**
   * Destroy all sprites (both pooled and active) and clear state.
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

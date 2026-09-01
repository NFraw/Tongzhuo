// packages/core/shared/plugin.ts
import type { Card, DeckConfig } from './card'

export interface GameState {
  [key: string]: any
}

export interface ClientState {
  [key: string]: any
}

export interface BroadcastMessage {
  event: string
  data: any
  target?: 'all' | 'others' | 'self'  // 默认 'all'
}

export interface EventResult {
  state: GameState
  broadcast?: BroadcastMessage[]
  error?: string
  checkEndNow?: boolean  // 是否立即检查游戏结束
}

export interface GameComponentProps {
  state: ClientState
  playerId: string
  onAction: (event: string, payload: any) => void
  /** playerId → nickname lookup, used to render nicknames instead of generic
   * "玩家N"/"对手" labels. Optional — components fall back to generic labels. */
  playerNames?: Record<string, string>
}

export interface GamePlugin {
  id: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  deckConfig: DeckConfig
}

export interface GameServerPlugin extends GamePlugin {
  createInitialState(players: string[]): GameState
  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult
  getClientState(state: GameState, playerId: string): ClientState
  checkGameEnd(state: GameState): string | null
}

export interface GameClientPlugin extends GamePlugin {
  GameComponent: React.ComponentType<GameComponentProps>
  assets?: Record<string, string>
  renderer?: GameRendererFactory  // optional canvas renderer
}

/** Context passed to a GameRendererFactory at creation time */
export interface RendererFactoryContext {
  onAction: (event: string, payload: any) => void
  onSelectionChange?: (selectedIds: Set<string>) => void
}

/**
 * Factory function that a client plugin can register to provide canvas rendering.
 * Returns null if WebGL is unavailable or the renderer cannot be created.
 * The `app` parameter is the PIXI.Application already created by GameCanvas.
 * Uses `any` for app to avoid core-shared depending on pixi types.
 */
export type GameRendererFactory = (
  container: HTMLElement,
  ctx: RendererFactoryContext,
  app?: any  // PIXI.Application — typed as any to avoid pixi dependency in shared
) => Promise<{
  sync: (state: any, selectedIds?: Set<string>) => void
  onResize?: () => void
  destroy: () => void
} | null>

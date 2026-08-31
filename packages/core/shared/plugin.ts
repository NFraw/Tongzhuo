// packages/core/shared/plugin.ts
import type { Card, DeckConfig } from './card'

export interface GameState {
  [key: string]: any
}

export interface ClientState {
  [key: string]: any
}

export interface EventResult {
  state: GameState
  broadcast: { event: string; data: any }[]
  error?: string
}

export interface GameComponentProps {
  state: ClientState
  playerId: string
  onAction: (event: string, payload: any) => void
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
}

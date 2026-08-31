// packages/core/shared/room.ts
export type RoomPhase = 'waiting' | 'playing' | 'ended'

export interface Room {
  id: string
  gameId: string
  players: string[]
  state: any | null
  maxPlayers: number
  phase: RoomPhase
}

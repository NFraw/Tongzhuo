// packages/core/shared/room.ts
export type RoomPhase = 'waiting' | 'playing' | 'paused' | 'ended'

export interface RoomPlayer {
  id: string          // 稳定 UUID，持久化在 localStorage
  name: string        // 昵称
  socketId: string    // 当前活跃连接
  connected: boolean  // 是否在线
  ready: boolean      // 是否已准备
  seatIndex?: number
}

export interface Room {
  id: string
  gameId: string
  hostId: string      // 房主 playerId
  players: RoomPlayer[]
  state: any | null
  maxPlayers: number
  phase: RoomPhase
}

export interface RoomPlayerSummary {
  id: string
  name: string
  connected: boolean
  ready: boolean
}

export interface RoomSummary {
  roomId: string
  gameId: string
  gameName: string
  hostId: string
  players: number
  maxPlayers: number
  phase: RoomPhase
  playerList: RoomPlayerSummary[]
}

// packages/core/server/room-manager.ts
import { randomBytes } from 'crypto'
import type { Room } from '@huiming/core-shared'

export class RoomManager {
  private rooms = new Map<string, Room>()
  private playerToRoom = new Map<string, string>()

  createRoom(playerId: string, gameId: string, maxPlayers: number): Room {
    const id = randomBytes(4).toString('hex')
    const room: Room = {
      id,
      gameId,
      players: [playerId],
      state: null,
      maxPlayers,
      phase: 'waiting',
    }
    this.rooms.set(id, room)
    this.playerToRoom.set(playerId, id)
    return room
  }

  joinRoom(roomId: string, playerId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId)
    if (!room) return { success: false, reason: 'notFound' }
    if (room.players.length >= room.maxPlayers) return { success: false, reason: 'full' }

    room.players.push(playerId)
    this.playerToRoom.set(playerId, roomId)
    return { success: true }
  }

  findRoomByPlayer(playerId: string): Room | null {
    const roomId = this.playerToRoom.get(playerId)
    return roomId ? (this.rooms.get(roomId) ?? null) : null
  }

  removePlayer(playerId: string): void {
    const roomId = this.playerToRoom.get(playerId)
    if (!roomId) return
    const room = this.rooms.get(roomId)
    if (!room) return

    room.players = room.players.filter(id => id !== playerId)
    this.playerToRoom.delete(playerId)

    if (room.players.length === 0) {
      this.rooms.delete(roomId)
    }
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null
  }
}

// packages/core/server/room-manager.ts
import { randomBytes } from 'crypto'
import type { Room, RoomPlayer, RoomSummary, RoomPlayerSummary, RoomPhase } from '@huiming/core-shared'

export class RoomManager {
  private rooms = new Map<string, Room>()
  private playerToRoom = new Map<string, string>() // playerId -> roomId
  private socketToPlayer = new Map<string, string>() // socketId -> playerId
  private playerSockets = new Map<string, string>() // playerId -> socketId
  private playerNames = new Map<string, string>() // playerId -> name

  createRoom(player: RoomPlayer, gameId: string, maxPlayers: number): Room {
    const id = randomBytes(16).toString('base64url')
    const room: Room = {
      id,
      gameId,
      hostId: player.id,
      players: [{ ...player, ready: false }],
      state: null,
      maxPlayers,
      phase: 'waiting',
    }
    this.rooms.set(id, room)
    this.playerToRoom.set(player.id, id)
    this.socketToPlayer.set(player.socketId, player.id)
    this.playerSockets.set(player.id, player.socketId)
    return room
  }

  joinRoom(roomId: string, player: RoomPlayer): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId)
    if (!room) return { success: false, reason: 'notFound' }
    if (room.players.length >= room.maxPlayers) return { success: false, reason: 'full' }
    if (room.phase !== 'waiting') return { success: false, reason: 'started' }

    room.players.push({ ...player, ready: false })
    this.playerToRoom.set(player.id, roomId)
    this.socketToPlayer.set(player.socketId, player.id)
    this.playerSockets.set(player.id, player.socketId)
    return { success: true }
  }

  findRoomByPlayer(playerId: string): Room | null {
    const roomId = this.playerToRoom.get(playerId)
    return roomId ? (this.rooms.get(roomId) ?? null) : null
  }

  findRoomBySocket(socketId: string): Room | null {
    const playerId = this.socketToPlayer.get(socketId)
    if (!playerId) return null
    return this.findRoomByPlayer(playerId)
  }

  getPlayerId(socketId: string): string | null {
    return this.socketToPlayer.get(socketId) ?? null
  }

  getSocketId(playerId: string): string | null {
    return this.playerSockets.get(playerId) ?? null
  }

  updateSocket(playerId: string, newSocketId: string): void {
    const oldSocketId = this.playerSockets.get(playerId)
    if (oldSocketId) {
      this.socketToPlayer.delete(oldSocketId)
    }
    this.playerSockets.set(playerId, newSocketId)
    this.socketToPlayer.set(newSocketId, playerId)

    // Update player in room
    const roomId = this.playerToRoom.get(playerId)
    if (roomId) {
      const room = this.rooms.get(roomId)
      if (room) {
        const player = room.players.find(p => p.id === playerId)
        if (player) {
          player.socketId = newSocketId
          player.connected = true
        }
      }
    }
  }

  removePlayer(playerId: string): void {
    const roomId = this.playerToRoom.get(playerId)
    if (!roomId) return
    const room = this.rooms.get(roomId)
    if (!room) return

    room.players = room.players.filter(p => p.id !== playerId)
    this.playerToRoom.delete(playerId)

    const socketId = this.playerSockets.get(playerId)
    if (socketId) {
      this.socketToPlayer.delete(socketId)
    }
    this.playerSockets.delete(playerId)

    // Transfer host if the removed player was the host
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id
    }

    if (room.players.length === 0) {
      this.rooms.delete(roomId)
    }
  }

  disconnectPlayer(playerId: string): void {
    const roomId = this.playerToRoom.get(playerId)
    if (!roomId) return
    const room = this.rooms.get(roomId)
    if (!room) return

    const player = room.players.find(p => p.id === playerId)
    if (player) {
      player.connected = false
    }

    const socketId = this.playerSockets.get(playerId)
    if (socketId) {
      this.socketToPlayer.delete(socketId)
    }
    this.playerSockets.delete(playerId)
  }

  setPlayerName(playerId: string, name: string): void {
    this.playerNames.set(playerId, name)
  }

  getPlayerName(playerId: string): string {
    return this.playerNames.get(playerId) || 'Player'
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null
  }

  setPlayerReady(playerId: string, ready: boolean): boolean {
    const room = this.findRoomByPlayer(playerId)
    if (!room) return false
    const player = room.players.find(p => p.id === playerId)
    if (!player) return false
    player.ready = ready
    return true
  }

  isAllReady(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room || room.players.length === 0) return false
    return room.players.every(p => p.ready)
  }

  getPlayerListSummary(roomId: string): RoomPlayerSummary[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      ready: p.ready,
    }))
  }

  getRoomSummaries(): RoomSummary[] {
    const summaries: RoomSummary[] = []
    for (const room of this.rooms.values()) {
      summaries.push({
        roomId: room.id,
        gameId: room.gameId,
        gameName: room.gameId, // TODO: get from plugin
        hostId: room.hostId,
        players: room.players.length,
        maxPlayers: room.maxPlayers,
        phase: room.phase,
        playerList: room.players.map(p => ({
          id: p.id,
          name: p.name,
          connected: p.connected,
          ready: p.ready,
        })),
      })
    }
    return summaries
  }

  getRoomSummary(roomId: string): RoomSummary | null {
    const room = this.rooms.get(roomId)
    if (!room) return null
    return {
      roomId: room.id,
      gameId: room.gameId,
      gameName: room.gameId,
      hostId: room.hostId,
      players: room.players.length,
      maxPlayers: room.maxPlayers,
      phase: room.phase,
      playerList: room.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        ready: p.ready,
      })),
    }
  }

  getRoomDetailForPlayer(roomId: string, playerId: string) {
    const room = this.rooms.get(roomId)
    if (!room) return null
    return {
      roomId: room.id,
      gameId: room.gameId,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      phase: room.phase,
      playerList: room.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        ready: p.ready,
      })),
      isHost: room.hostId === playerId,
    }
  }
}

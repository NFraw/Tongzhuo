/**
 * room-manager.ts — 房间管理器
 *
 * 管理所有游戏房间的生命周期：创建、加入、离开、断线、销毁。
 * 类比 Java：相当于一个 RoomService，维护所有房间和玩家的内存状态。
 *
 * 内部使用 5 个 Map 维护双向映射关系：
 *   - rooms: roomId → Room（房间数据）
 *   - playerToRoom: playerId → roomId（玩家在哪个房间）
 *   - socketToPlayer: socketId → playerId（Socket 连接对应哪个玩家）
 *   - playerSockets: playerId → socketId（玩家当前的 Socket 连接）
 *   - playerNames: playerId → 昵称
 *
 * 设计要点：
 *   - 玩家 ID 是稳定的（存于 localStorage），Socket ID 是临时的（每次连接不同）
 *   - 断线重连时，通过 playerId 找到房间，更新 socketId 映射
 *   - 房主离开时自动转让房主给第一个玩家
 *   - 游戏中离开会解散整个房间
 */
import { randomBytes } from 'crypto'
import type { Room, RoomPlayer, RoomSummary, RoomPlayerSummary, RoomPhase } from '@tongzhuo/core-shared'

export class RoomManager {
  private rooms = new Map<string, Room>()
  private playerToRoom = new Map<string, string>()
  private socketToPlayer = new Map<string, string>()
  private playerSockets = new Map<string, string>()
  private playerNames = new Map<string, string>()

  /**
   * 创建新房间。创建者自动成为房主。
   *
   * @param player    - 创建者信息
   * @param gameId    - 游戏类型（如 'landlord'）
   * @param maxPlayers - 最大玩家数
   * @returns 新创建的 Room 对象
   *
   * 调用处：socket-framework.ts → room:create 事件处理
   */
  createRoom(player: RoomPlayer, gameId: string, maxPlayers: number): Room {
    const id = randomBytes(16).toString('base64url')  // 生成安全的随机房间 ID
    const room: Room = {
      id,
      gameId,
      hostId: player.id,  // 创建者即房主
      players: [{ ...player, ready: false }],
      state: null,  // 游戏状态在 room:start 时创建
      maxPlayers,
      phase: 'waiting',
    }
    this.rooms.set(id, room)
    this.playerToRoom.set(player.id, id)
    this.socketToPlayer.set(player.socketId, player.id)
    this.playerSockets.set(player.id, player.socketId)
    return room
  }

  /**
   * 加入房间。
   *
   * 校验：房间存在、未满、未开始。
   *
   * 调用处：socket-framework.ts → room:join 事件处理
   */
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

  /** 通过玩家 ID 查找所在房间（断线重连时用） */
  findRoomByPlayer(playerId: string): Room | null {
    const roomId = this.playerToRoom.get(playerId)
    return roomId ? (this.rooms.get(roomId) ?? null) : null
  }

  /** 通过 Socket ID 查找所在房间 */
  findRoomBySocket(socketId: string): Room | null {
    const playerId = this.socketToPlayer.get(socketId)
    if (!playerId) return null
    return this.findRoomByPlayer(playerId)
  }

  /** Socket ID → 玩家 ID */
  getPlayerId(socketId: string): string | null {
    return this.socketToPlayer.get(socketId) ?? null
  }

  /** 玩家 ID → Socket ID */
  getSocketId(playerId: string): string | null {
    return this.playerSockets.get(playerId) ?? null
  }

  /**
   * 更新玩家的 Socket 连接（断线重连时调用）。
   * 清除旧的 socketId 映射，建立新的映射。
   */
  updateSocket(playerId: string, newSocketId: string): void {
    const oldSocketId = this.playerSockets.get(playerId)
    if (oldSocketId) {
      this.socketToPlayer.delete(oldSocketId)
    }
    this.playerSockets.set(playerId, newSocketId)
    this.socketToPlayer.set(newSocketId, playerId)

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

  /**
   * 移除玩家（离开房间时调用）。
   * 如果被移除的是房主，自动转让给第一个剩余玩家。
   * 如果房间空了，删除房间。
   */
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

    // 房主离开 → 转让
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id
    }

    if (room.players.length === 0) {
      this.rooms.delete(roomId)
    }
  }

  /** 标记玩家断线（不移除，等待重连） */
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

  /** 获取所有房间的摘要列表（用于大厅显示） */
  getRoomSummaries(): RoomSummary[] {
    const summaries: RoomSummary[] = []
    for (const room of this.rooms.values()) {
      summaries.push({
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

  /** 获取房间详情（含 isHost 标记，用于客户端显示房主按钮） */
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

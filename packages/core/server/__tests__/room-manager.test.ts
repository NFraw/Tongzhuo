// packages/core/server/__tests__/room-manager.test.ts
import { describe, it, expect } from 'vitest'
import { RoomManager } from '../room-manager'
import type { RoomPlayer } from '@tongzhuo/core-shared'

function createTestPlayer(id: string, socketId?: string): RoomPlayer {
  return {
    id,
    name: `Player-${id}`,
    socketId: socketId || `socket-${id}`,
    connected: true,
    ready: false,
  }
}

describe('RoomManager', () => {
  it('should create a room', () => {
    const manager = new RoomManager()
    const player = createTestPlayer('player1')
    const room = manager.createRoom(player, 'test-game', 2)
    expect(room.id).toBeTruthy()
    expect(room.players).toHaveLength(1)
    expect(room.players[0].id).toBe('player1')
    expect(room.gameId).toBe('test-game')
    expect(room.phase).toBe('waiting')
  })

  it('should allow second player to join', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    const p2 = createTestPlayer('p2')
    const room = manager.createRoom(p1, 'test-game', 2)
    const result = manager.joinRoom(room.id, p2)
    expect(result.success).toBe(true)
    expect(room.players).toHaveLength(2)
    expect(room.players[0].id).toBe('p1')
    expect(room.players[1].id).toBe('p2')
  })

  it('should reject third player when full', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    const p2 = createTestPlayer('p2')
    const p3 = createTestPlayer('p3')
    const room = manager.createRoom(p1, 'test-game', 2)
    manager.joinRoom(room.id, p2)
    const result = manager.joinRoom(room.id, p3)
    expect(result.success).toBe(false)
    expect(result.reason).toBe('full')
  })

  it('should reject non-existent room', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    expect(manager.joinRoom('nope', p1)).toEqual({ success: false, reason: 'notFound' })
  })

  it('should find room by player', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    const room = manager.createRoom(p1, 'test-game', 2)
    expect(manager.findRoomByPlayer('p1')).toBe(room)
    expect(manager.findRoomByPlayer('p2')).toBeNull()
  })

  it('should find room by socket', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1', 'socket-123')
    const room = manager.createRoom(p1, 'test-game', 2)
    expect(manager.findRoomBySocket('socket-123')).toBe(room)
    expect(manager.findRoomBySocket('socket-456')).toBeNull()
  })

  it('should remove player and clean up empty room', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    manager.createRoom(p1, 'test-game', 2)
    manager.removePlayer('p1')
    expect(manager.findRoomByPlayer('p1')).toBeNull()
  })

  it('should disconnect player without removing from room', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    manager.createRoom(p1, 'test-game', 2)
    manager.disconnectPlayer('p1')
    const room = manager.findRoomByPlayer('p1')
    expect(room).not.toBeNull()
    expect(room!.players[0].connected).toBe(false)
  })

  it('should update socket for reconnection', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1', 'old-socket')
    manager.createRoom(p1, 'test-game', 2)
    manager.updateSocket('p1', 'new-socket')
    expect(manager.getSocketId('p1')).toBe('new-socket')
    expect(manager.getPlayerId('new-socket')).toBe('p1')
  })

  it('should track host on create', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    const room = manager.createRoom(p1, 'test-game', 2)
    expect(room.hostId).toBe('p1')
    expect(room.players[0].ready).toBe(false)
  })

  it('should set player ready', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    const p2 = createTestPlayer('p2')
    const room = manager.createRoom(p1, 'test-game', 2)
    manager.joinRoom(room.id, p2)
    expect(manager.isAllReady(room.id)).toBe(false)
    manager.setPlayerReady('p1', true)
    expect(manager.isAllReady(room.id)).toBe(false)
    manager.setPlayerReady('p2', true)
    expect(manager.isAllReady(room.id)).toBe(true)
  })

  it('should transfer host when host leaves', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    const p2 = createTestPlayer('p2')
    const room = manager.createRoom(p1, 'test-game', 2)
    manager.joinRoom(room.id, p2)
    expect(room.hostId).toBe('p1')
    manager.removePlayer('p1')
    expect(room.hostId).toBe('p2')
  })

  it('should return room detail for player', () => {
    const manager = new RoomManager()
    const p1 = createTestPlayer('p1')
    const p2 = createTestPlayer('p2')
    const room = manager.createRoom(p1, 'test-game', 3)
    manager.joinRoom(room.id, p2)
    const detail = manager.getRoomDetailForPlayer(room.id, 'p1')
    expect(detail).not.toBeNull()
    expect(detail!.isHost).toBe(true)
    expect(detail!.hostId).toBe('p1')
    expect(detail!.playerList).toHaveLength(2)
    expect(detail!.playerList[0].ready).toBe(false)
  })
})

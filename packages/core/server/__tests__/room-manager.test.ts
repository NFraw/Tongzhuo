// packages/core/server/__tests__/room-manager.test.ts
import { describe, it, expect } from 'vitest'
import { RoomManager } from '../room-manager'

describe('RoomManager', () => {
  it('should create a room', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('player1', 'test-game', 2)
    expect(room.id).toBeTruthy()
    expect(room.players).toEqual(['player1'])
    expect(room.gameId).toBe('test-game')
    expect(room.phase).toBe('waiting')
  })

  it('should allow second player to join', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('p1', 'test-game', 2)
    const result = manager.joinRoom(room.id, 'p2')
    expect(result.success).toBe(true)
    expect(room.players).toEqual(['p1', 'p2'])
  })

  it('should reject third player when full', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('p1', 'test-game', 2)
    manager.joinRoom(room.id, 'p2')
    const result = manager.joinRoom(room.id, 'p3')
    expect(result.success).toBe(false)
    expect(result.reason).toBe('full')
  })

  it('should reject non-existent room', () => {
    const manager = new RoomManager()
    expect(manager.joinRoom('nope', 'p1')).toEqual({ success: false, reason: 'notFound' })
  })

  it('should find room by player', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('p1', 'test-game', 2)
    expect(manager.findRoomByPlayer('p1')).toBe(room)
    expect(manager.findRoomByPlayer('p2')).toBeNull()
  })

  it('should remove player and clean up empty room', () => {
    const manager = new RoomManager()
    manager.createRoom('p1', 'test-game', 2)
    manager.removePlayer('p1')
    expect(manager.findRoomByPlayer('p1')).toBeNull()
  })
})

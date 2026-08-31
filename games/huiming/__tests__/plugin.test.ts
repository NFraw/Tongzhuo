// games/huiming/__tests__/plugin.test.ts
import { describe, it, expect } from 'vitest'
import { huimingServerPlugin } from '../plugin'
import type { GameState } from '@huiming/core-shared'

describe('huimingServerPlugin client state', () => {
  it('hides the value of face-down cards from a player', () => {
    const state: GameState = huimingServerPlugin.createInitialState(['p1', 'p2'])
    const cs = huimingServerPlugin.getClientState(state, 'p1')
    // The center (2,2) is the face-down Joker — the client must not see its
    // value, only that the cell exists and is face-down.
    const cell = cs.board[2][2]
    expect(cell.exists).toBe(true)
    expect(cell.faceUp).toBe(false)
    expect(cell.card).toBeNull()
  })
  it('rejects dark-pick of the face-down Joker', () => {
    const state: GameState = huimingServerPlugin.createInitialState(['p1', 'p2'])
    const res = huimingServerPlugin.handleEvent(state, 'p1', 'darkPick', { row: 2, col: 2 })
    expect(res.error).toBe('不能取这张牌')
  })
  it('allows dark-pick of a face-down non-Joker', () => {
    const state: GameState = huimingServerPlugin.createInitialState(['p1', 'p2'])
    // (0,0) is never the Joker (Joker is fixed at the center).
    const res = huimingServerPlugin.handleEvent(state, 'p1', 'darkPick', { row: 0, col: 0 })
    expect(res.error).toBeUndefined()
    expect(res.state.players[0].hand.length).toBe(1)
  })
})

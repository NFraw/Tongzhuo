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
  it('enters placing phase when last card is dark-picked and no winner', () => {
    // Build a minimal board: only1 card left, face-down, not a Joker.
    // Give each player a hand that doesn't satisfy any 6-suit win condition.
    const state: GameState = huimingServerPlugin.createInitialState(['p1', 'p2'])
    const g = state as any
    // Clear the board except (0,0).
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r !== 0 || c !== 0) g.board[r][c].card = null
      }
    }
    // Put one non-Joker card at (0,0), face-down.
    g.board[0][0].card = { id: 'test-h1', suit: 'hearts', rank: '1', value: 1, deckIndex: 0 }
    g.board[0][0].faceUp = false
    // Give each player a hand with equal max-suit counts so no winner is declared.
    // P0: hearts(2) + spades(1) after taking → max suit = hearts = 2
    // P1: diamonds(2) + clubs(1)            → max suit = diamonds = 2
    g.players[0].hand = [
      { id: 'h2', suit: 'hearts', rank: '2', value: 2, deckIndex: 1 },
      { id: 's1', suit: 'spades', rank: '1', value: 1, deckIndex: 2 },
    ]
    g.players[1].hand = [
      { id: 'd1', suit: 'diamonds', rank: '1', value: 1, deckIndex: 3 },
      { id: 'd2', suit: 'diamonds', rank: '2', value: 2, deckIndex: 4 },
      { id: 'c1', suit: 'clubs', rank: '1', value: 1, deckIndex: 5 },
    ]
    g.players[0].darkPickCharges = 1
    g.phase = 'taking'
    g.currentTurn = 0

    const res = huimingServerPlugin.handleEvent(state, 'p1', 'darkPick', { row: 0, col: 0 })
    expect(res.error).toBeUndefined()
    expect(res.state.phase).toBe('placing')
    expect(res.state.players[0].canPlace).toBe(true)
    expect(res.state.players[1].canPlace).toBe(true)
  })
  it('skips placing turn when player cannot place, and transitions to taking when both cannot', () => {
    const state: GameState = huimingServerPlugin.createInitialState(['p1', 'p2'])
    const g = state as any
    // Set up a placing phase where both players have already used canPlace.
    g.phase = 'placing'
    g.currentTurn = 0
    g.players[0].canPlace = false
    g.players[1].canPlace = false
    // Put one empty cell so the "hasEmpty" path is taken.
    g.board[0][0].card = null
    // Place action should skip P0 (can't place) and, since P1 also can't,
    // transition to taking.
    const res = huimingServerPlugin.handleEvent(state, 'p1', 'place', { cardId: 'x', row: 0, col: 0, faceUp: true })
    expect(res.error).toBeUndefined()
    expect(res.state.phase).toBe('taking')
    expect(res.state.currentTurn).toBe(1) // turn passed to P1
  })
})

import { describe, it, expect } from 'vitest'
import type { Card } from '@huiming/core-shared'
import {
  cattleHeads,
  buildDeck,
  createNimmtGame,
  findTargetRow,
  selectCard,
  chooseRow,
  computeWinner,
} from '../engine'
import type { NimmtState } from '../types'

function card(value: number): Card {
  return { id: `n${value}`, suit: 'none', rank: String(value), value, deckIndex: value - 1 }
}

function row(...values: number[]): Card[] {
  return values.map(card)
}

interface MkPlayer {
  id: string
  handValues: number[]
  score?: number
}

function mkState(players: MkPlayer[], boardRows: number[][]): NimmtState {
  return {
    players: players.map(p => ({
      id: p.id,
      hand: p.handValues.map(card),
      score: p.score ?? 0,
      scorePile: [],
    })),
    board: boardRows.map(values => row(...values)),
    phase: 'selecting',
    round: 1,
    committed: players.map(() => null),
    revealQueue: [],
    resolveStep: 0,
    pendingPickup: null,
    pendingCard: null,
    resolveSteps: [],
    lastResolve: null,
    winner: null,
    winnerIndex: null,
  }
}

describe('cattleHeads', () => {
  it('computes bull-head penalty per the 6 Nimmt rules', () => {
    expect(cattleHeads(1)).toBe(1)
    expect(cattleHeads(5)).toBe(2)
    expect(cattleHeads(10)).toBe(3)
    expect(cattleHeads(11)).toBe(5)
    expect(cattleHeads(20)).toBe(3)
    expect(cattleHeads(55)).toBe(7)
    expect(cattleHeads(100)).toBe(3)
    expect(cattleHeads(104)).toBe(1)
  })
})

describe('buildDeck', () => {
  it('builds 104 ordered cards with unique values', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(104)
    expect(deck[0].value).toBe(1)
    expect(deck[103].value).toBe(104)
    expect(deck.map(c => c.value)).toEqual(Array.from({ length: 104 }, (_, i) => i + 1))
  })
})

describe('createNimmtGame', () => {
  it('deals 10 cards per player and seeds 4 rows of one card', () => {
    const state = createNimmtGame(['a', 'b', 'c'])
    expect(state.phase).toBe('selecting')
    expect(state.round).toBe(1)
    expect(state.players).toHaveLength(3)
    for (const p of state.players) expect(p.hand).toHaveLength(10)
    expect(state.board).toHaveLength(4)
    for (const r of state.board) expect(r).toHaveLength(1)
    // No card is shared between hands and the board start cards.
    const allIds = [
      ...state.players.flatMap(p => p.hand.map(c => c.id)),
      ...state.board.flatMap(r => r.map(c => c.id)),
    ]
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

describe('findTargetRow', () => {
  it('picks the row whose end is the closest lower value', () => {
    const board = [row(30), row(29), row(10), row(5)]
    expect(findTargetRow(board, 33)).toBe(0) // 30 is closest below
    expect(findTargetRow(board, 31)).toBe(0)
    expect(findTargetRow(board, 29)).toBe(2) // 10 is the highest below 29
    expect(findTargetRow(board, 6)).toBe(3) // 5 is highest below 6
  })

  it('returns null when the card is lower than every row end', () => {
    const board = [row(10), row(20), row(30), row(40)]
    expect(findTargetRow(board, 5)).toBeNull()
  })
})

describe('selectCard', () => {
  it('keeps selecting phase until every player has committed', () => {
    const state = mkState(
      [{ id: 'a', handValues: [6] }, { id: 'b', handValues: [7] }],
      [[1], [2], [3], [4]],
    )
    expect(selectCard(state, 0, 'n6')).toBe(true)
    expect(state.phase).toBe('selecting')
    expect(selectCard(state, 1, 'n7')).toBe(true)
    // All committed -> round resolves (no pickup) and next round begins.
    expect(state.phase).toBe('selecting')
    expect(state.round).toBe(2)
    expect(state.board[3].map(c => c.value)).toEqual([4, 6, 7])
    expect(state.players[0].hand).toHaveLength(0)
    expect(state.lastResolve).toHaveLength(2)
  })

  it('returns the previous committed card when re-selecting', () => {
    const state = mkState(
      [{ id: 'a', handValues: [6, 8] }, { id: 'b', handValues: [7] }],
      [[1], [2], [3], [4]],
    )
    selectCard(state, 0, 'n6')
    expect(state.committed[0]?.value).toBe(6)
    selectCard(state, 0, 'n8')
    expect(state.committed[0]?.value).toBe(8)
    expect(state.players[0].hand.map(c => c.value)).toContain(6)
  })

  it('rejects a card not in hand', () => {
    const state = mkState([{ id: 'a', handValues: [6] }], [[1], [2], [3], [4]])
    expect(selectCard(state, 0, 'n99')).toBe(false)
    expect(state.committed[0]).toBeNull()
  })
})

describe('chooseRow / pickup flow', () => {
  it('pauses when a card is lower than every row end, then resumes after choosing a row', () => {
    const state = mkState(
      [{ id: 'a', handValues: [5] }, { id: 'b', handValues: [7] }],
      [[10], [11], [12], [13]],
    )
    selectCard(state, 0, 'n5')
    expect(state.phase).toBe('selecting')

    selectCard(state, 1, 'n7') // all committed -> resolve
    expect(state.phase).toBe('resolving')
    expect(state.pendingPickup).toBe(0)
    expect(state.pendingCard?.value).toBe(5)

    chooseRow(state, 0, 2) // player a picks row 2 (value 12, 1 head)
    expect(state.players[0].score).toBe(1)
    expect(state.board[2].map(c => c.value)).toEqual([5, 7])
    expect(state.round).toBe(2)
    expect(state.phase).toBe('selecting')
    expect(state.pendingPickup).toBeNull()
  })

  it('recovers the full 5-card row when the 6th card is placed', () => {
    const state = mkState(
      [{ id: 'a', handValues: [7] }, { id: 'b', handValues: [8] }],
      [[1, 2, 3, 4, 5], [50], [60], [70]],
    )
    // row0 ends at 5; card 7 -> target row0 (5 closest below), full -> pickup
    selectCard(state, 0, 'n7')
    selectCard(state, 1, 'n8')
    // a took [1,2,3,4,5]; heads = 1+1+1+1+2 = 6
    expect(state.players[0].score).toBe(6)
    expect(state.board[0].map(c => c.value)).toEqual([7, 8])
    expect(state.round).toBe(2)
  })
})

describe('computeWinner', () => {
  it('returns the lowest score', () => {
    const state = mkState(
      [{ id: 'a', handValues: [], score: 5 }, { id: 'b', handValues: [], score: 8 }],
      [[1], [2], [3], [4]],
    )
    expect(computeWinner(state)).toBe(0)
  })

  it('breaks ties by fewer collected cards, then lower index', () => {
    const a = mkState(
      [{ id: 'a', handValues: [], score: 5 }, { id: 'b', handValues: [], score: 5 }],
      [[1], [2], [3], [4]],
    )
    a.players[1].scorePile = [card(1), card(2)] // b has more collected cards
    expect(computeWinner(a)).toBe(0)

    const b = mkState(
      [{ id: 'a', handValues: [], score: 5 }, { id: 'b', handValues: [], score: 5 }],
      [[1], [2], [3], [4]],
    )
    b.players[0].scorePile = [card(1)]
    b.players[1].scorePile = [card(1)]
    expect(computeWinner(b)).toBe(0) // fully tied -> lower index
  })
})

// games/huiming/__tests__/rules.test.ts
import { describe, it, expect } from 'vitest'
import { canTake, canPlace, canDarkPick, checkWinner, countMaxSuit } from '../rules'
import { initHuimingGame } from '../engine'
import type { Card } from '@tongzhuo/core-shared'

describe('canTake', () => {
  it('can take face-up card', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[0][0].faceUp = true
    expect(canTake(game, 0, 0, 0)).toBe(true)
  })
  it('cannot take face-down without charges', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].darkPickCharges = 0
    expect(canTake(game, 0, 0, 0)).toBe(false)
  })
  it('can take face-down with charges', () => {
    const game = initHuimingGame(['p1', 'p2'])
    expect(canTake(game, 0, 0, 0)).toBe(true)
  })
  it('can dark pick a face-down joker with charges', () => {
    const game = initHuimingGame(['p1', 'p2'])
    // The Joker is fixed at the center (2,2) and starts face-down.
    expect(game.board[2][2].card?.suit.toString().startsWith('joker')).toBe(true)
    expect(game.board[2][2].faceUp).toBe(false)
    expect(game.players[0].darkPickCharges).toBeGreaterThan(0)
    expect(canTake(game, 2, 2, 0)).toBe(true)
  })
  it('can take a face-up joker', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[2][2].faceUp = true
    expect(canTake(game, 2, 2, 0)).toBe(true)
  })
  it('cannot take from empty', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[0][0].card = null
    expect(canTake(game, 0, 0, 0)).toBe(false)
  })
})

describe('canPlace', () => {
  it('can place with ability and hand', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].hand.push({ id: 'x', suit: 'hearts', rank: '1', value: 1, deckIndex: 0 })
    expect(canPlace(game, 0)).toBe(true)
  })
  it('cannot place without ability', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].canPlace = false
    expect(canPlace(game, 0)).toBe(false)
  })
  it('cannot place with empty hand', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].hand = []
    expect(canPlace(game, 0)).toBe(false)
  })
})

describe('canDarkPick', () => {
  it('can dark pick with charges', () => {
    const game = initHuimingGame(['p1', 'p2'])
    expect(canDarkPick(game, 0)).toBe(true)
  })
  it('cannot dark pick without charges', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].darkPickCharges = 0
    expect(canDarkPick(game, 0)).toBe(false)
  })
})

describe('checkWinner', () => {
  it('detects 6 of same suit', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].hand = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`, suit: 'hearts', rank: String(i+1), value: i+1, deckIndex: i,
    }))
    expect(checkWinner(game.players[0])).toBe(true)
  })
  it('returns false with 5', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].hand = Array.from({ length: 5 }, (_, i) => ({
      id: `h${i}`, suit: 'hearts', rank: String(i+1), value: i+1, deckIndex: i,
    }))
    expect(checkWinner(game.players[0])).toBe(false)
  })
  it('joker counts as any suit', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].hand = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `h${i}`, suit: 'hearts', rank: String(i+1), value: i+1, deckIndex: i,
      })),
      { id: 'j', suit: 'joker_red', rank: 'JOKER', value: 0, deckIndex: 24 },
    ]
    expect(checkWinner(game.players[0])).toBe(true)
  })
})

describe('countMaxSuit', () => {
  it('counts most common suit plus jokers', () => {
    const hand: Card[] = [
      { id: 'h1', suit: 'hearts', rank: '1', value: 1, deckIndex: 0 },
      { id: 'h2', suit: 'hearts', rank: '2', value: 2, deckIndex: 1 },
      { id: 's1', suit: 'spades', rank: '1', value: 1, deckIndex: 2 },
      { id: 'j', suit: 'joker_red', rank: 'JOKER', value: 0, deckIndex: 3 },
    ]
    expect(countMaxSuit(hand)).toBe(3)
  })
})

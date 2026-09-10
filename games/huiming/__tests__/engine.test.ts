// games/huiming/__tests__/engine.test.ts
import { describe, it, expect } from 'vitest'
import { createHuimingBoard, initHuimingGame, takeCard, placeCard, flipNeighbors, checkAllFaceDown, grantDarkPickCharges } from '../engine'

describe('createHuimingBoard', () => {
  it('should create 5x5 grid with 25 cards', () => {
    const board = createHuimingBoard()
    expect(board).toHaveLength(5)
    board.forEach(row => expect(row).toHaveLength(5))
    let count = 0
    board.forEach(row => row.forEach(cell => { if (cell.card) count++ }))
    expect(count).toBe(25)
  })

  it('should have joker at center (2,2)', () => {
    const board = createHuimingBoard()
    expect(board[2][2].card?.suit).toMatch(/joker/)
  })

  it('should have all cards face down', () => {
    const board = createHuimingBoard()
    board.forEach(row => row.forEach(cell => {
      if (cell.card) expect(cell.faceUp).toBe(false)
    }))
  })
})

describe('initHuimingGame', () => {
  it('should initialize correctly', () => {
    const game = initHuimingGame(['p1', 'p2'])
    expect(game.players).toHaveLength(2)
    expect(game.currentTurn).toBe(0)
    expect(game.phase).toBe('taking')
    expect(game.round).toBe(1)
    expect(game.winner).toBeNull()
  })

  it('should initialize any number of players', () => {
    const game = initHuimingGame(['p1', 'p2', 'p3', 'p4'])
    expect(game.players).toHaveLength(4)
    expect(game.players.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(game.currentTurn).toBe(0)
  })
})

describe('takeCard', () => {
  it('should take a face-up card', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[0][0].faceUp = true
    const card = game.board[0][0].card!
    const result = takeCard(game, 0, 0, 0)
    expect(result.success).toBe(true)
    expect(game.board[0][0].card).toBeNull()
    expect(game.players[0].hand).toContainEqual(card)
  })

  it('should fail on empty cell', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[0][0].card = null
    expect(takeCard(game, 0, 0, 0).success).toBe(false)
  })

  it('should fail on face-down without charges', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].darkPickCharges = 0
    expect(takeCard(game, 0, 0, 0).success).toBe(false)
  })

  it('should deduct dark pick charge', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].darkPickCharges = 1
    takeCard(game, 0, 0, 0)
    expect(game.players[0].darkPickCharges).toBe(0)
  })
})

describe('flipNeighbors', () => {
  it('should flip 4 adjacent cards', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board.forEach(row => row.forEach(cell => { if (cell.card) cell.faceUp = false }))
    game.board[1][2].faceUp = true
    game.board[3][2].faceUp = true
    game.board[2][1].faceUp = true
    game.board[2][3].faceUp = true
    flipNeighbors(game.board, 2, 2)
    expect(game.board[1][2].faceUp).toBe(false)
    expect(game.board[3][2].faceUp).toBe(false)
    expect(game.board[2][1].faceUp).toBe(false)
    expect(game.board[2][3].faceUp).toBe(false)
  })

  it('should skip empty cells', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[1][2].card = null
    expect(() => flipNeighbors(game.board, 2, 2)).not.toThrow()
  })
})

describe('placeCard', () => {
  it('should place card from hand to empty cell', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[0][0].card = null
    const card = { id: 'test', suit: 'hearts', rank: '1', value: 1, deckIndex: 0 }
    game.players[0].hand.push(card)
    game.players[0].canPlace = true
    const result = placeCard(game, 0, 'test', 0, 0, true)
    expect(result.success).toBe(true)
    // 断言整张牌而不是 `card?.id`：上面那句 `card = null` 会让 TS 把该格子
    // 一直收窄成 never，直接取 `.id` 会报 TS2339（收窄不会被函数调用打断）。
    expect(game.board[0][0].card).toEqual(card)
    expect(game.players[0].canPlace).toBe(false)
  })

  it('should fail without place ability', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.players[0].canPlace = false
    expect(placeCard(game, 0, 'test', 0, 0, true).success).toBe(false)
  })
})

describe('checkAllFaceDown', () => {
  it('should return true when all face down', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board.forEach(row => row.forEach(cell => { if (cell.card) cell.faceUp = false }))
    expect(checkAllFaceDown(game.board)).toBe(true)
  })

  it('should return false when any face up', () => {
    const game = initHuimingGame(['p1', 'p2'])
    game.board[0][0].faceUp = true
    expect(checkAllFaceDown(game.board)).toBe(false)
  })
})

describe('grantDarkPickCharges', () => {
  it('should give every player one charge', () => {
    const game = initHuimingGame(['p1', 'p2', 'p3', 'p4'])
    expect(game.players.map(p => p.darkPickCharges)).toEqual([1, 1, 1, 1])
    grantDarkPickCharges(game)
    expect(game.players.map(p => p.darkPickCharges)).toEqual([2, 2, 2, 2])
  })
})

// games/huiming/engine.ts
import { createDeck, shuffleDeck, type Card } from '@huiming/core-shared'
import type { HuimingBoard, HuimingCell, HuimingPlayer, HuimingState } from './types'

const HUIMING_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['1', '2', '3', '4', '5', '6'],
  jokers: 1,
}

export function createHuimingBoard(): HuimingBoard {
  const deck = shuffleDeck(createDeck(HUIMING_DECK_CONFIG))
  const board: HuimingBoard = []
  let idx = 0

  for (let r = 0; r < 5; r++) {
    const row: HuimingCell[] = []
    for (let c = 0; c < 5; c++) {
      row.push({ card: deck[idx], faceUp: false })
      idx++
    }
    board.push(row)
  }

  // Place joker at center
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (board[r][c].card?.suit?.toString().startsWith('joker')) {
        const tmp = board[2][2].card
        board[2][2].card = board[r][c].card
        board[r][c].card = tmp
        break
      }
    }
  }

  return board
}

export function initHuimingGame(p1: string, p2: string): HuimingState {
  return {
    board: createHuimingBoard(),
    players: [
      { id: p1, hand: [], darkPickCharges: 1, canPlace: true },
      { id: p2, hand: [], darkPickCharges: 1, canPlace: true },
    ],
    currentTurn: 0,
    phase: 'taking',
    round: 1,
    winner: null,
  }
}

export function takeCard(
  game: HuimingState, playerIdx: number, row: number, col: number
): { success: boolean; reason?: string } {
  const cell = game.board[row]?.[col]
  if (!cell?.card) return { success: false, reason: '该位置没有牌' }
  if (!cell.faceUp && game.players[playerIdx].darkPickCharges <= 0) {
    return { success: false, reason: '需要暗取次数' }
  }

  if (!cell.faceUp) game.players[playerIdx].darkPickCharges--
  game.players[playerIdx].hand.push(cell.card)
  cell.card = null
  return { success: true }
}

export function flipNeighbors(board: HuimingBoard, row: number, col: number): void {
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const r = row + dr, c = col + dc
    if (r >= 0 && r < 5 && c >= 0 && c < 5 && board[r][c].card) {
      board[r][c].faceUp = !board[r][c].faceUp
    }
  }
}

export function checkAllFaceDown(board: HuimingBoard): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell.card && cell.faceUp) return false
    }
  }
  return true
}

export function grantDarkPickCharges(game: HuimingState): void {
  game.players[0].darkPickCharges++
  game.players[1].darkPickCharges++
}

export function placeCard(
  game: HuimingState, playerIdx: number, cardId: string, row: number, col: number, faceUp: boolean
): { success: boolean; reason?: string } {
  const player = game.players[playerIdx]
  if (!player.canPlace) return { success: false, reason: '放牌机会已用完' }
  const cell = game.board[row]?.[col]
  if (!cell || cell.card !== null) return { success: false, reason: '不是空位' }
  const idx = player.hand.findIndex(c => c.id === cardId)
  if (idx === -1) return { success: false, reason: '手牌中没有这张牌' }

  const [card] = player.hand.splice(idx, 1)
  cell.card = card
  cell.faceUp = faceUp
  player.canPlace = false
  return { success: true }
}

export function countRemainingCards(board: HuimingBoard): number {
  let count = 0
  for (const row of board) {
    for (const cell of row) {
      if (cell.card) count++
    }
  }
  return count
}

// games/huiming/rules.ts
import type { Card, Suit } from '@huiming/core-shared'
import type { HuimingPlayer, HuimingState } from './types'

const SUITS: Suit[] = ['hearts', 'spades', 'diamonds', 'clubs']

export function canTake(game: HuimingState, row: number, col: number, playerIdx: number): boolean {
  const cell = game.board[row]?.[col]
  if (!cell?.card) return false
  if (cell.faceUp) return true
  // Jokers cannot be taken when face-down (dark pick)
  if (cell.card.suit.toString().startsWith('joker')) return false
  return game.players[playerIdx].darkPickCharges > 0
}

export function canPlace(game: HuimingState, playerIdx: number): boolean {
  const p = game.players[playerIdx]
  return p.canPlace && p.hand.length > 0
}

export function canDarkPick(game: HuimingState, playerIdx: number): boolean {
  return game.players[playerIdx].darkPickCharges > 0
}

export function checkWinner(player: HuimingPlayer): boolean {
  const jokers = player.hand.filter(c => c.suit.toString().startsWith('joker')).length
  for (const suit of SUITS) {
    if (player.hand.filter(c => c.suit === suit).length + jokers >= 6) return true
  }
  return false
}

export function countMaxSuit(hand: Card[]): number {
  const jokers = hand.filter(c => c.suit.toString().startsWith('joker')).length
  let max = 0
  for (const suit of SUITS) {
    const count = hand.filter(c => c.suit === suit).length
    if (count > max) max = count
  }
  return max + jokers
}

import type { Card } from '@huiming/core-shared'
import type { LandlordState } from './types'
import { getHandType, canBeat } from './hand'

export function isValidBid(state: LandlordState, playerId: string, score: number): boolean {
  if (state.currentPhase !== 'bidding') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.bidding.currentBidder) return false
  if (score < 0 || score > 3) return false
  if (score === 0) return true  // always allowed to pass
  return score > state.bidding.highestBid
}

export function isValidPlay(state: LandlordState, playerId: string, cards: Card[]): boolean {
  if (state.currentPhase !== 'playing') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.currentTurn) return false
  if (!Array.isArray(cards) || cards.length === 0) return false

  // Use real card data from server hand to prevent client-side tampering
  const hand = state.players[playerIdx].hand
  const handMap = new Map(hand.map(c => [c.id, c]))
  const realCards: Card[] = []
  for (const c of cards) {
    const real = handMap.get(c.id)
    if (!real) return false
    realCards.push(real)
  }

  // Must form a valid hand type
  const handType = getHandType(realCards)
  if (!handType) return false

  const played = { cards: realCards, type: handType.type, mainRank: handType.mainRank }

  // If there's a previous play to beat
  const { lastPlay, lastPlayer } = state.game
  if (lastPlay && lastPlayer !== playerIdx) {
    return canBeat(played, lastPlay)
  }

  return true
}

export function canPass(state: LandlordState, playerId: string): boolean {
  if (state.currentPhase !== 'playing') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.currentTurn) return false

  // Cannot pass on free play (no lastPlay or lastPlayer is self and passCount indicates free)
  const { lastPlay, lastPlayer } = state.game
  if (!lastPlay) return false  // must play something on free play
  if (lastPlayer === playerIdx) return false  // everyone passed, must play
  return true
}

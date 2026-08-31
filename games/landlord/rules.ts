import type { Card } from '@huiming/core-shared'
import type { LandlordState } from './types'
import { getHandType, canBeat } from './hand'

export function isValidBid(state: LandlordState, playerId: string, score: number): boolean {
  if (state.currentPhase !== 'bidding') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.bidding.currentBidder) return false
  // score 0 = pass, 1-3 = bid
  if (score < 0 || score > 3) return false
  if (score === 0) return true  // can always pass
  // must be higher than current highest bid
  return score > state.bidding.highestBid
}

export function isValidPlay(state: LandlordState, playerId: string, cards: Card[]): boolean {
  if (state.currentPhase !== 'playing') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.currentTurn) return false
  if (cards.length === 0) return false

  // All cards must be in player's hand
  const hand = state.players[playerIdx].hand
  const handIds = new Set(hand.map(c => c.id))
  for (const card of cards) {
    if (!handIds.has(card.id)) return false
  }

  // Must form a valid hand type
  const handType = getHandType(cards)
  if (!handType) return false

  const played = { cards, type: handType.type, mainRank: handType.mainRank }

  // If there's a previous play to beat
  const { lastPlay, lastPlayer, passCount } = state.game
  if (lastPlay && lastPlayer !== playerIdx) {
    // Must beat the last play
    return canBeat(played, lastPlay)
  }

  // Free play (no previous play, or last play was by self after everyone passed)
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

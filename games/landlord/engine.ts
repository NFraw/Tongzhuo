import { createDeck, shuffleDeck, type Card } from '@huiming/core-shared'
import type { LandlordState, LandlordPlayer } from './types'

const LANDLORD_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
  jokers: 2,
}

export function dealCards(deck: Card[]): { hands: Card[][]; bottom: Card[] } {
  const shuffled = shuffleDeck(deck)
  const hands: Card[][] = [[], [], []]
  for (let i = 0; i < 51; i++) {
    hands[i % 3].push(shuffled[i])
  }
  const bottom = [shuffled[51], shuffled[52], shuffled[53]]
  // Sort each hand by landlord rank for easier play
  for (const hand of hands) {
    hand.sort((a, b) => {
      const ra = a.suit === 'joker_red' ? 17 : a.suit === 'joker_black' ? 16 : a.rank === 'A' ? 14 : a.rank === '2' ? 15 : a.value
      const rb = b.suit === 'joker_red' ? 17 : b.suit === 'joker_black' ? 16 : b.rank === 'A' ? 14 : b.rank === '2' ? 15 : b.value
      return ra - rb
    })
  }
  return { hands, bottom }
}

export function createLandlordGame(playerIds: string[]): LandlordState {
  const deck = createDeck(LANDLORD_DECK_CONFIG)
  const { hands, bottom } = dealCards(deck)

  const players: LandlordPlayer[] = playerIds.map((id, i) => ({
    id,
    hand: hands[i],
    role: null,
  }))

  // Random starting bidder
  const startBidder = Math.floor(Math.random() * 3)

  return {
    players,
    bottomCards: bottom,
    currentPhase: 'bidding',
    currentTurn: startBidder,
    bidding: {
      currentBidder: startBidder,
      highestBid: 0,
      highestBidder: -1,
      passCount: 0,
      startBidder,
      turnsTaken: 0,
      bottomRevealed: false,
      round: 1,
      landlordDecidedInRound: 0,
    },
    game: {
      landlord: null,
      lastPlay: null,
      lastPlayer: null,
      passCount: 0,
      passEvent: 0,
      multiplier: 1,
      baseScore: 0,
    },
    winner: null,
  }
}

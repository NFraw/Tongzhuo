import type { Card } from '@huiming/core-shared'

export type HandType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple_one'
  | 'triple_two'
  | 'straight'
  | 'double_straight'
  | 'plane'
  | 'plane_single'
  | 'plane_pair'
  | 'four_two'
  | 'four_two_pair'
  | 'bomb'
  | 'rocket'

export interface PlayedCards {
  cards: Card[]
  type: HandType
  mainRank: number
}

export interface LandlordPlayer {
  id: string
  hand: Card[]
  role: 'landlord' | 'farmer' | null
}

export interface LandlordState {
  players: LandlordPlayer[]
  bottomCards: Card[]
  currentPhase: 'bidding' | 'playing' | 'ended'
  currentTurn: number
  bidding: {
    currentBidder: number
    highestBid: number
    highestBidder: number
    passCount: number
    startBidder: number
    turnsTaken: number
  }
  game: {
    landlord: number | null
    lastPlay: PlayedCards | null
    lastPlayer: number | null
    passCount: number
    multiplier: number
    baseScore: number
  }
  winner: string | null
}

export interface LandlordClientState {
  myPlayerIndex: number
  myHand: Card[]
  otherHandCounts: [number, number]
  bottomCards: Card[]
  currentPhase: 'bidding' | 'playing' | 'ended'
  currentTurn: number
  biddingInfo: {
    highestBid: number
    highestBidder: number
    myTurnToBid: boolean
    lastBid: number | null
  }
  gameInfo: {
    landlord: number | null
    lastPlay: PlayedCards | null
    lastPlayer: number | null
    passCount: number
    multiplier: number
    baseScore: number
  }
  myRole: 'landlord' | 'farmer' | null
  winner: string | null
}

// games/huiming/types.ts
import type { Card } from '@huiming/core-shared'

export type HuimingSuit = 'hearts' | 'spades' | 'diamonds' | 'clubs'

export interface HuimingCell {
  card: Card | null
  faceUp: boolean
}

export type HuimingBoard = HuimingCell[][]

export interface HuimingPlayer {
  id: string
  hand: Card[]
  darkPickCharges: number
  canPlace: boolean
}

export interface HuimingState {
  board: HuimingBoard
  players: [HuimingPlayer, HuimingPlayer]
  currentTurn: 0 | 1
  phase: 'placing' | 'taking' | 'ended'
  round: number
  winner: string | null
}

export interface HuimingClientState {
  board: { card: Card | null; faceUp: boolean; exists: boolean }[][]
  myHand: Card[]
  opponentHandCount: number
  myDarkPickCharges: number
  myCanPlace: boolean
  myPlayerIndex: 0 | 1
  currentTurn: 0 | 1
  phase: string
  round: number
  winner: string | null
}

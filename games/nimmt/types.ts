// games/nimmt/types.ts
import type { Card } from '@huiming/core-shared'

export interface NimmtPlayer {
  id: string
  hand: Card[]
  score: number
  scorePile: Card[]
}

export interface ResolveStep {
  playerIndex: number
  card: Card
  placedRow: number
  pickedUpRow: number | null
  gainedHeads: number
}

export interface NimmtState {
  players: NimmtPlayer[]
  board: Card[][] // 4 rows, the last card of each row is the row end
  phase: 'selecting' | 'resolving' | 'ended'
  round: number // 1-based current round
  committed: (Card | null)[] // per-player committed card for the current round
  revealQueue: { playerIndex: number; card: Card }[] // cards to resolve, ascending
  resolveStep: number
  pendingPickup: number | null // player index currently asked to choose a row
  pendingCard: Card | null
  resolveSteps: ResolveStep[] // accumulated steps for the current round
  lastResolve: ResolveStep[] | null
  winner: string | null
  winnerIndex: number | null
}

export interface NimmtClientState {
  myIndex: number
  myHand: Card[]
  myCommitted: Card | null
  players: { id: string; score: number; handCount: number; committed: boolean }[]
  board: Card[][]
  round: number
  phase: NimmtState['phase']
  pendingPickup: { playerIndex: number; card: Card } | null
  lastResolve: ResolveStep[] | null
  winnerIndex: number | null
  myWinner: boolean
}

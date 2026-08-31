// games/nimmt/engine.ts
import { shuffleDeck, type Card } from '@huiming/core-shared'
import type { NimmtPlayer, NimmtState, ResolveStep } from './types'

const TOTAL_CARDS = 104
const HAND_SIZE = 10

/** Bull-head count for a card value per the 6 Nimmt rules. */
export function cattleHeads(value: number): number {
  let heads = 0
  if (value % 11 === 0) heads += 5
  if (value % 10 === 0) heads += 3
  else if (value % 5 === 0) heads += 2
  return heads === 0 ? 1 : heads
}

/** Build the ordered 104-card deck (values 1..104, no suits). */
export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (let i = 1; i <= TOTAL_CARDS; i++) {
    deck.push({ id: `nimmt-${i}`, suit: 'none', rank: String(i), value: i, deckIndex: i - 1 })
  }
  return deck
}

export function createNimmtGame(playerIds: string[]): NimmtState {
  const deck = shuffleDeck(buildDeck())
  const players: NimmtPlayer[] = playerIds.map(id => ({ id, hand: [], score: 0, scorePile: [] }))

  for (let i = 0; i < HAND_SIZE; i++) {
    for (const p of players) p.hand.push(deck.pop()!)
  }
  const board: Card[][] = [[], [], [], []]
  for (let r = 0; r < 4; r++) board[r].push(deck.pop()!)

  return {
    players,
    board,
    phase: 'selecting',
    round: 1,
    committed: playerIds.map(() => null),
    revealQueue: [],
    resolveStep: 0,
    pendingPickup: null,
    pendingCard: null,
    resolveSteps: [],
    lastResolve: null,
    winner: null,
    winnerIndex: null,
  }
}

/** Row whose end is the closest value strictly below `value`, or null. */
export function findTargetRow(board: Card[][], value: number): number | null {
  let bestRow: number | null = null
  let bestEnd = -1
  for (let r = 0; r < board.length; r++) {
    const rowEnd = board[r][board[r].length - 1]?.value
    if (rowEnd !== undefined && rowEnd < value && rowEnd > bestEnd) {
      bestEnd = rowEnd
      bestRow = r
    }
  }
  return bestRow
}

export function selectCard(state: NimmtState, playerIdx: number, cardId: string): boolean {
  if (state.phase !== 'selecting') return false
  const player = state.players[playerIdx]
  const idx = player.hand.findIndex(c => c.id === cardId)
  if (idx === -1) return false

  const card = player.hand.splice(idx, 1)[0]
  const prev = state.committed[playerIdx]
  if (prev) player.hand.push(prev)
  state.committed[playerIdx] = card

  if (state.committed.every(c => c !== null)) {
    state.phase = 'resolving'
    state.revealQueue = state.committed
      .map((c, i) => ({ playerIndex: i, card: c! }))
      .sort((a, b) => a.card.value - b.card.value)
    state.resolveStep = 0
    state.resolveSteps = []
    resolveNext(state)
  }
  return true
}

export function chooseRow(state: NimmtState, playerIdx: number, rowIndex: number): boolean {
  if (state.phase !== 'resolving') return false
  if (state.pendingPickup !== playerIdx) return false
  if (rowIndex < 0 || rowIndex >= state.board.length) return false

  const card = state.pendingCard!
  const row = state.board[rowIndex]
  const heads = row.reduce((sum, c) => sum + cattleHeads(c.value), 0)
  state.players[playerIdx].score += heads
  state.players[playerIdx].scorePile.push(...row)
  state.board[rowIndex] = [card]
  state.resolveSteps.push({ playerIndex: playerIdx, card, placedRow: rowIndex, pickedUpRow: rowIndex, gainedHeads: heads })
  state.pendingPickup = null
  state.pendingCard = null
  state.resolveStep++
  resolveNext(state)
  return true
}

export function resolveNext(state: NimmtState): void {
  while (state.resolveStep < state.revealQueue.length) {
    const { playerIndex, card } = state.revealQueue[state.resolveStep]
    const rowIndex = findTargetRow(state.board, card.value)
    if (rowIndex === null) {
      // Card is lower than every row end: pause for this player to choose a row.
      state.pendingPickup = playerIndex
      state.pendingCard = card
      return
    }
    resolveIntoRow(state, playerIndex, card, rowIndex)
    state.resolveStep++
  }
  finishRound(state)
}

function resolveIntoRow(state: NimmtState, playerIndex: number, card: Card, rowIndex: number): void {
  const row = state.board[rowIndex]
  let gainedHeads = 0
  let pickedUpRow: number | null = null
  if (row.length >= 5) {
    const taken = row.splice(0, row.length)
    gainedHeads = taken.reduce((sum, c) => sum + cattleHeads(c.value), 0)
    state.players[playerIndex].score += gainedHeads
    state.players[playerIndex].scorePile.push(...taken)
    pickedUpRow = rowIndex
    row.length = 0
  }
  row.push(card)
  state.resolveSteps.push({ playerIndex, card, placedRow: rowIndex, pickedUpRow, gainedHeads })
}

function finishRound(state: NimmtState): void {
  state.lastResolve = state.resolveSteps
  state.resolveSteps = []
  state.committed = state.players.map(() => null)
  state.revealQueue = []
  state.resolveStep = 0
  state.pendingPickup = null
  state.pendingCard = null

  if (state.round >= 10) {
    const wi = computeWinner(state)
    state.phase = 'ended'
    state.winnerIndex = wi
    state.winner = wi === null ? null : state.players[wi].id
  } else {
    state.round++
    state.phase = 'selecting'
  }
}

export function computeWinner(state: NimmtState): number | null {
  if (state.players.length === 0) return null
  let best = 0
  for (let i = 1; i < state.players.length; i++) {
    const cur = state.players[best]
    const cand = state.players[i]
    if (cand.score < cur.score) best = i
    else if (cand.score === cur.score && cand.scorePile.length < cur.scorePile.length) best = i
  }
  return best
}

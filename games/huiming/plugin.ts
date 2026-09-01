// games/huiming/plugin.ts
import type { GameServerPlugin, GameState, EventResult } from '@huiming/core-shared'
import { initHuimingGame, takeCard, placeCard, flipNeighbors, checkAllFaceDown, grantDarkPickCharges, countRemainingCards } from './engine'
import { canTake, canPlace, checkWinner, countMaxSuit } from './rules'
import type { HuimingState, HuimingClientState } from './types'

const HUIMING_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['1', '2', '3', '4', '5', '6'],
  jokers: 1,
}

function getClientState(state: HuimingState, playerId: string): HuimingClientState {
  const idx = state.players.findIndex(p => p.id === playerId) as 0 | 1
  const me = state.players[idx]
  const opp = state.players[1 - idx]
  return {
    board: state.board.map(row => row.map(cell => ({
      card: cell.faceUp ? cell.card : null,
      faceUp: cell.faceUp,
      exists: cell.card !== null,
    }))),
    myHand: me.hand,
    opponentHandCount: opp.hand.length,
    myDarkPickCharges: me.darkPickCharges,
    myCanPlace: me.canPlace,
    myPlayerIndex: idx,
    currentTurn: state.currentTurn,
    phase: state.phase,
    round: state.round,
    winner: state.winner,
    hasTakenThisTurn: state.hasTakenThisTurn,
    opponentId: opp.id,
  }
}

export const huimingServerPlugin: GameServerPlugin = {
  id: 'huiming',
  name: '晦明',
  description: '基于25张扑克牌的双人博弈',
  minPlayers: 2,
  maxPlayers: 2,
  deckConfig: HUIMING_DECK_CONFIG,

  createInitialState(players: string[]): GameState {
    return initHuimingGame(players[0], players[1])
  },

  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult {
    const game = state as HuimingState
    const playerIdx = game.players.findIndex(p => p.id === playerId) as 0 | 1

    if (game.currentTurn !== playerIdx) {
      return { state, broadcast: [], error: '不是你的回合' }
    }

    const broadcast: { event: string; data: any }[] = []

    switch (event) {
      case 'take': {
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = payload
        if (!canTake(game, row, col, playerIdx)) return { state, broadcast, error: '不能取这张牌' }
        takeCard(game, playerIdx, row, col)
        game.hasTakenThisTurn = true
        flipNeighbors(game.board, row, col)
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)
        if (checkWinner(game.players[playerIdx])) {
          game.phase = 'ended'
          game.winner = playerId
        } else {
          const remaining = countRemainingCards(game.board)
          if (remaining === 0) {
            // All cards taken — compare max suit counts
            const p0Max = countMaxSuit(game.players[0].hand)
            const p1Max = countMaxSuit(game.players[1].hand)
            if (p0Max !== p1Max) {
              game.phase = 'ended'
              game.winner = game.players[p0Max > p1Max ? 0 : 1].id
            } else {
              // Tie — enter renewal round
              game.round++
              game.currentTurn = 1 - game.currentTurn as 0 | 1
              game.phase = 'placing'
              game.hasTakenThisTurn = false
              game.players[0].canPlace = true
              game.players[1].canPlace = true
            }
          } else {
            game.currentTurn = 1 - game.currentTurn as 0 | 1
            game.hasTakenThisTurn = false
          }
        }
        break
      }
      case 'darkPick': {
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = payload
        if (!canTake(game, row, col, playerIdx)) return { state, broadcast, error: '不能取这张牌' }
        takeCard(game, playerIdx, row, col)
        game.hasTakenThisTurn = true
        flipNeighbors(game.board, row, col)
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)
        if (checkWinner(game.players[playerIdx])) {
          game.phase = 'ended'
          game.winner = playerId
        } else {
          const remaining = countRemainingCards(game.board)
          if (remaining === 0) {
            const p0Max = countMaxSuit(game.players[0].hand)
            const p1Max = countMaxSuit(game.players[1].hand)
            if (p0Max !== p1Max) {
              game.phase = 'ended'
              game.winner = game.players[p0Max > p1Max ? 0 : 1].id
            } else {
              game.round++
              game.currentTurn = 1 - game.currentTurn as 0 | 1
              game.phase = 'placing'
              game.hasTakenThisTurn = false
              game.players[0].canPlace = true
              game.players[1].canPlace = true
            }
          } else {
            game.currentTurn = 1 - game.currentTurn as 0 | 1
            game.hasTakenThisTurn = false
          }
        }
        break
      }
      case 'place': {
        const { cardId, row, col, faceUp } = payload
        if (game.phase === 'placing') {
          // Renewal round (Rule 8): the two players take turns placing ALL of
          // their hand cards back onto the board. This continues until every
          // card is back (board full), then the take phase resumes. The
          // once-per-game placement allowance (Rule 6) does NOT apply here.
          const p = game.players[playerIdx]
          if (p.hand.length === 0) {
            // This player has nothing left to place — skip their turn. If the
            // other player also has nothing, all cards are back on the board.
            const nextIdx = (1 - playerIdx) as 0 | 1
            if (game.players[nextIdx].hand.length === 0) {
              game.phase = 'taking'
              game.hasTakenThisTurn = false
            }
            game.currentTurn = nextIdx
            break
          }
          // Renewal placement isn't bound by the once-per-game Rule 6 limit.
          p.canPlace = true
          placeCard(game, playerIdx, cardId, row, col, faceUp)
          // After renewal, rules 1–6 (including the one-time place) restart, so
          // restore both players' place allowance for the fresh take phase.
          game.players[0].canPlace = true
          game.players[1].canPlace = true
          let hasEmpty = false
          for (const r of game.board) { for (const cell of r) { if (!cell.card) hasEmpty = true } }
          if (!hasEmpty) {
            // All cards are back on the board — begin a fresh take phase.
            game.phase = 'taking'
            game.hasTakenThisTurn = false
          }
          game.currentTurn = 1 - game.currentTurn as 0 | 1
        } else if (game.phase === 'taking') {
          // Rule 6: can only place BEFORE taking, not after
          if (game.hasTakenThisTurn) return { state, broadcast, error: '已取牌，本回合不能再放牌（规则：先放牌再拿牌）' }
          if (!canPlace(game, playerIdx)) return { state, broadcast, error: '不能放牌' }
          placeCard(game, playerIdx, cardId, row, col, faceUp)
        }
        break
      }
      default:
        return { state, broadcast, error: '未知事件' }
    }

    return { state, broadcast }
  },

  getClientState,
  checkGameEnd(state: GameState): string | null {
    return (state as HuimingState).winner
  },
}

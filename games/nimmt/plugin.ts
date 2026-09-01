// games/nimmt/plugin.ts
import type { GameServerPlugin, GameState, EventResult } from '@huiming/core-shared'
import { buildDeck, createNimmtGame, selectCard, chooseRow } from './engine'
import type { NimmtState, NimmtClientState } from './types'

const NIMMT_DECK_CONFIG = {
  suits: [],
  ranks: [],
  jokers: 0,
  custom: buildDeck(),
}

function getClientState(state: NimmtState, playerId: string): NimmtClientState {
  const myIndex = state.players.findIndex(p => p.id === playerId)
  const me = state.players[myIndex]

  return {
    myIndex,
    myHand: me.hand,
    myCommitted: state.committed[myIndex],
    players: state.players.map((p, i) => ({
      id: p.id,
      score: p.score,
      handCount: p.hand.length,
      committed: state.committed[i] !== null,
    })),
    board: state.board,
    round: state.round,
    phase: state.phase,
    pendingPickup:
      state.pendingPickup === null
        ? null
        : { playerIndex: state.pendingPickup, card: state.pendingCard! },
    lastResolve: state.lastResolve,
    winnerIndex: state.winnerIndex,
    myWinner: state.winner !== null && state.winner === playerId,
  }
}

export const nimmtServerPlugin: GameServerPlugin = {
  id: 'nimmt',
  name: '牛头人',
  description: '经典吃牛头卡牌游戏，牛头最少者获胜',
  minPlayers: 2,
  maxPlayers: 6,
  deckConfig: NIMMT_DECK_CONFIG,

  createInitialState(players: string[]): GameState {
    return createNimmtGame(players)
  },

  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult {
    const game = state as NimmtState
    const playerIdx = game.players.findIndex(p => p.id === playerId)
    if (playerIdx === -1) return { state, broadcast: [], error: '玩家不在游戏中' }

    const broadcast: { event: string; data: any }[] = []

    switch (event) {
      case 'select': {
        const { cardId } = payload
        if (!cardId || typeof cardId !== 'string') {
          return { state, broadcast, error: '缺少卡牌ID' }
        }
        if (!selectCard(game, playerIdx, cardId)) {
          return { state, broadcast, error: '无效的出牌' }
        }
        break
      }
      case 'chooseRow': {
        const { row } = payload
        if (typeof row !== 'number') {
          return { state, broadcast, error: '缺少行号' }
        }
        if (!chooseRow(game, playerIdx, row)) {
          return { state, broadcast, error: '当前不能选行' }
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
    return (state as NimmtState).winner
  },
}

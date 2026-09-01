/**
 * plugin.ts — 牛头人服务器端插件（GameServerPlugin 实现）
 *
 * 这是牛头人游戏的"总控制器"——实现了 GameServerPlugin 接口的全部 4 个方法。
 *
 * 职责：
 *   1. createInitialState — 创建初始状态（委托给 engine.ts）
 *   2. handleEvent        — 处理玩家操作（选牌/选行），更新状态
 *   3. getClientState     — 从完整状态生成该玩家的"视角"（脱敏）
 *   4. checkGameEnd       — 判定游戏是否结束
 *
 * 被谁调用：
 *   socket-framework.ts 中的 game:action 处理器调用 handleEvent，
 *   room:start 调用 createInitialState，broadcastState 调用 getClientState，
 *   game:action 后调用 checkGameEnd。
 */
import type { GameServerPlugin, GameState, EventResult } from '@huiming/core-shared'
import { buildDeck, createNimmtGame, selectCard, chooseRow } from './engine'
import type { NimmtState, NimmtClientState } from './types'

const NIMMT_DECK_CONFIG = {
  suits: [],
  ranks: [],
  jokers: 0,
  custom: buildDeck(),
}

/**
 * 从完整状态生成某玩家的"视角"。
 *
 * 信息隐藏规则：
 *   - 手牌：只显示自己的，其他玩家只显示数量
 *   - 已选牌：自己显示内容，其他人只显示是否已选
 *   - 牌桌：完全公开（所有人的牌桌相同）
 *   - 结算步骤：完全公开（用于动画播放）
 */
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
      committed: state.committed[i] !== null,  // 只显示是否已选，不显示内容
    })),
    board: state.board,  // 牌桌完全公开
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

/**
 * 牛头人服务器插件实例。
 * 注册到 PluginLoader 后，服务器就能处理牛头人游戏。
 *
 * 注册方式：server/src/index.ts 中调用 pluginLoader.register(nimmtServerPlugin)
 */
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

  /**
   * 处理游戏事件。这是游戏逻辑的核心状态机。
   *
   * 支持的事件：
   *   - 'select'    → 选牌暗扣（payload: { cardId }）
   *   - 'chooseRow' → 选行吃掉（payload: { row }）
   *
   * 状态转换：
   *   selecting 阶段：
   *     所有人选完 → resolving 阶段（按点数结算）
   *   resolving 阶段：
   *     牌值 < 所有行末尾 → 等待该玩家 chooseRow
   *     所有牌结算完 → 下一轮 selecting 或 ended
   */
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

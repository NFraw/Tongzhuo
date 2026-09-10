/**
 * plugin.ts — 晦明服务器端插件（GameServerPlugin 实现）
 *
 * 这是晦明游戏的"总控制器"——实现了 GameServerPlugin 接口的全部 4 个方法。
 *
 * 职责：
 *   1. createInitialState — 创建初始状态（委托给 engine.ts）
 *   2. handleEvent        — 处理玩家操作（取牌/暗取/放牌），更新状态
 *   3. getClientState     — 从完整状态生成该玩家的"视角"（脱敏）
 *   4. checkGameEnd       — 判定游戏是否结束
 *
 * 被谁调用：
 *   socket-framework.ts 中的 game:action 处理器调用 handleEvent，
 *   room:start 调用 createInitialState，broadcastState 调用 getClientState，
 *   game:action 后调用 checkGameEnd。
 */
import type { GameServerPlugin } from '@huiming/core-shared'
import { initHuimingGame, takeCard, placeCard, flipNeighbors, checkAllFaceDown, grantDarkPickCharges, countRemainingCards } from './engine'
import { canTake, canPlace, checkWinner, countMaxSuit } from './rules'
import type { HuimingState, HuimingClientState } from './types'

const HUIMING_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['1', '2', '3', '4', '5', '6'],
  jokers: 1,
}

/**
 * 从完整状态生成某玩家的"视角"。
 *
 * 信息隐藏规则：
 *   - 棋盘：背面朝上的牌不显示内容（card: null），只标记是否存在
 *   - 对手手牌：不显示，只显示数量
 *   - 自己的手牌、暗取次数、放牌状态：完整显示
 *
 * 类比 C++：相当于一个序列化函数，根据玩家 ID 生成不同的 JSON。
 */
function getClientState(state: HuimingState, playerId: string): HuimingClientState {
  const idx = state.players.findIndex(p => p.id === playerId) as 0 | 1
  const me = state.players[idx]
  const opp = state.players[1 - idx]
  return {
    // 棋盘视图：背面朝上的牌隐藏内容
    board: state.board.map(row => row.map(cell => ({
      card: cell.faceUp ? cell.card : null,  // 背面朝上时返回 null
      faceUp: cell.faceUp,
      exists: cell.card !== null,  // 标记是否有牌（客户端用此判断是否可点击）
    }))),
    myHand: me.hand,
    opponentHandCount: opp.hand.length,  // 只显示数量
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

/**
 * 晦明服务器插件实例。
 * 注册到 PluginLoader 后，服务器就能处理晦明游戏。
 *
 * 注册方式：server/src/index.ts 中调用 pluginLoader.register(huimingServerPlugin)
 */
export const huimingServerPlugin: GameServerPlugin<HuimingState, HuimingClientState> = {
  id: 'huiming',
  name: '晦明',
  description: '基于25张扑克牌的双人博弈',
  minPlayers: 2,
  maxPlayers: 4,
  deckConfig: HUIMING_DECK_CONFIG,

  createInitialState(players: string[]): HuimingState {
    return initHuimingGame(players[0], players[1])
  },

  /**
   * 处理游戏事件。这是游戏逻辑的核心状态机。
   *
   * 支持的事件：
   *   - 'take'     → 取明牌（payload: { row, col }）
   *   - 'darkPick' → 取暗牌（payload: { row, col }）
   *   - 'place'    → 放牌（payload: { cardId, row, col, faceUp }）
   *
   * 状态转换流程：
   *   taking 阶段：
   *     取牌 → 翻开邻居 → 检查全暗 → 检查胜利 → 检查棋盘清空
   *     棋盘清空 → 比较最大花色 → 有人多则结束 / 相同则续放
   *   placing 阶段（续放）：
   *     双方轮流放牌回棋盘 → 棋盘满 → 回到 taking 阶段
   */
  handleEvent(game: HuimingState, playerId: string, event: string, payload: unknown) {
    const state = game
    const playerIdx = game.players.findIndex(p => p.id === playerId) as 0 | 1

    // 通用检查：必须轮到你
    if (game.currentTurn !== playerIdx) {
      return { state, broadcast: [], error: '不是你的回合' }
    }

    const broadcast: { event: string; data: any }[] = []

    switch (event) {
      case 'take': {
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = readBoardPosition(payload)
        if (!canTake(game, row, col, playerIdx)) return { state, broadcast, error: '不能取这张牌' }

        // 执行取牌
        takeCard(game, playerIdx, row, col)
        game.hasTakenThisTurn = true
        // 取牌后翻开相邻格子
        flipNeighbors(game.board, row, col)
        // 如果所有牌都背面朝上，双方各获得 1 次暗取机会
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)

        // 检查胜利
        if (checkWinner(game.players[playerIdx])) {
          game.phase = 'ended'
          game.winner = playerId
        } else {
          const remaining = countRemainingCards(game.board)
          if (remaining === 0) {
            // 棋盘所有牌取完 → 比较最大花色牌数
            const p0Max = countMaxSuit(game.players[0].hand)
            const p1Max = countMaxSuit(game.players[1].hand)
            if (p0Max !== p1Max) {
              // 有人更多 → 获胜
              game.phase = 'ended'
              game.winner = game.players[p0Max > p1Max ? 0 : 1].id
            } else {
              // 平局 → 进入续放阶段
              game.round++
              game.currentTurn = 1 - game.currentTurn as 0 | 1
              game.phase = 'placing'
              game.hasTakenThisTurn = false
              game.players[0].canPlace = true
              game.players[1].canPlace = true
            }
          } else {
            // 棋盘还有牌 → 切换回合
            game.currentTurn = 1 - game.currentTurn as 0 | 1
            game.hasTakenThisTurn = false
          }
        }
        break
      }

      case 'darkPick': {
        // 暗取事件：与 take 流程相同，区别在于 canTake() 的校验规则不同
        // （暗取需要消耗 darkPickCharges，且不能取 Joker）
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = readBoardPosition(payload)
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
        const { cardId, row, col, faceUp } = readPlacePayload(payload)
        if (game.phase === 'placing') {
          // 续放阶段：双方轮流将手牌放回棋盘
          // 续放不受"每回合限放一次"限制（规则 8）
          const p = game.players[playerIdx]
          if (p.hand.length === 0) {
            // 这个玩家已经没牌可放 → 跳过。如果双方都没牌了，续放结束。
            const nextIdx = (1 - playerIdx) as 0 | 1
            if (game.players[nextIdx].hand.length === 0) {
              game.phase = 'taking'
              game.hasTakenThisTurn = false
            }
            game.currentTurn = nextIdx
            break
          }
          // 续放不受 Rule 6 限制
          p.canPlace = true
          placeCard(game, playerIdx, cardId, row, col, faceUp)
          // 续放结束后恢复双方的放牌权限（新一轮取牌阶段）
          game.players[0].canPlace = true
          game.players[1].canPlace = true
          // 检查棋盘是否已满（所有牌都放回去了）
          let hasEmpty = false
          for (const r of game.board) { for (const cell of r) { if (!cell.card) hasEmpty = true } }
          if (!hasEmpty) {
            // 棋盘满 → 回到取牌阶段
            game.phase = 'taking'
            game.hasTakenThisTurn = false
          }
          game.currentTurn = 1 - game.currentTurn as 0 | 1
        } else if (game.phase === 'taking') {
          // 取牌阶段的放牌：必须在取牌之前（规则 6）
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
  checkGameEnd(state: HuimingState): string | null {
    return state.winner
  },
}

function readBoardPosition(payload: unknown): { row: number; col: number } {
  if (!payload || typeof payload !== 'object') return { row: Number.NaN, col: Number.NaN }
  const value = payload as Record<string, unknown>
  return {
    row: typeof value.row === 'number' ? value.row : Number.NaN,
    col: typeof value.col === 'number' ? value.col : Number.NaN,
  }
}

function readPlacePayload(payload: unknown): { cardId: string; row: number; col: number; faceUp: boolean } {
  const position = readBoardPosition(payload)
  if (!payload || typeof payload !== 'object') {
    return { ...position, cardId: '', faceUp: false }
  }
  const value = payload as Record<string, unknown>
  return {
    ...position,
    cardId: typeof value.cardId === 'string' ? value.cardId : '',
    faceUp: value.faceUp === true,
  }
}

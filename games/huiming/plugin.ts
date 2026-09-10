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
  const idx = state.players.findIndex(p => p.id === playerId)
  const me = state.players[idx]
  return {
    // 棋盘视图：背面朝上的牌隐藏内容
    board: state.board.map(row => row.map(cell => ({
      card: cell.faceUp ? cell.card : null,  // 背面朝上时返回 null
      faceUp: cell.faceUp,
      exists: cell.card !== null,  // 标记是否有牌（客户端用此判断是否可点击）
    }))),
    myHand: me.hand,
    myDarkPickCharges: me.darkPickCharges,
    myCanPlace: me.canPlace,
    myPlayerIndex: idx,
    // 所有对手：只给数量和 id，不给牌面
    opponents: state.players
      .map((p, index) => ({ index, id: p.id, handCount: p.hand.length }))
      .filter(o => o.index !== idx),
    currentTurn: state.currentTurn,
    phase: state.phase,
    round: state.round,
    winner: state.winner,
    hasTakenThisTurn: state.hasTakenThisTurn,
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
  description: '基于25张扑克牌的2~4人博弈',
  minPlayers: 2,
  maxPlayers: 4,
  deckConfig: HUIMING_DECK_CONFIG,

  createInitialState(players: string[]): HuimingState {
    return initHuimingGame(players)
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
   *     所有玩家轮流放牌回棋盘 → 棋盘满 → 回到 taking 阶段
   */
  handleEvent(game: HuimingState, playerId: string, event: string, payload: unknown) {
    const state = game
    const playerIdx = game.players.findIndex(p => p.id === playerId)
    if (playerIdx === -1) return { state, broadcast: [], error: '玩家不在游戏中' }

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
        // 如果所有牌都背面朝上，所有玩家各获得 1 次暗取机会
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)

        resolveAfterTake(game, playerIdx)
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

        resolveAfterTake(game, playerIdx)
        break
      }

      case 'place': {
        const { cardId, row, col, faceUp } = readPlacePayload(payload)
        if (game.phase === 'placing') {
          // 续放阶段：所有玩家轮流将手牌放回棋盘，直到棋盘重新填满（规则 8）
          // 续放不受「每回合限放一次」限制
          const p = game.players[playerIdx]
          if (p.hand.length === 0) {
            // 这个玩家没牌可放 → 跳过；若所有人都没牌，续放结束
            const next = findNextPlayerWithCards(game, playerIdx)
            game.currentTurn = next === -1 ? nextIndex(game, playerIdx) : next
            if (next === -1) {
              game.phase = 'taking'
              game.hasTakenThisTurn = false
            }
            break
          }
          p.canPlace = true
          placeCard(game, playerIdx, cardId, row, col, faceUp)
          // 续放期间所有玩家的放牌权限都保持开启
          for (const player of game.players) player.canPlace = true

          const boardFull = !game.board.some(cells => cells.some(cell => !cell.card))
          if (boardFull) {
            // 棋盘填满 → 回到取牌阶段
            game.currentTurn = nextIndex(game, playerIdx)
            game.phase = 'taking'
            game.hasTakenThisTurn = false
          } else {
            const next = findNextPlayerWithCards(game, playerIdx)
            game.currentTurn = next === -1 ? nextIndex(game, playerIdx) : next
            if (next === -1) {
              game.phase = 'taking'
              game.hasTakenThisTurn = false
            }
          }
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

/** 环形取下一个座位下标。 */
function nextIndex(game: HuimingState, from: number): number {
  return (from + 1) % game.players.length
}

/**
 * 从 from 的下一位开始环形查找第一个手牌非空的玩家下标。
 * 所有玩家手牌都为空时返回 -1。
 */
function findNextPlayerWithCards(game: HuimingState, from: number): number {
  const playerCount = game.players.length
  for (let step = 1; step <= playerCount; step++) {
    const idx = (from + step) % playerCount
    if (game.players[idx].hand.length > 0) return idx
  }
  return -1
}

/**
 * 取牌后的统一收尾：
 *   1. 取牌者集齐 6 张同花色 → 该玩家获胜，游戏结束
 *   2. 棋盘还有牌 → 轮转下一位
 *   3. 棋盘取空 → 比各玩家的最大花色牌数：
 *        - 唯一最大者获胜
 *        - 并列最大 → 进入续放轮（规则 8），先手为最后取牌者的下一位
 */
function resolveAfterTake(game: HuimingState, playerIdx: number): void {
  if (checkWinner(game.players[playerIdx])) {
    game.phase = 'ended'
    game.winner = game.players[playerIdx].id
    return
  }

  if (countRemainingCards(game.board) > 0) {
    game.currentTurn = nextIndex(game, playerIdx)
    game.hasTakenThisTurn = false
    return
  }

  const scores = game.players.map(p => countMaxSuit(p.hand))
  const best = Math.max(...scores)
  const leaders = game.players.filter((_, i) => scores[i] === best)
  if (leaders.length === 1) {
    game.phase = 'ended'
    game.winner = leaders[0].id
    return
  }

  game.round++
  game.phase = 'placing'
  game.hasTakenThisTurn = false
  game.currentTurn = nextIndex(game, playerIdx)
  for (const player of game.players) player.canPlace = true
}

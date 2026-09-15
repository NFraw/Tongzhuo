/**
 * plugin.ts — 斗地主服务器端插件（GameServerPlugin 实现）
 *
 * 这是斗地主游戏的"总控制器"——实现了 GameServerPlugin 接口的全部 4 个方法。
 *
 * 职责：
 *   1. createInitialState — 创建初始状态（委托给 engine.ts）
 *   2. handleEvent        — 处理玩家操作（叫分/出牌/pass），更新状态
 *   3. getClientState     — 从完整状态生成该玩家的"视角"（脱敏）
 *   4. checkGameEnd       — 判定游戏是否结束
 *
 * 被谁调用：
 *   socket-framework.ts 中的 game:action 处理器调用 handleEvent，
 *   room:start 调用 createInitialState，broadcastState 调用 getClientState，
 *   game:action 后调用 checkGameEnd。
 */
import type { Card, GameServerPlugin } from '@tongzhuo/core-shared'
import { createLandlordGame } from './engine'
import { isValidBid, isValidPlay, canPass } from './rules'
import { getHandType } from './hand'
import type { LandlordState, LandlordClientState } from './types'

const LANDLORD_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
  jokers: 2,
}

/**
 * 从完整状态生成某玩家的"视角"。隐藏其他玩家的手牌，只显示数量。
 *
 * 底牌可见性规则：
 *   - 盲叫阶段（round 1）：无人可见
 *   - 明叫阶段（round 2）：所有人可见
 *   - 出牌阶段：暗地主（round 1 确定）→ 仅地主可见；明地主（round 2 确定）→ 所有人可见
 *   - 结束阶段：所有人可见
 *
 * 调用处：socket-framework.ts → broadcastState()，为每个玩家单独调用
 */
function getClientState(state: LandlordState, playerId: string): LandlordClientState {
  const myIdx = state.players.findIndex(p => p.id === playerId)
  const me = state.players[myIdx]
  const otherIndices = [0, 1, 2].filter(i => i !== myIdx)
  const otherHandCounts: [number, number] = [
    state.players[otherIndices[0]].hand.length,
    state.players[otherIndices[1]].hand.length,
  ]

  const lastBid = state.bidding.highestBid > 0 ? state.bidding.highestBid : null

  // 底牌可见性判断
  let showBottom = false
  if (state.currentPhase === 'bidding') {
    showBottom = state.bidding.round >= 2  // 明叫阶段亮出
  } else if (state.currentPhase === 'playing') {
    showBottom = state.bidding.landlordDecidedInRound >= 2 || me.role === 'landlord'
  } else {
    showBottom = true // 结束阶段全亮
  }

  return {
    myPlayerIndex: myIdx,
    playerIds: state.players.map(p => p.id),  // 用于客户端映射昵称
    myHand: me.hand,
    otherHandCounts,
    bottomCards: showBottom ? state.bottomCards : [],
    currentPhase: state.currentPhase,
    currentTurn: state.currentTurn,
    biddingInfo: {
      highestBid: state.bidding.highestBid,
      highestBidder: state.bidding.highestBidder,
      myTurnToBid: state.currentPhase === 'bidding' && state.bidding.currentBidder === myIdx,
      lastBid,
      bottomRevealed: state.bidding.bottomRevealed,
      round: state.bidding.round,
    },
    gameInfo: {
      landlord: state.game.landlord,
      lastPlay: state.game.lastPlay,
      lastPlayer: state.game.lastPlayer,
      passCount: state.game.passCount,
      passEvent: state.game.passEvent,
      multiplier: state.game.multiplier,
      baseScore: state.game.baseScore,
    },
    myRole: me.role,
    winner: state.winner,
  }
}

/**
 * 斗地主服务器插件实例。注册到 PluginLoader 后，服务器就能处理斗地主游戏。
 *
 * 注册方式：server/src/index.ts 中调用 pluginLoader.register(landlordServerPlugin)
 */
export const landlordServerPlugin: GameServerPlugin<LandlordState, LandlordClientState> = {
  id: 'landlord',
  name: '欢乐斗地主',
  description: '经典三人扑克牌游戏',
  minPlayers: 3,
  maxPlayers: 3,
  deckConfig: LANDLORD_DECK_CONFIG,

  createInitialState(players: string[]): LandlordState {
    return createLandlordGame(players)
  },

  /**
   * 处理游戏事件。这是游戏逻辑的核心状态机。
   *
   * 支持的事件：
   *   - 'bid'   → 叫分（payload: { score: 0~3 }）
   *   - 'play'  → 出牌（payload: { cards: Card[] }）
   *   - 'pass'  → 不出（payload: 无）
   *
   * 状态转换：
   *   bidding 阶段：
   *     3 人叫完 → 有人叫分 → assignLandlord → playing 阶段
   *     3 人叫完 → 无人叫分 → round 2 或重新发牌
   *   playing 阶段：
   *     出牌 → 手牌为空 → ended 阶段
   *     2 人 pass → 清空 lastPlay，自由出牌
   */
  handleEvent(game: LandlordState, playerId: string, event: string, payload: unknown) {
    const state = game
    const broadcast: { event: string; data: any }[] = []

    switch (event) {
      case 'bid': {
        if (game.currentPhase !== 'bidding') return { state, broadcast, error: '当前不是叫分阶段' }
        const score = readNumber(payload, 'score')
        if (!isValidBid(game, playerId, score)) return { state, broadcast, error: '无效的叫分' }

        const bidderIdx = game.bidding.currentBidder
        game.bidding.turnsTaken++

        if (score === 0) {
          game.bidding.passCount++
        } else {
          game.bidding.highestBid = score
          game.bidding.highestBidder = bidderIdx
          game.bidding.passCount = 0
          // 叫 3 分直接成为地主（最高分）
          if (score === 3) {
            assignLandlord(game, bidderIdx)
            break
          }
        }

        // 3 人都叫过了 → 判断本轮结果
        if (game.bidding.turnsTaken >= 3) {
          if (game.bidding.highestBidder >= 0) {
            // 有人叫分 → 成为地主
            assignLandlord(game, game.bidding.highestBidder)
          } else if (game.bidding.round === 1) {
            // 盲叫阶段无人叫 → 进入明叫阶段（亮出底牌）
            game.bidding.bottomRevealed = true
            game.bidding.round = 2
            game.bidding.turnsTaken = 0
            game.bidding.passCount = 0
            game.bidding.currentBidder = game.bidding.startBidder
            game.currentTurn = game.bidding.startBidder
          } else {
            // 明叫阶段仍无人叫 → 重新发牌
            const newGame = createLandlordGame(game.players.map(p => p.id))
            Object.assign(game, newGame)
          }
          break
        }

        // 轮到下一人叫分
        game.bidding.currentBidder = (game.bidding.currentBidder + 1) % 3
        game.currentTurn = game.bidding.currentBidder
        break
      }

      case 'play': {
        if (game.currentPhase !== 'playing') return { state, broadcast, error: '当前不是出牌阶段' }
        const playerIdx = game.players.findIndex(p => p.id === playerId)
        if (playerIdx === -1 || playerIdx !== game.currentTurn) return { state, broadcast, error: '不是你的回合' }

        const cards = readCards(payload)
        if (!isValidPlay(game, playerId, cards)) return { state, broadcast, error: '无效的出牌' }

        // 【安全关键】用服务器端真实牌数据替换客户端数据
        const hand = game.players[playerIdx].hand
        const playIds = new Set(cards.map(c => c.id))
        const realCards = hand.filter(c => playIds.has(c.id))
        game.players[playerIdx].hand = hand.filter(c => !playIds.has(c.id))

        // 记录出牌
        const handType = getHandType(realCards)!
        game.game.lastPlay = { cards: realCards, type: handType.type, mainRank: handType.mainRank }
        game.game.lastPlayer = playerIdx
        game.game.passCount = 0

        // 炸弹/火箭翻倍
        if (handType.type === 'bomb' || handType.type === 'rocket') {
          game.game.multiplier *= 2
        }

        // 手牌出完 → 游戏结束
        if (game.players[playerIdx].hand.length === 0) {
          game.currentPhase = 'ended'
          game.winner = playerIdx === game.game.landlord ? 'landlord' : 'farmer'
          break
        }

        game.currentTurn = (game.currentTurn + 1) % 3
        break
      }

      case 'pass': {
        if (game.currentPhase !== 'playing') return { state, broadcast, error: '当前不是出牌阶段' }
        if (!canPass(game, playerId)) return { state, broadcast, error: '当前必须出牌' }

        game.game.passCount++
        game.game.passEvent++
        game.currentTurn = (game.currentTurn + 1) % 3

        // 2 人连续 pass → 上一个出牌者获得自由出牌权
        if (game.game.passCount >= 2) {
          game.game.lastPlay = null
          game.game.passCount = 0
        }
        break
      }

      default:
        return { state, broadcast, error: '未知事件' }
    }

    return { state, broadcast }
  },

  getClientState,
  checkGameEnd(state: LandlordState): string | null {
    return state.winner
  },
}

function readNumber(payload: unknown, key: string): number {
  if (!payload || typeof payload !== 'object') return Number.NaN
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : Number.NaN
}

function readCards(payload: unknown): Card[] {
  if (!payload || typeof payload !== 'object') return []
  const cards = (payload as Record<string, unknown>).cards
  if (!Array.isArray(cards)) return []
  return cards.filter((card): card is Card => {
    return !!card && typeof card === 'object' && typeof (card as { id?: unknown }).id === 'string'
  })
}

/**
 * 确定地主并切换到出牌阶段。
 *
 * 流程：
 *   1. 设置 landlord 和 baseScore
 *   2. 分配角色（地主/农民）
 *   3. 地主拿走底牌（手牌从 17 张变成 20 张）
 *   4. 按斗地主点数排序手牌
 *   5. 切换到 playing 阶段，地主先出
 */
function assignLandlord(game: LandlordState, landlordIdx: number): void {
  game.game.landlord = landlordIdx
  game.game.baseScore = game.bidding.highestBid
  game.bidding.landlordDecidedInRound = game.bidding.round

  // 分配角色
  game.players[landlordIdx].role = 'landlord'
  for (let i = 0; i < 3; i++) {
    if (i !== landlordIdx) game.players[i].role = 'farmer'
  }

  // 地主拿走底牌
  game.players[landlordIdx].hand.push(...game.bottomCards)

  // 按斗地主点数排序
  game.players[landlordIdx].hand.sort((a, b) => {
    const ra = a.suit === 'joker_red' ? 17 : a.suit === 'joker_black' ? 16 : a.rank === 'A' ? 14 : a.rank === '2' ? 15 : a.value
    const rb = b.suit === 'joker_red' ? 17 : b.suit === 'joker_black' ? 16 : b.rank === 'A' ? 14 : b.rank === '2' ? 15 : b.value
    return ra - rb
  })

  // 切换到出牌阶段，地主先出
  game.currentPhase = 'playing'
  game.currentTurn = landlordIdx
}

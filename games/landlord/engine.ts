/**
 * engine.ts — 斗地主游戏引擎（初始化 + 发牌）
 *
 * 负责创建一局新游戏的初始状态。这是 GameServerPlugin.createInitialState() 的具体实现。
 *
 * 斗地主牌组：54 张牌 = 4花色×13点数 + 2张王
 * 发牌规则：洗牌后前 51 张平均分给 3 人（每人 17 张），最后 3 张作为底牌。
 * 游戏流程：叫分（bid）→ 确定地主 → 地主拿底牌（共 20 张）→ 出牌 → 先出完者胜。
 *
 * 【如果你想修改发牌规则】：
 *   - 修改 LANDLORD_DECK_CONFIG 改变牌组组成
 *   - 修改 dealCards() 改变发牌方式
 *   - 修改 createLandlordGame() 改变初始状态结构
 */
import { createDeck, shuffleDeck, type Card } from '@huiming/core-shared'
import type { LandlordState, LandlordPlayer } from './types'

/**
 * 斗地主牌组配置。
 * - 4 种标准花色
 * - 点数从 3 到 2（注意：这里的 '2' 是牌面上的 2，不是索引）
 * - 2 张大小王
 *
 * 总计：4×13 + 2 = 54 张
 */
const LANDLORD_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
  jokers: 2,
}

/**
 * 发牌：洗牌后分给 3 个玩家，剩余 3 张作为底牌。
 *
 * 分牌方式：轮流发牌（类似真实打牌），第 1 张给玩家 0，第 2 张给玩家 1，
 * 第 3 张给玩家 2，第 4 张给玩家 0，以此类推。
 *
 * 发完后按斗地主点数排序（从小到大），方便玩家看牌。
 *
 * @param deck - 原始牌组（未洗牌）
 * @returns { hands: [玩家0手牌, 玩家1手牌, 玩家2手牌], bottom: [底牌1, 底牌2, 底牌3] }
 *
 * 调用处：本文件 createLandlordGame()
 */
export function dealCards(deck: Card[]): { hands: Card[][]; bottom: Card[] } {
  const shuffled = shuffleDeck(deck)

  // 轮流发牌：i % 3 决定发给哪个玩家
  const hands: Card[][] = [[], [], []]
  for (let i = 0; i < 51; i++) {
    hands[i % 3].push(shuffled[i])
  }

  // 最后 3 张作为底牌（叫分结束后由地主拿走）
  const bottom = [shuffled[51], shuffled[52], shuffled[53]]

  // 按斗地主点数从小到大排序，方便玩家在 UI 中查看和选牌
  for (const hand of hands) {
    hand.sort((a, b) => {
      // inline landlordRank 排序（避免引入 hand.ts 依赖）
      const ra = a.suit === 'joker_red' ? 17 : a.suit === 'joker_black' ? 16 : a.rank === 'A' ? 14 : a.rank === '2' ? 15 : a.value
      const rb = b.suit === 'joker_red' ? 17 : b.suit === 'joker_black' ? 16 : b.rank === 'A' ? 14 : b.rank === '2' ? 15 : b.value
      return ra - rb
    })
  }
  return { hands, bottom }
}

/**
 * 创建一局新的斗地主游戏。这是整个游戏的"构造函数"。
 *
 * @param playerIds - 3 个玩家的 ID（按座位顺序）
 * @returns 完整的初始 LandlordState
 *
 * 返回的状态包含：
 *   - players: 3 个玩家（每人 17 张手牌，角色未定）
 *   - bottomCards: 3 张底牌（地主确定后才分配）
 *   - currentPhase: 'bidding'（从叫分阶段开始）
 *   - bidding: 叫分状态（谁在叫、最高分、第几轮等）
 *   - game: 出牌状态（地主是谁、上次出牌、连续 pass 次数等）
 *   - winner: null（未结束）
 *
 * 调用处：games/landlord/plugin.ts → createInitialState()
 */
export function createLandlordGame(playerIds: string[]): LandlordState {
  const deck = createDeck(LANDLORD_DECK_CONFIG)
  const { hands, bottom } = dealCards(deck)

  const players: LandlordPlayer[] = playerIds.map((id, i) => ({
    id,
    hand: hands[i],
    role: null,  // 叫分结束后确定：'landlord' 或 'farmer'
  }))

  // 随机选一个玩家先叫分
  const startBidder = Math.floor(Math.random() * 3)

  return {
    players,
    bottomCards: bottom,
    currentPhase: 'bidding',    // 游戏阶段：'bidding' → 'playing' → 'ended'
    currentTurn: startBidder,   // 当前轮到谁（叫分阶段和出牌阶段共用）
    bidding: {
      currentBidder: startBidder,   // 当前叫分者
      highestBid: 0,                 // 当前最高叫分（0=无人叫，1~3 为分数）
      highestBidder: -1,             // 最高叫分者的索引（-1=无人叫）
      passCount: 0,                  // 连续不叫的人数
      startBidder,                   // 第一个叫分者（用于判断一轮结束）
      turnsTaken: 0,                 // 已经有几人叫过分
      bottomRevealed: false,         // 底牌是否已亮出（明叫阶段亮出）
      round: 1,                      // 叫分轮次（1=盲叫，2=明叫）
      landlordDecidedInRound: 0,     // 地主在哪轮确定的（影响底牌可见性）
    },
    game: {
      landlord: null,        // 地主的玩家索引（叫分结束后确定）
      lastPlay: null,        // 上一手出的牌（null=自由出牌）
      lastPlayer: null,      // 上一个出牌的玩家索引
      passCount: 0,          // 连续 pass 的次数（2 人 pass 后清空 lastPlay）
      passEvent: 0,          // pass 事件单调计数器（用于客户端播放 pass 语音）
      multiplier: 1,         // 倍数（炸弹/火箭翻倍）
      baseScore: 0,          // 底分（地主叫的分数）
    },
    winner: null,  // 获胜者（'landlord' 或 'farmer'），null=未结束
  }
}

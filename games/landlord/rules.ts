/**
 * rules.ts — 斗地主规则校验
 *
 * 所有玩家操作的合法性校验都在这里。这是防止作弊的关键——服务器在处理每个操作前
 * 都会先调用这些函数验证。
 *
 * 类比 Java：相当于一个 Validator 类，所有 public 方法都是校验规则。
 *
 * 安全原则：永远不要信任客户端数据。isValidPlay() 会用服务器端的手牌数据
 * 替换客户端传来的牌，确保玩家只能出自己手里有的牌。
 */
import type { Card } from '@huiming/core-shared'
import type { LandlordState } from './types'
import { getHandType, canBeat } from './hand'

/**
 * 校验叫分是否合法。
 *
 * 叫分规则：
 *   1. 必须在叫分阶段（currentPhase === 'bidding'）
 *   2. 必须轮到该玩家叫分（currentBidder === playerIdx）
 *   3. score=0 表示不叫（任何时候都允许）
 *   4. score>0 必须大于当前最高叫分
 *
 * @param state    - 当前游戏状态
 * @param playerId - 叫分的玩家 ID
 * @param score    - 叫的分数（0=不叫，1~3=分数）
 * @returns true 如果叫分合法
 *
 * 调用处：games/landlord/plugin.ts → handleEvent() 的 'bid' 分支
 */
export function isValidBid(state: LandlordState, playerId: string, score: number): boolean {
  if (state.currentPhase !== 'bidding') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.bidding.currentBidder) return false
  if (score < 0 || score > 3) return false
  if (score === 0) return true  // 不叫永远允许
  return score > state.bidding.highestBid  // 叫分必须比当前最高分高
}

/**
 * 校验出牌是否合法。这是最重要的安全校验函数。
 *
 * 校验步骤：
 *   1. 必须在出牌阶段且轮到该玩家
 *   2. 客户端传来的牌 ID 必须在服务器端的手牌中存在（防作弊）
 *   3. 用服务器端的真实牌数据替换客户端数据（防止伪造牌面）
 *   4. 出的牌必须构成合法牌型（通过 getHandType 识别）
 *   5. 如果有上一手牌，必须能压过它（通过 canBeat 判断）
 *
 * @param state    - 当前游戏状态
 * @param playerId - 出牌的玩家 ID
 * @param cards    - 客户端传来的牌（只使用 id 字段，实际牌面从服务器手牌中查找）
 * @returns true 如果出牌合法
 *
 * 调用处：games/landlord/plugin.ts → handleEvent() 的 'play' 分支
 */
export function isValidPlay(state: LandlordState, playerId: string, cards: Card[]): boolean {
  if (state.currentPhase !== 'playing') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.currentTurn) return false
  if (!Array.isArray(cards) || cards.length === 0) return false

  // 【安全关键】用服务器端手牌数据替换客户端数据，防止篡改
  // 客户端可能发送 {id: 'hearts-A', suit: 'hearts', rank: 'A'}，
  // 但如果这张牌不在玩家手中，这里会返回 false。
  const hand = state.players[playerIdx].hand
  const handMap = new Map(hand.map(c => [c.id, c]))
  const realCards: Card[] = []
  for (const c of cards) {
    const real = handMap.get(c.id)
    if (!real) return false  // 牌不在手中 → 非法
    realCards.push(real)
  }

  // 识别牌型
  const handType = getHandType(realCards)
  if (!handType) return false  // 不构成合法牌型

  const played = { cards: realCards, type: handType.type, mainRank: handType.mainRank }

  // 如果有上一手牌且不是自己出的，必须能压过
  const { lastPlay, lastPlayer } = state.game
  if (lastPlay && lastPlayer !== playerIdx) {
    return canBeat(played, lastPlay)
  }

  return true  // 自由出牌（没人出过或上一手是自己出的）
}

/**
 * 校验当前玩家是否可以 pass（不出）。
 *
 * pass 规则：
 *   1. 必须在出牌阶段且轮到该玩家
 *   2. 自由出牌时不能 pass（必须出牌）
 *   3. 如果上一手是自己出的（其他人都 pass 了），不能 pass（必须继续出）
 *
 * @returns true 如果可以 pass
 *
 * 调用处：games/landlord/plugin.ts → handleEvent() 的 'pass' 分支
 */
export function canPass(state: LandlordState, playerId: string): boolean {
  if (state.currentPhase !== 'playing') return false
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1 || playerIdx !== state.currentTurn) return false

  const { lastPlay, lastPlayer } = state.game
  if (!lastPlay) return false          // 自由出牌，必须出
  if (lastPlayer === playerIdx) return false  // 其他人已 pass，必须继续出
  return true
}

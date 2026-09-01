/**
 * types.ts — 牛头人（6 Nimmt!）游戏的类型定义
 *
 * 牛头人游戏概述：
 *   - 2~6 人，每人 10 张手牌
 *   - 每轮所有人同时选一张牌暗扣，然后按点数从小到大依次翻开
 *   - 翻开的牌放到牌桌 4 行中末尾最接近但不超过它的那一行
 *   - 如果某行已有 5 张牌，该行被"吃掉"，牛头数计入得分
 *   - 如果翻开的牌比所有行末尾都小，该玩家必须选择吃掉一整行
 *   - 10 轮后得分最少的玩家获胜
 *
 * 【如果你想修改游戏参数】：
 *   - engine.ts 中的 TOTAL_CARDS（总牌数）、HAND_SIZE（手牌数）
 *   - engine.ts 中的 cattleHeads() 改变牛头数计算
 *   - board 行数在 createNimmtGame 中硬编码为 4
 */
import type { Card } from '@huiming/core-shared'

/**
 * 牛头人玩家状态。
 *
 * id:        玩家唯一 ID
 * hand:      手牌列表（10 张）
 * score:     累计牛头数（越少越好）
 * scorePile: 已吃掉的牌堆（用于平局判定）
 */
export interface NimmtPlayer {
  id: string
  hand: Card[]
  score: number
  scorePile: Card[]
}

/**
 * 结算步骤记录。
 *
 * 用于客户端动画播放：每一步描述一张牌从哪里放到哪里、吃了多少牛头。
 *
 * playerIndex - 谁的牌
 * card        - 哪张牌
 * placedRow   - 放到了哪一行
 * pickedUpRow - 如果触发了吃行，这里是被吃的行号，否则 null
 * gainedHeads - 本步获得的牛头数
 */
export interface ResolveStep {
  playerIndex: number
  card: Card
  placedRow: number
  pickedUpRow: number | null
  gainedHeads: number
}

/**
 * 牛头人完整游戏状态（服务器端）。
 *
 * players:       所有玩家
 * board:         牌桌 4 行，每行是一个 Card 数组，末尾是当前最大值
 * phase:         'selecting'=选牌阶段, 'resolving'=结算阶段, 'ended'=游戏结束
 * round:         当前轮次（1~10）
 * committed:     每个玩家本轮已选的牌（null=未选）
 * revealQueue:   按点数排序的待结算队列
 * resolveStep:   当前结算到第几张
 * pendingPickup: 如果某张牌比所有行末尾都小，该玩家需要选一行吃掉
 * pendingCard:   待放入的牌（配合 pendingPickup）
 * resolveSteps:  本回合的结算步骤记录（动画用）
 * lastResolve:   上一回合的结算步骤（用于客户端显示）
 * winner:        获胜者 playerId
 * winnerIndex:   获胜者索引
 */
export interface NimmtState {
  players: NimmtPlayer[]
  board: Card[][] // 4 行，每行最后一张是当前最大值
  phase: 'selecting' | 'resolving' | 'ended'
  round: number // 1~10
  committed: (Card | null)[] // 每个玩家本轮选的牌
  revealQueue: { playerIndex: number; card: Card }[] // 按点数升序的结算队列
  resolveStep: number
  pendingPickup: number | null // 需要选行吃掉的玩家索引
  pendingCard: Card | null
  resolveSteps: ResolveStep[] // 本回合结算步骤
  lastResolve: ResolveStep[] | null // 上回合结算步骤
  winner: string | null
  winnerIndex: number | null
}

/**
 * 牛头人客户端状态（脱敏后的玩家"视角"）。
 *
 * 与 NimmtState 的区别：
 *   - 只显示自己的手牌，其他玩家只显示数量
 *   - 自己已选的牌显示内容，其他人只显示是否已选
 *   - 牌桌完全公开（所有人的牌桌相同）
 */
export interface NimmtClientState {
  /** 我是第几号玩家 */
  myIndex: number
  /** 我的手牌 */
  myHand: Card[]
  /** 我本轮选的牌（null=未选） */
  myCommitted: Card | null
  /** 所有玩家的公开信息（不含手牌内容） */
  players: { id: string; score: number; handCount: number; committed: boolean }[]
  /** 牌桌 4 行（完全公开） */
  board: Card[][]
  /** 当前轮次 */
  round: number
  /** 当前阶段 */
  phase: NimmtState['phase']
  /** 需要选行的玩家信息（null=不需要） */
  pendingPickup: { playerIndex: number; card: Card } | null
  /** 上回合结算步骤（用于回放动画） */
  lastResolve: ResolveStep[] | null
  /** 获胜者索引 */
  winnerIndex: number | null
  /** 我是否获胜 */
  myWinner: boolean
}

/**
 * types.ts — 晦明游戏的类型定义
 *
 * 定义了晦明游戏的所有数据结构。
 * 类比 Java：相当于一个 types/interfaces 文件，定义了游戏中用到的所有"数据类"。
 *
 * 晦明游戏概述：
 *   - 2 人对战，25 张牌（4 花色×6 点数 + 1 张 Joker）排成 5×5 棋盘
 *   - 玩家轮流：取牌（明取/暗取）→ 翻开相邻牌 → 可选放牌回棋盘
 *   - 胜利条件：集齐同一花色 6 张（含 Joker 万能牌）
 *
 * 【如果你想修改游戏规则】：
 *   - 修改 engine.ts 中的 createHuimingBoard() 改变棋盘大小/牌数
 *   - 修改 rules.ts 中的 checkWinner() 改变胜利条件
 *   - 修改 engine.ts 中的 flipNeighbors() 改变翻开邻居的范围
 */
import type { Card } from '@huiming/core-shared'

/** 花色类型（不含 Joker，Joker 通过 suit 字段前缀 'joker' 判断） */
export type HuimingSuit = 'hearts' | 'spades' | 'diamonds' | 'clubs'

/**
 * 棋盘格子。
 *
 * card: 格子上的牌，null 表示空位（已被取走）
 * faceUp: true=正面朝上（所有人可见），false=背面朝上（仅暗取时可选）
 */
export interface HuimingCell {
  card: Card | null
  faceUp: boolean
}

/**
 * 棋盘：5 行 × 5 列的二维数组。
 * board[row][col]，row 从上到下 0~4，col 从左到右 0~4。
 */
export type HuimingBoard = HuimingCell[][]

/**
 * 晦明玩家状态。
 *
 * id:           玩家唯一 ID（对应 socket-framework 中的 playerId）
 * hand:         手牌列表（从棋盘取到的牌）
 * darkPickCharges: 暗取次数（消耗后才能取背面朝上的牌，可通过"全暗"事件补充）
 * canPlace:     本回合是否还能放牌（每回合限放一次，取牌后不可放）
 */
export interface HuimingPlayer {
  id: string
  hand: Card[]
  darkPickCharges: number
  canPlace: boolean
}

/**
 * 晦明完整游戏状态（服务器端）。
 *
 * board:           5×5 棋盘
 * players:         两个玩家的状态，[0] 和 [1]
 * currentTurn:     当前轮到哪个玩家（0 或 1）
 * phase:           'taking'=取牌阶段, 'placing'=续放阶段, 'ended'=游戏结束
 * round:           当前轮次（续放后递增）
 * winner:          获胜者 playerId，null 表示未结束
 * hasTakenThisTurn: 本回合是否已取牌（规则：必须先放牌再取牌）
 */
export interface HuimingState {
  board: HuimingBoard
  players: [HuimingPlayer, HuimingPlayer]
  currentTurn: 0 | 1
  phase: 'placing' | 'taking' | 'ended'
  round: number
  winner: string | null
  hasTakenThisTurn: boolean
}

/**
 * 晦明客户端状态（脱敏后的玩家"视角"）。
 *
 * 与 HuimingState 的区别：
 *   - board 中背面朝上的牌不显示内容（card: null），只标记是否存在
 *   - 对手的手牌不显示，只显示数量
 *   - 只显示自己的暗取次数和放牌状态
 *
 * 这就是"信息不对称"的实现——每个玩家看到的棋盘不同。
 */
export interface HuimingClientState {
  /** 棋盘视图：faceUp=false 的格子 card=null，仅 exists=true 表示有牌 */
  board: { card: Card | null; faceUp: boolean; exists: boolean }[][]
  /** 我的手牌 */
  myHand: Card[]
  /** 对手手牌数量（不暴露具体牌面） */
  opponentHandCount: number
  /** 我的剩余暗取次数 */
  myDarkPickCharges: number
  /** 我本回合是否还能放牌 */
  myCanPlace: boolean
  /** 我是玩家 0 还是玩家 1 */
  myPlayerIndex: 0 | 1
  /** 当前轮到谁 */
  currentTurn: 0 | 1
  /** 当前阶段 */
  phase: string
  /** 当前轮次 */
  round: number
  /** 获胜者 ID，null=未结束 */
  winner: string | null
  /** 本回合是否已取牌 */
  hasTakenThisTurn: boolean
  /** 对手的 playerId，用于显示昵称 */
  opponentId: string
}

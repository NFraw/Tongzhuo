/**
 * rules.ts — 晦明游戏规则校验
 *
 * 提供各种"能不能做"的判断函数。
 * 这些函数不修改状态，只读取状态并返回 boolean。
 *
 * 类比 Java：相当于一个 RulesValidator 工具类。
 *
 * 设计原则：
 *   - 所有规则判断集中在这里，方便修改和测试
 *   - engine.ts 负责"怎么做"，rules.ts 负责"能不能做"
 *   - plugin.ts 调用 rules.ts 检查后再调用 engine.ts 执行
 *
 * 【如果你想修改规则】：
 *   - canTake()：谁能取什么牌
 *   - canPlace()：谁能放牌
 *   - checkWinner()：胜利条件
 *   - countMaxSuit()：用于规则 8 收尾判定的最大花色计数
 */
import type { Card, Suit } from '@huiming/core-shared'
import type { HuimingPlayer, HuimingState } from './types'

/** 四种标准花色（不含 Joker） */
const SUITS: Suit[] = ['hearts', 'spades', 'diamonds', 'clubs']

/**
 * 判断能否从棋盘指定位置取牌。
 *
 * @param game      - 游戏状态（只读）
 * @param row       - 行号
 * @param col       - 列号
 * @param playerIdx - 玩家索引
 * @returns true = 可以取
 *
 * 规则：
 *   - 格子必须有牌
 *   - 正面朝上的牌：谁都可以取
 *   - 背面朝上的牌：需要暗取次数 > 0
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function canTake(game: HuimingState, row: number, col: number, playerIdx: number): boolean {
  const cell = game.board[row]?.[col]
  if (!cell?.card) return false
  if (cell.faceUp) return true
  // Joker 也允许暗取：早期版本禁止暗取 Joker，但当棋盘只剩一张背面朝上的
  // Joker 时会形成死锁——它谁都取不走，countRemainingCards 永远不为 0，
  // 结算触发不了，所有人放牌机会用尽后就没有任何合法动作。
  return game.players[playerIdx].darkPickCharges > 0
}

/**
 * 判断玩家能否放牌。
 *
 * @param game      - 游戏状态（只读）
 * @param playerIdx - 玩家索引
 * @returns true = 可以放
 *
 * 规则：
 *   - canPlace 标记必须为 true（每回合限放一次）
 *   - 手牌不能为空
 *
 * 调用处：plugin.ts → handleEvent('place')
 */
export function canPlace(game: HuimingState, playerIdx: number): boolean {
  const p = game.players[playerIdx]
  return p.canPlace && p.hand.length > 0
}

/**
 * 判断玩家是否有暗取次数。
 * 用于客户端 UI 显示（是否显示"暗取"按钮）。
 *
 * 调用处：客户端 UI 判断
 */
export function canDarkPick(game: HuimingState, playerIdx: number): boolean {
  return game.players[playerIdx].darkPickCharges > 0
}

/**
 * 判断玩家是否满足胜利条件。
 *
 * 胜利条件：手牌中集齐同一花色的 6 张牌（Joker 可作为万能牌填补）。
 *
 * 算法：
 *   1. 统计手牌中 Joker 的数量
 *   2. 对每种花色，统计该花色的牌数 + Joker 数是否 >= 6
 *   3. 任意一种花色满足即获胜
 *
 * @param player - 玩家状态（只读）
 * @returns true = 该玩家获胜
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function checkWinner(player: HuimingPlayer): boolean {
  const jokers = player.hand.filter(c => c.suit.toString().startsWith('joker')).length
  for (const suit of SUITS) {
    if (player.hand.filter(c => c.suit === suit).length + jokers >= 6) return true
  }
  return false
}

/**
 * 统计手牌中最大花色的牌数（含 Joker）。
 *
 * 用于规则 8 的收尾判定：第一轮取空先进续放轮，**第二轮起**取空且无人集齐
 * 6 张时才比这个数，最大者获胜；并列最大则再进一轮续放。
 *
 * @param hand - 手牌列表
 * @returns 最大花色的牌数（已包含 Joker 数量）
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')（平局判定）
 */
export function countMaxSuit(hand: Card[]): number {
  const jokers = hand.filter(c => c.suit.toString().startsWith('joker')).length
  let max = 0
  for (const suit of SUITS) {
    const count = hand.filter(c => c.suit === suit).length
    if (count > max) max = count
  }
  return max + jokers
}

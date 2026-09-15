/**
 * hand.ts — 斗地主牌型识别与比较
 *
 * 这是斗地主最核心的算法文件。它实现了：
 *   1. landlordRank() — 斗地主专用的点数排序值（3最小，大王最大）
 *   2. getHandType()  — 识别一组牌的牌型（单张、对子、顺子、飞机等 15 种）
 *   3. canBeat()      — 判断一手牌能否压过上一手
 *
 * 类比 C++：这相当于一个 hand_analyzer.h/.cpp，核心算法在 getHandType 中。
 *
 * 【牌型识别算法概述】：
 *   1. 将牌按点数分组（groupByRank）→ 得到 Map<rank, Card[]>
 *   2. 统计"出现次数→点数列表"的分布（countDistribution）
 *      例：333444 → 3出现→[3,4]，分布为 {3: [3,4]}
 *   3. 根据总牌数和分布模式判断牌型
 *      例：6张，dist[3]有两个连续点数 → 飞机(不带翅膀)
 *
 * 【添加新牌型】：
 *   在 getHandType() 函数中添加新的 if 分支，并在 types.ts 的 HandType 中加上新类型。
 *   然后在 rules.ts 的 isValidPlay() 中确保新牌型被正确校验。
 */
import type { Card } from '@tongzhuo/core-shared'
import type { HandType, PlayedCards } from './types'

/**
 * 斗地主专用点数排序值。不同于 Card.value（通用值），斗地主的排序规则是：
 *
 *   3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2 < 小王 < 大王
 *   3  4  5  6  7  8  9  10  11  12  13  14  15   16     17
 *
 * 注意：通用 Card.value 中 A=1、2=2，但斗地主里 A 和 2 是最大的普通牌。
 * 这个函数就是把通用值转换为斗地主专用值。
 *
 * @param card - 一张牌
 * @returns 斗地主排序值（3=3, ..., K=13, A=14, 2=15, 小王=16, 大王=17）
 *
 * 调用处：本文件内部（groupByRank、getHandType），以及 rules.ts 中排序出牌。
 */
export function landlordRank(card: Card): number {
  if (card.suit === 'joker_red') return 17   // 大王（最大）
  if (card.suit === 'joker_black') return 16  // 小王
  if (card.rank === 'A') return 14            // A 比 K 大
  if (card.rank === '2') return 15            // 2 比 A 大
  return card.value  // 3-13 (3-K) 保持不变
}

/**
 * 将手牌按斗地主点数分组。
 *
 * 例：[3♠, 3♥, 5♦, 5♣, 5♠] → Map { 3 → [3♠,3♥], 5 → [5♦,5♣,5♠] }
 *
 * 这是牌型识别的第一步——先知道每种点数有几张。
 */
function groupByRank(cards: Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>()
  for (const card of cards) {
    const rank = landlordRank(card)
    const arr = groups.get(rank) || []
    arr.push(card)
    groups.set(rank, arr)
  }
  return groups
}

/**
 * 统计"出现次数 → 点数列表"的分布。
 *
 * 例：groupByRank 的结果是 {3: [♠,♥], 5: [♦,♣,♠]}
 *   → countDistribution 的结果是 {2: [3], 3: [5]}
 *   含义：出现 2 次的点数有 [3]，出现 3 次的点数有 [5]
 *
 * 这是牌型识别的第二步——通过分布模式判断牌型。
 * 例如：dist[3] 有两个连续点数 → 可能是飞机。
 */
function countDistribution(groups: Map<number, Card[]>): Map<number, number[]> {
  const dist = new Map<number, number[]>()
  for (const [rank, arr] of groups) {
    const count = arr.length
    const ranks = dist.get(count) || []
    ranks.push(rank)
    dist.set(count, ranks)
  }
  // 每组内的点数排序，方便后续检查连续性
  for (const ranks of dist.values()) {
    ranks.sort((a, b) => a - b)
  }
  return dist
}

/**
 * 检查一组点数是否构成连续序列。
 *
 * 斗地主规则：顺子只能用 3~A（值 3~14），不含 2（15）和王（16,17）。
 *
 * @param ranks   - 要检查的点数列表
 * @param minRank - 允许的最小点数（默认 3）
 * @param maxRank - 允许的最大点数（默认 14，即 A）
 * @returns true 如果 ranks 中所有值都在 [minRank, maxRank] 范围内且连续
 *
 * 例：[3,4,5,6,7] → true；[3,4,6] → false（不连续）；[14,15] → false（含 2）
 */
function isConsecutive(ranks: number[], minRank: number = 3, maxRank: number = 14): boolean {
  if (ranks.length < 2) return false
  // 先检查所有点数都在允许范围内
  for (const r of ranks) {
    if (r < minRank || r > maxRank) return false
  }
  // 排序后检查相邻差值是否为 1
  const sorted = [...ranks].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false
  }
  return true
}

/**
 * 识别一组牌的牌型。这是斗地主最核心的函数。
 *
 * 算法：
 *   1. 按点数分组 → groupByRank
 *   2. 统计分布 → countDistribution
 *   3. 依次尝试匹配 15 种牌型（从特殊到普通）
 *
 * @param cards - 要识别的牌（1~20 张）
 * @returns { type: 牌型名, mainRank: 主要点数 } 或 null（非法牌型）
 *
 * mainRank 的含义：
 *   - 单张/对子/三张/炸弹 → 该点数
 *   - 顺子/连对/飞机 → 最大点数
 *   - 三带一/三带二 → 三张的点数
 *   - 王炸 → 17（大王的值）
 *
 * 调用处：
 *   - rules.ts → isValidPlay() 校验出牌是否合法
 *   - 本文件 → canBeat() 内部比较
 */
export function getHandType(cards: Card[]): { type: HandType; mainRank: number } | null {
  if (cards.length === 0) return null

  const groups = groupByRank(cards)
  const dist = countDistribution(groups)

  // ─── 王炸（火箭）：大王 + 小王 ───
  // 斗地主中最大的牌型，压过一切。必须恰好是大王和小王各一张。
  if (cards.length === 2) {
    const ranks = Array.from(groups.keys()).sort()
    if (ranks.length === 2 && ranks[0] === 16 && ranks[1] === 17) {
      return { type: 'rocket', mainRank: 17 }
    }
  }

  // ─── 单张 ───
  if (cards.length === 1) {
    return { type: 'single', mainRank: landlordRank(cards[0]) }
  }

  // ─── 对子：两张同点数 ───
  if (cards.length === 2 && groups.size === 1) {
    const rank = Array.from(groups.keys())[0]
    return { type: 'pair', mainRank: rank }
  }

  // ─── 三张：三张同点数 ───
  if (cards.length === 3 && groups.size === 1) {
    const rank = Array.from(groups.keys())[0]
    return { type: 'triple', mainRank: rank }
  }

  // ─── 炸弹：四张同点数 ───
  // 仅次于王炸的牌型，可以压过任何非炸弹牌。
  if (cards.length === 4 && groups.size === 1) {
    const rank = Array.from(groups.keys())[0]
    return { type: 'bomb', mainRank: rank }
  }

  // ─── 三带一：三张同点 + 一张单牌 ───
  // 例：333+5 → { type: 'triple_one', mainRank: 3 }
  if (cards.length === 4) {
    const threes = dist.get(3)
    const ones = dist.get(1)
    if (threes && threes.length === 1 && ones && ones.length === 1) {
      return { type: 'triple_one', mainRank: threes[0] }
    }
  }

  // ─── 三带二：三张同点 + 一个对子 ───
  // 例：333+55 → { type: 'triple_two', mainRank: 3 }
  if (cards.length === 5) {
    const threes = dist.get(3)
    const twos = dist.get(2)
    if (threes && threes.length === 1 && twos && twos.length === 1) {
      return { type: 'triple_two', mainRank: threes[0] }
    }
  }

  // ─── 顺子：5+ 张连续单牌（3~A 范围内） ───
  // 例：34567 → { type: 'straight', mainRank: 7 }
  // 注意：groups.size === cards.length 确保每种点数恰好一张
  if (cards.length >= 5 && groups.size === cards.length) {
    const ranks = Array.from(groups.keys())
    if (isConsecutive(ranks, 3, 14)) {
      return { type: 'straight', mainRank: Math.max(...ranks) }
    }
  }

  // ─── 连对：3+ 对连续对子 ───
  // 例：334455 → { type: 'double_straight', mainRank: 5 }
  if (cards.length >= 6 && cards.length % 2 === 0) {
    const twos = dist.get(2)
    if (twos && twos.length === cards.length / 2 && twos.length >= 3) {
      if (isConsecutive(twos, 3, 14)) {
        return { type: 'double_straight', mainRank: Math.max(...twos) }
      }
    }
  }

  // ─── 飞机（不带翅膀）：2+ 组连续三张 ───
  // 例：333444 → { type: 'plane', mainRank: 4 }
  if (cards.length >= 6 && cards.length % 3 === 0) {
    const threes = dist.get(3)
    if (threes && threes.length === cards.length / 3 && threes.length >= 2) {
      if (isConsecutive(threes, 3, 14)) {
        return { type: 'plane', mainRank: Math.max(...threes) }
      }
    }
  }

  // ─── 飞机带单牌翅膀 ───
  // 例：333444+56 → { type: 'plane_single', mainRank: 4 }
  // 飞机组数 = 总牌数 / 4（每组三张 + 一张翅膀）
  if (cards.length >= 8 && cards.length % 4 === 0) {
    const threes = dist.get(3)
    const ones = dist.get(1)
    const planeLen = cards.length / 4
    if (threes && threes.length === planeLen && planeLen >= 2) {
      if (isConsecutive(threes, 3, 14)) {
        const oneCount = ones ? ones.length : 0
        if (oneCount === planeLen) {
          return { type: 'plane_single', mainRank: Math.max(...threes) }
        }
      }
    }
  }

  // ─── 飞机带对子翅膀 ───
  // 例：333444+5566 → { type: 'plane_pair', mainRank: 4 }
  if (cards.length >= 10 && cards.length % 5 === 0) {
    const threes = dist.get(3)
    const twos = dist.get(2)
    const planeLen = cards.length / 5
    if (threes && threes.length === planeLen && planeLen >= 2) {
      if (isConsecutive(threes, 3, 14)) {
        const twoCount = twos ? twos.length : 0
        if (twoCount === planeLen) {
          return { type: 'plane_pair', mainRank: Math.max(...threes) }
        }
      }
    }
  }

  // ─── 四带二（两单） ───
  // 例：3333+45 → { type: 'four_two', mainRank: 3 }
  if (cards.length === 6) {
    const fours = dist.get(4)
    if (fours && fours.length === 1) {
      return { type: 'four_two', mainRank: fours[0] }
    }
  }

  // ─── 四带二对 ───
  // 例：3333+4455 → { type: 'four_two_pair', mainRank: 3 }
  if (cards.length === 8) {
    const fours = dist.get(4)
    const twos = dist.get(2)
    if (fours && fours.length === 1 && twos && twos.length === 2) {
      return { type: 'four_two_pair', mainRank: fours[0] }
    }
  }

  // 所有牌型都不匹配 → 非法出牌
  return null
}

/**
 * 比较两手牌的大小（同类型内比较）。
 *
 * 优先级规则（从高到低）：
 *   1. 王炸（rocket）最大
 *   2. 炸弹（bomb）比非炸弹大
 *   3. 同类型比较 mainRank
 *
 * @returns 正数=a>b，负数=a<b，0=相等或不同类型无法比较
 *
 * 注意：这个函数主要用于内部比较，实际出牌校验用 canBeat()。
 */
export function compareHands(a: PlayedCards, b: PlayedCards): number {
  if (a.type === 'rocket') return 1
  if (b.type === 'rocket') return -1
  if (a.type === 'bomb' && b.type !== 'bomb') return 1
  if (b.type === 'bomb' && a.type !== 'bomb') return -1
  if (a.type === b.type) {
    return a.mainRank - b.mainRank
  }
  return 0
}

/**
 * 判断当前出牌能否压过上一手牌。这是出牌校验的核心。
 *
 * 规则：
 *   - previous 为 null → 自由出牌（轮到自己且前面没人出牌），什么牌都能出
 *   - 王炸压一切
 *   - 炸弹压非炸弹
 *   - 同类型中 mainRank 更大的赢
 *
 * @param current  - 本轮要出的牌（已识别牌型）
 * @param previous - 上一手牌（null 表示自由出牌）
 * @returns true 如果 current 能压过 previous
 *
 * 调用处：rules.ts → isValidPlay() 中校验出牌合法性
 */
export function canBeat(current: PlayedCards, previous: PlayedCards | null): boolean {
  if (!previous) return true  // 自由出牌，什么都能出

  // 王炸压一切
  if (current.type === 'rocket') return true

  // 炸弹压非炸弹
  if (current.type === 'bomb' && previous.type !== 'bomb') return true

  // 同类型比较 mainRank
  if (current.type === previous.type) {
    return current.mainRank > previous.mainRank
  }

  // 炸弹对炸弹，比点数
  if (current.type === 'bomb' && previous.type === 'bomb') {
    return current.mainRank > previous.mainRank
  }

  // 不同非炸弹类型不能比较
  return false
}

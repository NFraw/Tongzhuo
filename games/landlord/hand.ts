import type { Card } from '@huiming/core-shared'
import type { HandType, PlayedCards } from './types'

/**
 * 斗地主点数排序值映射
 * Card.value: A=1, 2=2, 3=3, ..., K=13, JOKER=0
 * 斗地主排序: 3=3, 4=4, ..., K=13, A=14, 2=15, 小王=16, 大王=17
 */
export function landlordRank(card: Card): number {
  if (card.suit === 'joker_red') return 17   // 大王
  if (card.suit === 'joker_black') return 16  // 小王
  if (card.rank === 'A') return 14
  if (card.rank === '2') return 15
  return card.value  // 3-13 (3-K) 保持不变
}

/**
 * 将手牌按点数分组，返回 Map<rank, Card[]>
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
 * 统计每种出现次数对应哪些点数，返回 Map<count, number[]>
 */
function countDistribution(groups: Map<number, Card[]>): Map<number, number[]> {
  const dist = new Map<number, number[]>()
  for (const [rank, arr] of groups) {
    const count = arr.length
    const ranks = dist.get(count) || []
    ranks.push(rank)
    dist.set(count, ranks)
  }
  // 排序每个 count 下的 ranks
  for (const ranks of dist.values()) {
    ranks.sort((a, b) => a - b)
  }
  return dist
}

/**
 * 检查一组点数是否构成连续序列（不含 2=15 和王=16,17）
 */
function isConsecutive(ranks: number[], minRank: number = 3, maxRank: number = 14): boolean {
  if (ranks.length < 2) return false
  for (const r of ranks) {
    if (r < minRank || r > maxRank) return false
  }
  const sorted = [...ranks].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false
  }
  return true
}

/**
 * 识别牌型。返回 { type, mainRank } 或 null（非法牌型）
 */
export function getHandType(cards: Card[]): { type: HandType; mainRank: number } | null {
  if (cards.length === 0) return null

  const groups = groupByRank(cards)
  const dist = countDistribution(groups)

  // 王炸：大王 + 小王
  if (cards.length === 2) {
    const ranks = Array.from(groups.keys()).sort()
    if (ranks.length === 2 && ranks[0] === 16 && ranks[1] === 17) {
      return { type: 'rocket', mainRank: 17 }
    }
  }

  // 单张
  if (cards.length === 1) {
    return { type: 'single', mainRank: landlordRank(cards[0]) }
  }

  // 对子
  if (cards.length === 2 && groups.size === 1) {
    const rank = Array.from(groups.keys())[0]
    return { type: 'pair', mainRank: rank }
  }

  // 三张
  if (cards.length === 3 && groups.size === 1) {
    const rank = Array.from(groups.keys())[0]
    return { type: 'triple', mainRank: rank }
  }

  // 炸弹：四张同点数
  if (cards.length === 4 && groups.size === 1) {
    const rank = Array.from(groups.keys())[0]
    return { type: 'bomb', mainRank: rank }
  }

  // 三带一
  if (cards.length === 4) {
    const threes = dist.get(3)
    const ones = dist.get(1)
    if (threes && threes.length === 1 && ones && ones.length === 1) {
      return { type: 'triple_one', mainRank: threes[0] }
    }
  }

  // 三带二
  if (cards.length === 5) {
    const threes = dist.get(3)
    const twos = dist.get(2)
    if (threes && threes.length === 1 && twos && twos.length === 1) {
      return { type: 'triple_two', mainRank: threes[0] }
    }
  }

  // 顺子：5+ 张连续单牌（3-A，不含 2 和王）
  if (cards.length >= 5 && groups.size === cards.length) {
    const ranks = Array.from(groups.keys())
    if (isConsecutive(ranks, 3, 14)) {
      return { type: 'straight', mainRank: Math.max(...ranks) }
    }
  }

  // 连对：3+ 对连续对子
  if (cards.length >= 6 && cards.length % 2 === 0) {
    const twos = dist.get(2)
    if (twos && twos.length === cards.length / 2 && twos.length >= 3) {
      if (isConsecutive(twos, 3, 14)) {
        return { type: 'double_straight', mainRank: Math.max(...twos) }
      }
    }
  }

  // 飞机（不带翅膀）：2+ 组连续三张
  if (cards.length >= 6 && cards.length % 3 === 0) {
    const threes = dist.get(3)
    if (threes && threes.length === cards.length / 3 && threes.length >= 2) {
      if (isConsecutive(threes, 3, 14)) {
        return { type: 'plane', mainRank: Math.max(...threes) }
      }
    }
  }

  // 飞机带单牌翅膀
  if (cards.length >= 8 && cards.length % 4 === 0) {
    const threes = dist.get(3)
    const ones = dist.get(1)
    const planeLen = cards.length / 4
    if (threes && threes.length === planeLen && planeLen >= 2) {
      if (isConsecutive(threes, 3, 14)) {
        // 附属单牌数等于飞机组数
        const oneCount = ones ? ones.length : 0
        if (oneCount === planeLen) {
          return { type: 'plane_single', mainRank: Math.max(...threes) }
        }
      }
    }
  }

  // 飞机带对子翅膀
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

  // 四带二（两单）
  if (cards.length === 6) {
    const fours = dist.get(4)
    if (fours && fours.length === 1) {
      const remaining = cards.length - 4
      if (remaining === 2) {
        return { type: 'four_two', mainRank: fours[0] }
      }
    }
  }

  // 四带二对
  if (cards.length === 8) {
    const fours = dist.get(4)
    const twos = dist.get(2)
    if (fours && fours.length === 1 && twos && twos.length === 2) {
      return { type: 'four_two_pair', mainRank: fours[0] }
    }
  }

  // 三张带单牌（4张但不是三带一的特殊检查已在上面处理）
  // 三张带对子（5张已在上面处理）

  return null
}

/**
 * 比较两手牌大小
 * 返回: 正数=a>b, 负数=a<b, 0=相等
 */
export function compareHands(a: PlayedCards, b: PlayedCards): number {
  // 王炸最大
  if (a.type === 'rocket') return 1
  if (b.type === 'rocket') return -1

  // 炸弹比非炸弹大
  if (a.type === 'bomb' && b.type !== 'bomb') return 1
  if (b.type === 'bomb' && a.type !== 'bomb') return -1

  // 同类型比较主点数
  if (a.type === b.type) {
    return a.mainRank - b.mainRank
  }

  // 都是炸弹，比点数（上面已处理同类型）
  // 不同非炸弹类型不能比较
  return 0
}

/**
 * 判断当前出牌能否压过上一手牌
 * previous 为 null 表示自由出牌
 */
export function canBeat(current: PlayedCards, previous: PlayedCards | null): boolean {
  if (!previous) return true  // 自由出牌

  // 王炸压一切
  if (current.type === 'rocket') return true

  // 炸弹压非炸弹
  if (current.type === 'bomb' && previous.type !== 'bomb') return true

  // 同类型同长度才能比
  if (current.type === previous.type) {
    return current.mainRank > previous.mainRank
  }

  // 炸弹比炸弹
  if (current.type === 'bomb' && previous.type === 'bomb') {
    return current.mainRank > previous.mainRank
  }

  return false
}

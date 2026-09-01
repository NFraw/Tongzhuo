/**
 * card.ts — 扑克牌基础类型与牌组操作
 *
 * 这是所有游戏共用的牌组基础设施。
 * 类比 C++：相当于一个 card.h 头文件，定义了 Card 结构体和通用工具函数。
 *
 * 本平台的三个游戏（斗地主、晦明、nimmt）都使用这里定义的 Card 类型，
 * 但各自通过 DeckConfig 配置不同的牌组（花色数、点数范围、大小王数量）。
 */

/**
 * 标准花色（4 种）。
 * 类比 Java enum：相当于 enum StandardSuit { HEARTS, DIAMONDS, CLUBS, SPADES }
 */
export type StandardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

/**
 * 扩展花色（大小王）。大小王在本系统中用花色而非点数来区分：
 * - joker_red  → 大王（红色，value 更高）
 * - joker_black → 小王（黑色）
 */
export type ExtendedSuit = 'joker_red' | 'joker_black'

/** 所有可能的花色。string 兜底允许游戏自定义花色。 */
export type Suit = StandardSuit | ExtendedSuit | string

/** 标准点数 */
export type StandardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

/**
 * 一张扑克牌。所有游戏共用此结构。
 *
 * @property id        - 全局唯一标识，格式如 'hearts-A'、'joker-0'。
 *                        用于客户端选牌（selectedIds: Set<string>）和服务器校验。
 * @property suit      - 花色
 * @property rank      - 点数（标准牌为 'A'~'K'，王牌为 'JOKER'）
 * @property value     - 数值化的点数，用于排序和比较（A=1, 2=2, ..., K=13, JOKER=0）。
 *                        注意：斗地主中 A=14、2=15 的映射在 hand.ts 的 landlordRank() 中处理，
 *                        这里的 value 是通用的，不针对特定游戏。
 * @property deckIndex - 在原始牌组中的序号（0-based），用于确定性排序和调试。
 */
export interface Card {
  id: string
  suit: Suit
  rank: StandardRank | string
  value: number
  deckIndex: number
}

/**
 * 牌组配置。每个游戏通过此配置定义自己的牌组组成。
 *
 * @property suits   - 使用哪些花色（斗地主用 4 种标准花色，晦明也是 4 种）
 * @property ranks   - 使用哪些点数（斗地主 '3'~'2'，晦明 '1'~'6'，nimmt '1'~'104'）
 * @property jokers  - 大小王数量（0=无王，1=仅大王，2=大小王各一）
 * @property custom  - 自定义牌（如特殊功能牌），大部分游戏不需要
 *
 * 例：斗地主配置 → { suits: ['hearts','diamonds','clubs','spades'],
 *                     ranks: ['3','4',...,'K','A','2'], jokers: 2 }
 */
export interface DeckConfig {
  suits: Suit[]
  ranks: string[]
  jokers: number
  custom?: Card[]
}

/**
 * 根据配置创建一副完整的牌组（未洗牌）。
 *
 * 生成顺序：先按 花色→点数 遍历生成标准牌，再生成大小王，最后追加自定义牌。
 * 每张牌的 deckIndex 按生成顺序递增。
 *
 * @param config - 牌组配置
 * @returns 生成的牌组数组
 *
 * 调用处：
 *   - games/landlord/engine.ts → createLandlordGame() 中创建 54 张斗地主牌组
 *   - games/huiming/engine.ts  → createHuimingBoard() 中创建 26 张晦明牌组
 *   - games/nimmt/plugin.ts    → createInitialState() 中创建 nimmt 牌组
 */
export function createDeck(config: DeckConfig): Card[] {
  const deck: Card[] = []
  let index = 0

  // 生成标准牌：遍历每种花色的每种点数
  for (const suit of config.suits) {
    for (const rank of config.ranks) {
      deck.push({
        id: `${suit}-${rank}`,   // 唯一 ID，如 'hearts-A'
        suit,
        rank,
        value: rankToValue(rank), // 数值化点数（A=1, 2=2, ..., K=13）
        deckIndex: index++,
      })
    }
  }

  // 生成大小王
  for (let i = 0; i < config.jokers; i++) {
    deck.push({
      id: `joker-${i}`,
      suit: i === 0 ? 'joker_red' : 'joker_black',  // 第一张大王，第二张小王
      rank: 'JOKER',
      value: 0,  // 王的通用 value 为 0，具体排序由各游戏自行处理
      deckIndex: index++,
    })
  }

  // 追加自定义牌
  if (config.custom) {
    for (const card of config.custom) {
      deck.push({ ...card, deckIndex: index++ })
    }
  }

  return deck
}

/**
 * Fisher-Yates 洗牌算法。返回洗好的副本，不修改原数组。
 *
 * 算法原理（类比 C++ std::shuffle）：
 *   从最后一张牌开始，每次随机选一张前面的牌与之交换。
 *   时间复杂度 O(n)，空间复杂度 O(n)（因为复制了一份）。
 *
 * @param deck - 原始牌组
 * @returns 洗好的新数组
 *
 * 调用处：各游戏的 engine.ts 中发牌前调用
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck]  // 复制一份，避免修改原数组
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    // ES6 解构交换，等价于 C++ 的 std::swap(arr[i], arr[j])
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 点数到数值的映射（通用版本）。
 * A=1, 2=2, 3=3, ..., K=13, 其他=0。
 *
 * 注意：斗地主中 A 和 2 的排序值不同（A=14, 2=15），这个映射在
 * games/landlord/hand.ts 的 landlordRank() 中单独处理。
 */
function rankToValue(rank: string): number {
  const map: Record<string, number> = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
  }
  return map[rank] ?? 0
}

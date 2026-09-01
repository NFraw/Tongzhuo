/**
 * types.ts — 斗地主类型定义
 *
 * 定义了斗地主游戏的全部数据结构。
 * 分为两大类：
 *   1. LandlordState（服务器端完整状态）— 包含所有玩家的手牌、底牌等私有信息
 *   2. LandlordClientState（客户端视角状态）— 隐藏了其他玩家的手牌，只显示数量
 *
 * 类比 Java：LandlordState 是全量 DTO，LandlordClientState 是脱敏后的 VO。
 *
 * 【如果你想修改游戏规则或新增字段】：
 *   - 在 LandlordState 中加字段 → 修改 engine.ts 初始化
 *   - 在 LandlordClientState 中加字段 → 修改 plugin.ts 的 getClientState()
 *   - 确保 UI 组件（LandlordGame.tsx）读取新字段
 */
import type { Card } from '@huiming/core-shared'

/**
 * 斗地主所有合法牌型。hand.ts 的 getHandType() 返回这些值之一。
 *
 * 对应关系：
 *   single        → 单张（1张）
 *   pair          → 对子（2张同点数）
 *   triple        → 三张（3张同点数）
 *   triple_one    → 三带一（3+1=4张）
 *   triple_two    → 三带二（3+2=5张）
 *   straight      → 顺子（5+张连续单牌，如 34567）
 *   double_straight → 连对（3+对连续对子，如 334455）
 *   plane         → 飞机不带翅膀（2+组连续三张，如 333444）
 *   plane_single  → 飞机带单牌翅膀（如 333444+56）
 *   plane_pair    → 飞机带对子翅膀（如 333444+5566）
 *   four_two      → 四带二单（如 3333+45）
 *   four_two_pair → 四带二对（如 3333+4455）
 *   bomb          → 炸弹（4张同点数，如 3333）
 *   rocket        → 王炸/火箭（大王+小王，最大的牌型）
 */
export type HandType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple_one'
  | 'triple_two'
  | 'straight'
  | 'double_straight'
  | 'plane'
  | 'plane_single'
  | 'plane_pair'
  | 'four_two'
  | 'four_two_pair'
  | 'bomb'
  | 'rocket'

/**
 * 一手已经打出的牌（包含牌型信息）。
 *
 * @property cards    - 具体的牌
 * @property type     - 牌型（由 getHandType 识别）
 * @property mainRank - 主要点数（用于同类型比较大小，通常是最大点数或三张的点数）
 */
export interface PlayedCards {
  cards: Card[]
  type: HandType
  mainRank: number
}

/**
 * 服务器端玩家数据。
 *
 * @property id   - 玩家唯一 ID（稳定 UUID，存于 localStorage）
 * @property hand - 当前手牌（出牌后会减少，地主拿底牌后会增加到 20 张）
 * @property role  - 角色（'landlord'=地主 / 'farmer'=农民 / null=未确定）
 */
export interface LandlordPlayer {
  id: string
  hand: Card[]
  role: 'landlord' | 'farmer' | null
}

/**
 * 斗地主服务器端完整状态。这是整个游戏的"数据库"。
 *
 * 生命周期：createLandlordGame() 创建 → handleEvent() 更新 → checkGameEnd() 判定结束
 *
 * 分为三个子状态：
 *   - players[]    — 3 个玩家的私有数据（手牌、角色）
 *   - bidding      — 叫分阶段的状态
 *   - game         — 出牌阶段的状态
 */
export interface LandlordState {
  /** 3 个玩家（按座位顺序 0/1/2） */
  players: LandlordPlayer[]
  /** 3 张底牌（叫分结束后地主拿走） */
  bottomCards: Card[]
  /** 游戏阶段：叫分 → 出牌 → 结束 */
  currentPhase: 'bidding' | 'playing' | 'ended'
  /** 当前轮到谁（叫分阶段和出牌阶段共用此字段） */
  currentTurn: number
  /** 叫分子状态 */
  bidding: {
    currentBidder: number       // 当前叫分者的座位索引
    highestBid: number           // 当前最高叫分（0~3）
    highestBidder: number        // 最高叫分者的索引（-1=无人叫）
    passCount: number            // 连续不叫的人数
    startBidder: number          // 第一个叫分者（用于判断一轮结束）
    turnsTaken: number           // 本轮已有几人叫过
    bottomRevealed: boolean      // 底牌是否已亮出（明叫阶段亮出）
    round: number                // 叫分轮次（1=盲叫，2=明叫）
    landlordDecidedInRound: number // 地主在哪轮确定的（1 或 2）
  }
  /** 出分子状态 */
  game: {
    landlord: number | null      // 地主的座位索引
    lastPlay: PlayedCards | null  // 上一手出的牌（null=自由出牌）
    lastPlayer: number | null     // 上一个出牌者的索引
    passCount: number            // 连续 pass 次数（2 人 pass 后清空 lastPlay）
    passEvent: number            // pass 事件单调递增计数器（用于客户端播放语音）
    multiplier: number           // 倍数（炸弹×2，火箭×2，可叠加）
    baseScore: number            // 底分（地主叫的分数，1~3）
  }
  /** 获胜者标识：'landlord' 或 'farmer'（两农民算一队），null=未结束 */
  winner: string | null
}

/**
 * 客户端状态（某玩家的视角）。由 plugin.ts 的 getClientState() 生成。
 *
 * 与 LandlordState 的关键区别：
 *   - myHand 只包含当前玩家的手牌（其他玩家看不到）
 *   - otherHandCounts 只显示其他两人的手牌数量
 *   - bottomCards 根据阶段和角色有条件地显示
 *   - playerIds 用于客户端通过 playerNames 映射昵称
 */
export interface LandlordClientState {
  /** 当前玩家在 players 数组中的索引（0/1/2） */
  myPlayerIndex: number
  /** 所有 3 个玩家的 ID（按座位顺序），用于客户端映射昵称 */
  playerIds: string[]
  /** 我的手牌 */
  myHand: Card[]
  /** 另外两个玩家的手牌数量 [左对手, 右对手] */
  otherHandCounts: [number, number]
  /** 底牌（根据阶段和角色可能为空数组） */
  bottomCards: Card[]
  /** 当前阶段 */
  currentPhase: 'bidding' | 'playing' | 'ended'
  /** 当前轮到谁 */
  currentTurn: number
  /** 叫分信息（客户端视角） */
  biddingInfo: {
    highestBid: number           // 当前最高叫分
    highestBidder: number        // 最高叫分者索引
    myTurnToBid: boolean         // 是否轮到我叫分
    lastBid: number | null       // 用于显示（null=无人叫）
    bottomRevealed: boolean      // 底牌是否已亮出
    round: number                // 叫分轮次
  }
  /** 出牌信息 */
  gameInfo: {
    landlord: number | null      // 地主索引
    lastPlay: PlayedCards | null  // 上一手出的牌
    lastPlayer: number | null     // 上一个出牌者索引
    passCount: number            // 连续 pass 次数
    passEvent: number            // pass 事件计数器
    multiplier: number           // 倍数
    baseScore: number            // 底分
  }
  /** 我的角色 */
  myRole: 'landlord' | 'farmer' | null
  /** 获胜者 */
  winner: string | null
}

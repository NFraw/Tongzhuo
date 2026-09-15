/**
 * engine.ts — 牛头人（6 Nimmt!）游戏引擎
 *
 * 负责创建游戏初始状态和执行游戏逻辑操作。
 * 类比 Java：相当于一个 NimmtGameEngine 类。
 *
 * 核心流程：
 *   1. 选牌阶段：每人暗选一张牌
 *   2. 所有人选完后，按点数从小到大依次结算
 *   3. 每张牌放到牌桌 4 行中最合适的一行
 *   4. 如果某行满 5 张，整行被吃掉（牛头数计入得分）
 *   5. 如果某张牌比所有行末尾都小，玩家必须选一行吃掉
 *   6. 10 轮后得分最少者获胜
 *
 * 【如果你想修改游戏参数】：
 *   - TOTAL_CARDS = 104（总牌数）
 *   - HAND_SIZE = 10（每人手牌数）
 *   - cattleHeads()：每张牌的牛头数计算规则
 *   - board 行数在 createNimmtGame 中硬编码为 4
 */
import { shuffleDeck, type Card } from '@tongzhuo/core-shared'
import type { NimmtPlayer, NimmtState, ResolveStep } from './types'

const TOTAL_CARDS = 104
const HAND_SIZE = 10

/**
 * 计算一张牌的牛头数（惩罚点数）。
 *
 * 规则：
 *   - 11 的倍数 → 5 个牛头（如 11, 22, 33, ...）
 *   - 10 的倍数 → 3 个牛头（如 10, 20, 30, ...）
 *   - 5 的倍数  → 2 个牛头（如 5, 15, 25, ...）
 *   - 其他      → 1 个牛头
 *   - 注意：11 的倍数和 10 的倍数可能重叠（如 110，但最大 104 所以不会）
 *
 * @param value - 牌的点数（1~104）
 * @returns 牛头数（1~5）
 *
 * 调用处：本文件内部（resolveIntoRow、chooseRow），以及客户端动画
 */
export function cattleHeads(value: number): number {
  let heads = 0
  if (value % 11 === 0) heads += 5  // 11 的倍数：5 牛头
  if (value % 10 === 0) heads += 3  // 10 的倍数：3 牛头
  else if (value % 5 === 0) heads += 2  // 5 的倍数：2 牛头
  return heads === 0 ? 1 : heads  // 至少 1 牛头
}

/**
 * 构建 104 张牌的有序牌组。
 *
 * 每张牌有唯一 ID（nimmt-1 到 nimmt-104），点数 1~104。
 * 没有花色概念（suit: 'none'），纯靠点数大小比较。
 *
 * 调用处：createNimmtGame()
 */
export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (let i = 1; i <= TOTAL_CARDS; i++) {
    deck.push({ id: `nimmt-${i}`, suit: 'none', rank: String(i), value: i, deckIndex: i - 1 })
  }
  return deck
}

/**
 * 初始化牛头人游戏。
 *
 * 流程：
 *   1. 洗牌
 *   2. 每人发 10 张
 *   3. 牌桌 4 行各放 1 张初始牌
 *
 * @param playerIds - 所有玩家的 playerId 列表
 * @returns 完整的初始 NimmtState
 *
 * 调用处：plugin.ts → createInitialState()
 */
export function createNimmtGame(playerIds: string[]): NimmtState {
  const deck = shuffleDeck(buildDeck())
  const players: NimmtPlayer[] = playerIds.map(id => ({ id, hand: [], score: 0, scorePile: [] }))

  // 发牌：每人 10 张
  for (let i = 0; i < HAND_SIZE; i++) {
    for (const p of players) p.hand.push(deck.pop()!)
  }
  // 牌桌初始：4 行各 1 张
  const board: Card[][] = [[], [], [], []]
  for (let r = 0; r < 4; r++) board[r].push(deck.pop()!)

  return {
    players,
    board,
    phase: 'selecting',
    round: 1,
    committed: playerIds.map(() => null),
    revealQueue: [],
    resolveStep: 0,
    pendingPickup: null,
    pendingCard: null,
    resolveSteps: [],
    lastResolve: null,
    winner: null,
    winnerIndex: null,
  }
}

/**
 * 找到目标行：末尾值最接近但严格小于给定值的行。
 *
 * 算法：扫描 4 行，找到末尾值 < value 且最大的那一行。
 * 如果所有行末尾都 >= value，返回 null（表示需要玩家选行吃掉）。
 *
 * @param board - 牌桌 4 行
 * @param value - 要放置的牌的点数
 * @returns 目标行索引（0~3），或 null
 *
 * 调用处：resolveNext()
 */
export function findTargetRow(board: Card[][], value: number): number | null {
  let bestRow: number | null = null
  let bestEnd = -1
  for (let r = 0; r < board.length; r++) {
    const rowEnd = board[r][board[r].length - 1]?.value
    if (rowEnd !== undefined && rowEnd < value && rowEnd > bestEnd) {
      bestEnd = rowEnd
      bestRow = r
    }
  }
  return bestRow
}

/**
 * 选牌：玩家选择一张牌暗扣。
 *
 * 规则：
 *   - 必须在选牌阶段
 *   - 牌必须在手牌中
 *   - 如果之前已选过一张，旧牌退回手牌
 *   - 所人选完后自动进入结算阶段
 *
 * @param state    - 游戏状态（会被修改）
 * @param playerIdx - 玩家索引
 * @param cardId   - 选的牌的 ID
 * @returns true = 操作成功
 *
 * 调用处：plugin.ts → handleEvent('select')
 */
export function selectCard(state: NimmtState, playerIdx: number, cardId: string): boolean {
  if (state.phase !== 'selecting') return false
  const player = state.players[playerIdx]
  const idx = player.hand.findIndex(c => c.id === cardId)
  if (idx === -1) return false

  // 从手牌移除
  const card = player.hand.splice(idx, 1)[0]
  // 如果之前已选过，旧牌退回手牌（允许换选）
  const prev = state.committed[playerIdx]
  if (prev) player.hand.push(prev)
  state.committed[playerIdx] = card

  // 检查是否所有人都已选
  if (state.committed.every(c => c !== null)) {
    state.phase = 'resolving'
    // 按点数升序排列，从小到大依次结算
    state.revealQueue = state.committed
      .map((c, i) => ({ playerIndex: i, card: c! }))
      .sort((a, b) => a.card.value - b.card.value)
    state.resolveStep = 0
    state.resolveSteps = []
    resolveNext(state)
  }
  return true
}

/**
 * 选行：当某张牌比所有行末尾都小时，玩家必须选择吃掉哪一行。
 *
 * @param state    - 游戏状态（会被修改）
 * @param playerIdx - 需要选行的玩家索引
 * @param rowIndex - 选择的行号（0~3）
 * @returns true = 操作成功
 *
 * 调用处：plugin.ts → handleEvent('chooseRow')
 */
export function chooseRow(state: NimmtState, playerIdx: number, rowIndex: number): boolean {
  if (state.phase !== 'resolving') return false
  if (state.pendingPickup !== playerIdx) return false
  if (rowIndex < 0 || rowIndex >= state.board.length) return false

  const card = state.pendingCard!
  const row = state.board[rowIndex]
  // 计算该行的总牛头数
  const heads = row.reduce((sum, c) => sum + cattleHeads(c.value), 0)
  // 吃掉该行：牛头数计入得分，牌放入得分堆
  state.players[playerIdx].score += heads
  state.players[playerIdx].scorePile.push(...row)
  // 该行只剩刚放的这张牌
  state.board[rowIndex] = [card]
  // 记录结算步骤
  state.resolveSteps.push({ playerIndex: playerIdx, card, placedRow: rowIndex, pickedUpRow: rowIndex, gainedHeads: heads })
  state.pendingPickup = null
  state.pendingCard = null
  state.resolveStep++
  resolveNext(state)
  return true
}

/**
 * 结算队列中的下一张牌。
 *
 * 对于每张牌：
 *   - 找到目标行（末尾最接近且 < 牌值的行）
 *   - 如果找到，放入该行
 *   - 如果没找到（牌值 < 所有行末尾），暂停等待玩家选行
 *
 * @param state - 游戏状态（会被修改）
 *
 * 调用处：selectCard()（开始结算）、chooseRow()（选行后继续）
 */
export function resolveNext(state: NimmtState): void {
  while (state.resolveStep < state.revealQueue.length) {
    const { playerIndex, card } = state.revealQueue[state.resolveStep]
    const rowIndex = findTargetRow(state.board, card.value)
    if (rowIndex === null) {
      // 牌值比所有行末尾都小 → 暂停，等该玩家选行
      state.pendingPickup = playerIndex
      state.pendingCard = card
      return
    }
    resolveIntoRow(state, playerIndex, card, rowIndex)
    state.resolveStep++
  }
  // 所有牌结算完毕 → 结束本回合
  finishRound(state)
}

/**
 * 将一张牌放入指定行。
 *
 * 如果该行已有 5 张牌，先吃掉整行（牛头数计入得分），再放入新牌。
 *
 * @param state       - 游戏状态（会被修改）
 * @param playerIndex - 牌的拥有者
 * @param card        - 要放入的牌
 * @param rowIndex    - 目标行
 */
function resolveIntoRow(state: NimmtState, playerIndex: number, card: Card, rowIndex: number): void {
  const row = state.board[rowIndex]
  let gainedHeads = 0
  let pickedUpRow: number | null = null
  if (row.length >= 5) {
    // 行满 → 吃掉整行
    const taken = row.splice(0, row.length)
    gainedHeads = taken.reduce((sum, c) => sum + cattleHeads(c.value), 0)
    state.players[playerIndex].score += gainedHeads
    state.players[playerIndex].scorePile.push(...taken)
    pickedUpRow = rowIndex
    row.length = 0
  }
  row.push(card)
  state.resolveSteps.push({ playerIndex, card, placedRow: rowIndex, pickedUpRow, gainedHeads })
}

/**
 * 结束当前回合，准备下一轮或结束游戏。
 *
 * 流程：
 *   1. 保存本回合结算步骤（lastResolve，用于客户端动画回放）
 *   2. 清空选牌/结算状态
 *   3. 如果已满 10 轮，计算获胜者；否则进入下一轮选牌
 */
function finishRound(state: NimmtState): void {
  state.lastResolve = state.resolveSteps
  state.resolveSteps = []
  state.committed = state.players.map(() => null)
  state.revealQueue = []
  state.resolveStep = 0
  state.pendingPickup = null
  state.pendingCard = null

  if (state.round >= 10) {
    // 10 轮结束 → 计算获胜者（得分最少）
    const wi = computeWinner(state)
    state.phase = 'ended'
    state.winnerIndex = wi
    state.winner = wi === null ? null : state.players[wi].id
  } else {
    state.round++
    state.phase = 'selecting'
  }
}

/**
 * 计算获胜者：得分最少的玩家。
 * 平局时，得分堆中牌数少的获胜（吃过的牌更少 = 更优）。
 *
 * @returns 获胜者索引，或 null（无玩家）
 */
export function computeWinner(state: NimmtState): number | null {
  if (state.players.length === 0) return null
  let best = 0
  for (let i = 1; i < state.players.length; i++) {
    const cur = state.players[best]
    const cand = state.players[i]
    if (cand.score < cur.score) best = i
    else if (cand.score === cur.score && cand.scorePile.length < cur.scorePile.length) best = i
  }
  return best
}

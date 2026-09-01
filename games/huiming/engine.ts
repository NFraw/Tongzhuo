/**
 * engine.ts — 晦明游戏引擎
 *
 * 负责创建游戏初始状态和执行游戏逻辑操作。
 * 类比 Java：相当于一个 GameEngine 类，包含游戏规则的核心算法。
 *
 * 本文件的函数都是"纯函数"（除了 flipNeighbors 修改 board），
 * 接收状态 → 执行操作 → 返回结果。状态修改由 plugin.ts 统一管理。
 *
 * 【如果你想修改游戏参数】：
 *   - HUIMING_DECK_CONFIG：牌组配置（花色、点数、Joker 数量）
 *   - createHuimingBoard()：棋盘大小（当前 5×5）
 *   - flipNeighbors()：翻开邻居的范围（当前上下左右 4 格）
 */
import { createDeck, shuffleDeck, type Card } from '@huiming/core-shared'
import type { HuimingBoard, HuimingCell, HuimingPlayer, HuimingState } from './types'

/**
 * 晦明牌组配置。
 * 4 花色 × 6 点数 = 24 张 + 1 张 Joker = 25 张，刚好填满 5×5 棋盘。
 *
 * 类比 Java：相当于一个 static final 配置常量。
 */
const HUIMING_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['1', '2', '3', '4', '5', '6'],
  jokers: 1,
}

/**
 * 创建 5×5 棋盘。
 *
 * 流程：
 *   1. 用 createDeck + shuffleDeck 生成 25 张随机牌
 *   2. 按行优先顺序填入 5×5 网格，所有牌背面朝上
 *   3. 找到 Joker，与中心位置 [2][2] 交换（确保 Joker 在棋盘中央）
 *
 * 返回：5×5 的 HuimingBoard 二维数组
 *
 * 调用处：initHuimingGame() → 创建初始棋盘
 */
export function createHuimingBoard(): HuimingBoard {
  const deck = shuffleDeck(createDeck(HUIMING_DECK_CONFIG))
  const board: HuimingBoard = []
  let idx = 0

  for (let r = 0; r < 5; r++) {
    const row: HuimingCell[] = []
    for (let c = 0; c < 5; c++) {
      row.push({ card: deck[idx], faceUp: false })
      idx++
    }
    board.push(row)
  }

  // 把 Joker 放到棋盘中心 [2][2]
  // 策略：扫描找到 Joker，与中心位置交换
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (board[r][c].card?.suit?.toString().startsWith('joker')) {
        const tmp = board[2][2].card
        board[2][2].card = board[r][c].card
        board[r][c].card = tmp
        break
      }
    }
  }

  return board
}

/**
 * 初始化晦明游戏。
 *
 * @param p1 - 玩家 1 的 playerId
 * @param p2 - 玩家 2 的 playerId
 * @returns 完整的初始 HuimingState
 *
 * 初始状态：
 *   - 棋盘 25 张牌全部背面朝上
 *   - 每人 0 张手牌、1 次暗取机会
 *   - 玩家 0 先手，取牌阶段
 *
 * 调用处：plugin.ts → createInitialState()
 */
export function initHuimingGame(p1: string, p2: string): HuimingState {
  return {
    board: createHuimingBoard(),
    players: [
      { id: p1, hand: [], darkPickCharges: 1, canPlace: true },
      { id: p2, hand: [], darkPickCharges: 1, canPlace: true },
    ],
    currentTurn: 0,
    phase: 'taking',
    round: 1,
    winner: null,
    hasTakenThisTurn: false,
  }
}

/**
 * 从棋盘取牌。
 *
 * @param game      - 游戏状态（会被修改）
 * @param playerIdx - 取牌的玩家索引（0 或 1）
 * @param row       - 棋盘行号（0~4）
 * @param col       - 棋盘列号（0~4）
 * @returns { success, reason? } - 是否成功
 *
 * 规则：
 *   - 正面朝上的牌可以直接取
 *   - 背面朝上的牌需要消耗暗取次数（darkPickCharges > 0）
 *   - 取走后格子变为 null（空位）
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function takeCard(
  game: HuimingState, playerIdx: number, row: number, col: number
): { success: boolean; reason?: string } {
  const cell = game.board[row]?.[col]
  if (!cell?.card) return { success: false, reason: '该位置没有牌' }
  // 背面朝上的牌需要消耗暗取次数
  if (!cell.faceUp && game.players[playerIdx].darkPickCharges <= 0) {
    return { success: false, reason: '需要暗取次数' }
  }

  if (!cell.faceUp) game.players[playerIdx].darkPickCharges--
  game.players[playerIdx].hand.push(cell.card)
  cell.card = null  // 格子变空
  return { success: true }
}

/**
 * 翻开指定位置的上下左右邻居。
 *
 * 规则：取走一张牌后，其上下左右 4 个相邻格子的牌翻面
 * （正面→背面，背面→正面）。空格子跳过。
 *
 * 这是晦明的核心机制之一：取牌会改变周围牌的可见性，
 * 创造信息博弈（你知道哪些牌在哪里，但对手不知道）。
 *
 * @param board - 棋盘（会被修改）
 * @param row   - 被取走牌的行号
 * @param col   - 被取走牌的列号
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function flipNeighbors(board: HuimingBoard, row: number, col: number): void {
  // 4 个方向：上、下、左、右
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const r = row + dr, c = col + dc
    // 边界检查 + 跳过空格子
    if (r >= 0 && r < 5 && c >= 0 && c < 5 && board[r][c].card) {
      board[r][c].faceUp = !board[r][c].faceUp
    }
  }
}

/**
 * 检查棋盘是否所有牌都背面朝上（"全暗"事件）。
 *
 * 当所有牌都背面朝上时，双方各获得 1 次额外暗取机会。
 * 这是一个平衡机制：如果一方取了太多明牌，棋盘变暗后对方获得补偿。
 *
 * @param board - 棋盘
 * @returns true = 所有有牌的格子都是背面朝上
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function checkAllFaceDown(board: HuimingBoard): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell.card && cell.faceUp) return false
    }
  }
  return true
}

/**
 * 双方各增加 1 次暗取机会。
 * 由 checkAllFaceDown() 触发。
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function grantDarkPickCharges(game: HuimingState): void {
  game.players[0].darkPickCharges++
  game.players[1].darkPickCharges++
}

/**
 * 将手牌放回棋盘。
 *
 * @param game      - 游戏状态（会被修改）
 * @param playerIdx - 放牌的玩家索引
 * @param cardId    - 要放回的牌的 ID
 * @param row       - 目标行号
 * @param col       - 目标列号
 * @param faceUp    - 放置时是否正面朝上
 * @returns { success, reason? } - 是否成功
 *
 * 规则：
 *   - 目标格子必须是空位
 *   - 玩家必须有放牌机会（canPlace = true）
 *   - 放牌后 canPlace 变为 false（每回合限放一次）
 *
 * 调用处：plugin.ts → handleEvent('place')
 */
export function placeCard(
  game: HuimingState, playerIdx: number, cardId: string, row: number, col: number, faceUp: boolean
): { success: boolean; reason?: string } {
  const player = game.players[playerIdx]
  if (!player.canPlace) return { success: false, reason: '放牌机会已用完' }
  const cell = game.board[row]?.[col]
  if (!cell || cell.card !== null) return { success: false, reason: '不是空位' }
  // 从手牌中找到这张牌
  const idx = player.hand.findIndex(c => c.id === cardId)
  if (idx === -1) return { success: false, reason: '手牌中没有这张牌' }

  // 从手牌移除，放到棋盘上
  const [card] = player.hand.splice(idx, 1)
  cell.card = card
  cell.faceUp = faceUp
  player.canPlace = false  // 本回合不能再放
  return { success: true }
}

/**
 * 统计棋盘上剩余的牌数。
 * 用于判断是否进入续放阶段（所有牌都被取走时）。
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function countRemainingCards(board: HuimingBoard): number {
  let count = 0
  for (const row of board) {
    for (const cell of row) {
      if (cell.card) count++
    }
  }
  return count
}

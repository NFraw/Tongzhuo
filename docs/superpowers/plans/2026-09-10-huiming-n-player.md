# 晦明多人化（2~4 人）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把晦明的引擎/规则/插件/UI 从写死的 2 人泛化为通用 N 人，使 2、3、4 人都能正常开局并完整进行，且 2 人局行为与现状完全一致。

**Architecture:** 保留唯一一套引擎/规则/插件代码（方案 A：就地泛化）。`HuimingState.players` 由二元组改为数组，`currentTurn` 由 `0 | 1` 改为 `number`，回合轮转统一为 `(i + 1) % N`，比大小改为遍历全员取唯一最大者，续放轮支持跳过空手牌玩家。`rules.ts` 不做改动。客户端视图由单个对手改为 `opponents` 数组，UI 渲染 N-1 个对手。

**Tech Stack:** TypeScript、Vitest 3（esbuild 转译，不类型检查）、React 19、npm workspaces monorepo。

**设计文档：** `docs/superpowers/specs/2026-09-10-huiming-4-player-design.md`

---

## 关键约束（务必先读）

1. **类型变更必须原子落地。** `types.ts` 一改，`engine.ts`、`plugin.ts`、`HuimingGame.tsx` 会立刻编译不过；而 vitest 用 esbuild 转译、**不做类型检查**，所以运行时可能表现为 `players.map is not a function` 这类错误，而不是类型报错。因此 Task 1 是一个不可再拆的原子单元，中途不提交，完成后再提交。
2. **根目录 `npm run test` 只跑 core-server 和 huiming**，不跑 landlord / nimmt。要跑单个文件用 `cd games/huiming && npx vitest run <文件>`。
3. **现有 2 人断言一律保留**，只改调用形式（`'p1','p2'` → `['p1','p2']`）。它们是「2 人行为不变」的回归保障。
4. **测试文件里继续沿用 `state as any`**（现有 `plugin.test.ts` 就是这么写的），规避元组下标越界的类型报错。
5. 不要改动 `docs/design.md`、`docs/architecture.md`、`docs/superpowers/*/2026-08-31-*` 这些历史文档/计划，它们是当时的快照。

---

## Task 1: 把引擎泛化为 N 人（原子单元）

这是唯一一个跨文件、必须一起落地的任务。步骤顺序是「先写失败测试 → 再让测试通过」。

**Files:**
- Modify: `games/huiming/types.ts`
- Modify: `games/huiming/engine.ts`
- Modify: `games/huiming/plugin.ts`
- Test: `games/huiming/__tests__/engine.test.ts`（改调用 + 加 4 人断言）
- Test: `games/huiming/__tests__/rules.test.ts`（只改调用）
- Test: `games/huiming/__tests__/plugin.test.ts`（只追加新用例）

- [ ] **Step 1: 先追加 N 人的失败测试**

在 `games/huiming/__tests__/plugin.test.ts` 文件末尾（最后一个 `})` 之后）追加一个新的 describe 块。注意文件顶部已 `import type { GameState } from '@huiming/core-shared'`，新用例统一用 `state as any` 访问内部结构。

```ts
// —— 多人（2~4 人）用例 ——
// 这些用例在「只加人数、规则不变」的前提下，验证引擎能被泛化为 N 人。
function tc(suit: string, rank: string, deckIndex: number) {
  return { id: `${suit}-${rank}`, suit, rank, value: Number(rank) || 1, deckIndex }
}

function handOf(suit: string, n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => tc(suit, String(i + 1), offset + i))
}

/** 铺满棋盘（除指定的空位外），用于测试续放阶段。 */
function fillBoardExcept(g: any, holes: [number, number][]) {
  const holeSet = new Set(holes.map(([r, c]) => `${r},${c}`))
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      g.board[r][c].card = holeSet.has(`${r},${c}`)
        ? null
        : tc('hearts', '1', 0)
      g.board[r][c].faceUp = false
    }
  }
}

describe('huimingServerPlugin multi-player', () => {
  it('initializes four players instead of dropping the extras', () => {
    const state = huimingServerPlugin.createInitialState(['p1', 'p2', 'p3', 'p4'])
    const g = state as any
    expect(g.players).toHaveLength(4)
    expect(g.players.map((p: any) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(g.currentTurn).toBe(0)
  })

  it('rotates the turn through all four players', () => {
    const state = huimingServerPlugin.createInitialState(['p1', 'p2', 'p3', 'p4'])
    const g = state as any
    // 四个角互不翻面，因此可以各自当作一次取牌的目标
    const corners: [number, number][] = [[0, 0], [0, 4], [4, 0], [4, 4]]
    const ids = ['p1', 'p2', 'p3', 'p4']
    const turnsAfter: number[] = []
    for (let i = 0; i < ids.length; i++) {
      const [r, c] = corners[i]
      g.board[r][c].faceUp = true
      const res = huimingServerPlugin.handleEvent(state, ids[i], 'take', { row: r, col: c })
      expect(res.error).toBeUndefined()
      expect(res.state.players[i].hand).toHaveLength(1)
      turnsAfter.push(res.state.currentTurn)
    }
    expect(turnsAfter).toEqual([1, 2, 3, 0])
  })

  it('declares the unique max-suit holder the winner when the board is emptied', () => {
    const state = huimingServerPlugin.createInitialState(['p1', 'p2', 'p3', 'p4'])
    const g = state as any
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) g.board[r][c].card = null
    g.board[0][0].card = tc('spades', '1', 0)
    g.board[0][0].faceUp = true
    g.players[0].hand = handOf('hearts', 3, 0)   // 取走 spades 后：hearts 3 → 唯一最大
    g.players[1].hand = handOf('clubs', 2, 10)
    g.players[2].hand = handOf('diamonds', 2, 20)
    g.players[3].hand = handOf('spades', 2, 30)
    g.players[0].darkPickCharges = 1
    g.phase = 'taking'
    g.currentTurn = 0

    const res = huimingServerPlugin.handleEvent(state, 'p1', 'take', { row: 0, col: 0 })
    expect(res.error).toBeUndefined()
    expect(res.state.winner).toBe('p1')
    expect(res.state.phase).toBe('ended')
  })

  it('starts a renewal round when the top max-suit count is tied', () => {
    const state = huimingServerPlugin.createInitialState(['p1', 'p2', 'p3', 'p4'])
    const g = state as any
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) g.board[r][c].card = null
    g.board[0][0].card = tc('spades', '1', 0)
    g.board[0][0].faceUp = true
    g.players[0].hand = handOf('hearts', 2, 0)   // 取走 spades 后：hearts 2 → 2
    g.players[1].hand = handOf('clubs', 2, 10)   // 2
    g.players[2].hand = handOf('diamonds', 2, 20) // 2
    g.players[3].hand = handOf('spades', 2, 30)  // 2
    g.players[0].darkPickCharges = 1
    g.phase = 'taking'
    g.currentTurn = 0

    const res = huimingServerPlugin.handleEvent(state, 'p1', 'take', { row: 0, col: 0 })
    expect(res.error).toBeUndefined()
    expect(res.state.phase).toBe('placing')
    expect(res.state.round).toBe(2)
    expect(res.state.currentTurn).toBe(1) // 最后取牌者(0)的下一位
    expect(res.state.players.every((p: any) => p.canPlace)).toBe(true)
  })

  it('skips players with empty hands during the renewal round', () => {
    const state = huimingServerPlugin.createInitialState(['p1', 'p2', 'p3', 'p4'])
    const g = state as any
    fillBoardExcept(g, [[0, 0], [0, 1]])
    g.players[0].hand = handOf('hearts', 1, 0)
    g.players[1].hand = []
    g.players[2].hand = handOf('clubs', 1, 10)
    g.players[3].hand = []
    g.phase = 'placing'
    g.currentTurn = 0

    // p1 放牌后，应跳过空手牌的 p2，轮到 p3
    let res = huimingServerPlugin.handleEvent(state, 'p1', 'place', { cardId: 'hearts-1', row: 0, col: 0, faceUp: true })
    expect(res.error).toBeUndefined()
    expect(res.state.currentTurn).toBe(2)
    expect(res.state.phase).toBe('placing')

    // p3 放最后一张，棋盘填满 → 回到取牌阶段
    res = huimingServerPlugin.handleEvent(state, 'p3', 'place', { cardId: 'clubs-1', row: 0, col: 1, faceUp: true })
    expect(res.state.phase).toBe('taking')
    expect(res.state.currentTurn).toBe(3) // (2 + 1) % 4
  })

  it('exposes every opponent to a player in a four-player game', () => {
    const state = huimingServerPlugin.createInitialState(['p1', 'p2', 'p3', 'p4'])
    const g = state as any
    g.players[1].hand = handOf('hearts', 3, 0)
    g.players[2].hand = handOf('clubs', 1, 10)
    g.players[3].hand = handOf('spades', 2, 20)

    const cs = huimingServerPlugin.getClientState(state, 'p2')
    expect(cs.myPlayerIndex).toBe(1)
    expect(cs.opponents.map(o => o.index)).toEqual([0, 2, 3])
    expect(cs.opponents.map(o => o.id)).toEqual(['p1', 'p3', 'p4'])
    expect(cs.opponents.map(o => o.handCount)).toEqual([0, 1, 2])
    // 对手牌面不得泄露
    expect(JSON.stringify(cs.opponents)).not.toContain('hearts')
  })

  it('supports a three-player game end to end', () => {
    const state = huimingServerPlugin.createInitialState(['a', 'b', 'c'])
    const g = state as any
    expect(g.players).toHaveLength(3)
    const corners: [number, number][] = [[0, 0], [0, 4], [4, 0]]
    const ids = ['a', 'b', 'c']
    for (let i = 0; i < ids.length; i++) {
      const [r, c] = corners[i]
      g.board[r][c].faceUp = true
      const res = huimingServerPlugin.handleEvent(state, ids[i], 'take', { row: r, col: c })
      expect(res.error).toBeUndefined()
    }
    expect(g.currentTurn).toBe(0) // 3 人转一圈回到 0
  })
})
```

- [ ] **Step 2: 运行新测试，确认它们失败**

Run: `cd games/huiming && npx vitest run __tests__/plugin.test.ts`

Expected: FAIL。至少 `initializes four players instead of dropping the extras` 会报 `expected length 2`（现在 `initHuimingGame(players[0], players[1])` 只建两个玩家），`exposes every opponent...` 会报 `cs.opponents` 为 `undefined`。

- [ ] **Step 3: 泛化 `types.ts`**

把 `HuimingState.players` 与 `currentTurn` 改掉（约 65-73 行）：

```ts
export interface HuimingState {
  board: HuimingBoard
  players: HuimingPlayer[]
  currentTurn: number
  phase: 'placing' | 'taking' | 'ended'
  round: number
  winner: string | null
  hasTakenThisTurn: boolean
}
```

同时把该接口上方的 `players: 两个玩家的状态，[0] 和 [1]` 注释改成 `players: 所有玩家的状态，下标即座位号`，`currentTurn: 当前轮到哪个玩家（0 或 1）` 改成 `currentTurn: 当前轮到哪个玩家（players 的下标）`。

把 `HuimingClientState` 里的单数对手字段换掉（约 85-110 行）：

```ts
export interface HuimingClientState {
  /** 棋盘视图：faceUp=false 的格子 card=null，仅 exists=true 表示有牌 */
  board: { card: Card | null; faceUp: boolean; exists: boolean }[][]
  /** 我的手牌 */
  myHand: Card[]
  /** 我的剩余暗取次数 */
  myDarkPickCharges: number
  /** 我本回合是否还能放牌 */
  myCanPlace: boolean
  /** 我在 players 里的下标 */
  myPlayerIndex: number
  /** 所有对手（按座位序，不含自己）。只暴露手牌数量，不暴露牌面。 */
  opponents: { index: number; id: string; handCount: number }[]
  /** 当前轮到谁 */
  currentTurn: number
  /** 当前阶段 */
  phase: string
  /** 当前轮次 */
  round: number
  /** 获胜者 ID，null=未结束 */
  winner: string | null
  /** 本回合是否已取牌 */
  hasTakenThisTurn: boolean
}
```

并把文件头部注释里的 `- 2 人对战，25 张牌...` 改成 `- 2~4 人对战，25 张牌...`。

- [ ] **Step 4: 泛化 `engine.ts`**

替换 `initHuimingGame`（86-99 行）：

```ts
/**
 * 初始化晦明游戏。
 *
 * @param players - 所有玩家的 playerId（2~4 人）
 * @returns 完整的初始 HuimingState
 *
 * 初始状态：
 *   - 棋盘 25 张牌全部背面朝上
 *   - 每人 0 张手牌、1 次暗取机会
 *   - 玩家下标 0 先手，取牌阶段
 *
 * 调用处：plugin.ts → createInitialState()
 */
export function initHuimingGame(players: string[]): HuimingState {
  return {
    board: createHuimingBoard(),
    players: players.map(id => ({ id, hand: [], darkPickCharges: 1, canPlace: true })),
    currentTurn: 0,
    phase: 'taking',
    round: 1,
    winner: null,
    hasTakenThisTurn: false,
  }
}
```

替换 `grantDarkPickCharges`（179-188 行）：

```ts
/**
 * 所有玩家各增加 1 次暗取机会。
 * 由 checkAllFaceDown() 触发（规则 2：全暗时所有玩家各获得一次）。
 *
 * 调用处：plugin.ts → handleEvent('take') 和 handleEvent('darkPick')
 */
export function grantDarkPickCharges(game: HuimingState): void {
  for (const player of game.players) player.darkPickCharges++
}
```

把 `takeCard` 的 `@param playerIdx - 取牌的玩家索引（0 或 1）` 注释改成 `（players 的下标）`。

- [ ] **Step 5: 泛化 `plugin.ts`**

替换 `getClientState` 函数体（38-61 行）：

```ts
function getClientState(state: HuimingState, playerId: string): HuimingClientState {
  const idx = state.players.findIndex(p => p.id === playerId)
  const me = state.players[idx]
  return {
    // 棋盘视图：背面朝上的牌隐藏内容
    board: state.board.map(row => row.map(cell => ({
      card: cell.faceUp ? cell.card : null,  // 背面朝上时返回 null
      faceUp: cell.faceUp,
      exists: cell.card !== null,  // 标记是否有牌（客户端用此判断是否可点击）
    }))),
    myHand: me.hand,
    myDarkPickCharges: me.darkPickCharges,
    myCanPlace: me.canPlace,
    myPlayerIndex: idx,
    // 所有对手：只给数量和 id，不给牌面
    opponents: state.players
      .map((p, index) => ({ index, id: p.id, handCount: p.hand.length }))
      .filter(o => o.index !== idx),
    currentTurn: state.currentTurn,
    phase: state.phase,
    round: state.round,
    winner: state.winner,
    hasTakenThisTurn: state.hasTakenThisTurn,
  }
}
```

替换 `createInitialState`（77-79 行）：

```ts
  createInitialState(players: string[]): HuimingState {
    return initHuimingGame(players)
  },
```

在每个 `take` / `darkPick` 分支里，把「取牌 + 翻邻居 + 全暗补偿 + 胜利/比大小/轮转」这段收尾替换为对 `resolveAfterTake(game, playerIdx)` 的调用。`take` 分支（108-151 行）改为：

```ts
      case 'take': {
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = readBoardPosition(payload)
        if (!canTake(game, row, col, playerIdx)) return { state, broadcast, error: '不能取这张牌' }

        // 执行取牌
        takeCard(game, playerIdx, row, col)
        game.hasTakenThisTurn = true
        // 取牌后翻开相邻格子
        flipNeighbors(game.board, row, col)
        // 如果所有牌都背面朝上，所有玩家各获得 1 次暗取机会
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)

        resolveAfterTake(game, playerIdx)
        break
      }
```

`darkPick` 分支（153-190 行）改为：

```ts
      case 'darkPick': {
        // 暗取事件：与 take 流程相同，区别在于 canTake() 的校验规则不同
        // （暗取需要消耗 darkPickCharges，且不能取 Joker）
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = readBoardPosition(payload)
        if (!canTake(game, row, col, playerIdx)) return { state, broadcast, error: '不能取这张牌' }

        takeCard(game, playerIdx, row, col)
        game.hasTakenThisTurn = true
        flipNeighbors(game.board, row, col)
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)

        resolveAfterTake(game, playerIdx)
        break
      }
```

替换 `place` 分支（192-230 行）：

```ts
      case 'place': {
        const { cardId, row, col, faceUp } = readPlacePayload(payload)
        if (game.phase === 'placing') {
          // 续放阶段：所有玩家轮流将手牌放回棋盘，直到棋盘重新填满（规则 8）
          // 续放不受「每回合限放一次」限制
          const p = game.players[playerIdx]
          if (p.hand.length === 0) {
            // 这个玩家没牌可放 → 跳过；若所有人都没牌，续放结束
            const next = findNextPlayerWithCards(game, playerIdx)
            game.currentTurn = next === -1 ? nextIndex(game, playerIdx) : next
            if (next === -1) {
              game.phase = 'taking'
              game.hasTakenThisTurn = false
            }
            break
          }
          p.canPlace = true
          placeCard(game, playerIdx, cardId, row, col, faceUp)
          // 续放期间所有玩家的放牌权限都保持开启
          for (const player of game.players) player.canPlace = true

          const boardFull = !game.board.some(cells => cells.some(cell => !cell.card))
          if (boardFull) {
            // 棋盘填满 → 回到取牌阶段
            game.currentTurn = nextIndex(game, playerIdx)
            game.phase = 'taking'
            game.hasTakenThisTurn = false
          } else {
            const next = findNextPlayerWithCards(game, playerIdx)
            game.currentTurn = next === -1 ? nextIndex(game, playerIdx) : next
            if (next === -1) {
              game.phase = 'taking'
              game.hasTakenThisTurn = false
            }
          }
        } else if (game.phase === 'taking') {
          // 取牌阶段的放牌：必须在取牌之前（规则 6）
          if (game.hasTakenThisTurn) return { state, broadcast, error: '已取牌，本回合不能再放牌（规则：先放牌再拿牌）' }
          if (!canPlace(game, playerIdx)) return { state, broadcast, error: '不能放牌' }
          placeCard(game, playerIdx, cardId, row, col, faceUp)
        }
        break
      }
```

把 `handleEvent` 开头（96-103 行）改为带 `-1` 保护：

```ts
  handleEvent(game: HuimingState, playerId: string, event: string, payload: unknown) {
    const state = game
    const playerIdx = game.players.findIndex(p => p.id === playerId)
    if (playerIdx === -1) return { state, broadcast: [], error: '玩家不在游戏中' }

    // 通用检查：必须轮到你
    if (game.currentTurn !== playerIdx) {
      return { state, broadcast: [], error: '不是你的回合' }
    }
```

在文件末尾（三个 `readXxx` 辅助函数之后）追加三个内部辅助函数：

```ts
/** 环形取下一个座位下标。 */
function nextIndex(game: HuimingState, from: number): number {
  return (from + 1) % game.players.length
}

/**
 * 从 from 的下一位开始环形查找第一个手牌非空的玩家下标。
 * 所有玩家手牌都为空时返回 -1。
 */
function findNextPlayerWithCards(game: HuimingState, from: number): number {
  const playerCount = game.players.length
  for (let step = 1; step <= playerCount; step++) {
    const idx = (from + step) % playerCount
    if (game.players[idx].hand.length > 0) return idx
  }
  return -1
}

/**
 * 取牌后的统一收尾：
 *   1. 取牌者集齐 6 张同花色 → 该玩家获胜，游戏结束
 *   2. 棋盘还有牌 → 轮转下一位
 *   3. 棋盘取空 → 比各玩家的最大花色牌数：
 *        - 唯一最大者获胜
 *        - 并列最大 → 进入续放轮（规则 8），先手为最后取牌者的下一位
 */
function resolveAfterTake(game: HuimingState, playerIdx: number): void {
  if (checkWinner(game.players[playerIdx])) {
    game.phase = 'ended'
    game.winner = game.players[playerIdx].id
    return
  }

  if (countRemainingCards(game.board) > 0) {
    game.currentTurn = nextIndex(game, playerIdx)
    game.hasTakenThisTurn = false
    return
  }

  const scores = game.players.map(p => countMaxSuit(p.hand))
  const best = Math.max(...scores)
  const leaders = game.players.filter((_, i) => scores[i] === best)
  if (leaders.length === 1) {
    game.phase = 'ended'
    game.winner = leaders[0].id
    return
  }

  game.round++
  game.phase = 'placing'
  game.hasTakenThisTurn = false
  game.currentTurn = nextIndex(game, playerIdx)
  for (const player of game.players) player.canPlace = true
}
```

最后把 `handleEvent` 上方的文档注释里 `placing 阶段（续放）：双方轮流放牌回棋盘` 改成 `所有玩家轮流放牌回棋盘`。

- [ ] **Step 6: 更新 `engine.test.ts` 与 `rules.test.ts` 的调用形式**

这两个文件里所有 `initHuimingGame('p1', 'p2')` 改成 `initHuimingGame(['p1', 'p2'])`。

- `engine.test.ts`：11 处（约 30、41、51、57、63、72、86、94、106、114、120 行）
- `rules.test.ts`：15 处（约 9、14、19、23、31、36、44、49、54、62、66、74、81、88、115 行）

可以用这条命令一次性替换，然后人工确认 diff：

```bash
cd games/huiming && sed -i "s/initHuimingGame('p1', 'p2')/initHuimingGame(['p1', 'p2'])/g" __tests__/engine.test.ts __tests__/rules.test.ts
```

同时在 `engine.test.ts` 的 `describe('initHuimingGame')` 里补一条 4 人断言和一条 `grantDarkPickCharges` 断言：

```ts
  it('should initialize any number of players', () => {
    const game = initHuimingGame(['p1', 'p2', 'p3', 'p4'])
    expect(game.players).toHaveLength(4)
    expect(game.players.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(game.currentTurn).toBe(0)
  })
```

并在 `engine.test.ts` 的 import 里确认 `grantDarkPickCharges` 已导入（第 3 行已包含），然后追加：

```ts
describe('grantDarkPickCharges', () => {
  it('should give every player one charge', () => {
    const game = initHuimingGame(['p1', 'p2', 'p3', 'p4'])
    expect(game.players.map(p => p.darkPickCharges)).toEqual([1, 1, 1, 1])
    grantDarkPickCharges(game)
    expect(game.players.map(p => p.darkPickCharges)).toEqual([2, 2, 2, 2])
  })
})
```

- [ ] **Step 7: 跑 huiming 全量测试**

Run: `cd games/huiming && npx vitest run`

Expected: PASS。3 个测试文件全绿，含 Task 1 Step 1 新增的 7 个多用人例。

如果 `keeps placing until ALL cards are back on the board` 或 `skips a player with no cards and keeps placing for the other` 失败，说明续放阶段的推进语义写错了——这两条是 2 人行为的回归线，`findNextPlayerWithCards` 与 `nextIndex` 的组合必须与旧的 `1 - currentTurn` 在 2 人下等价。

- [ ] **Step 8: 类型检查**

Run: `cd client && npx tsc --noEmit`（此时 `HuimingGame.tsx` 还没改，会报 `opponentId` / `opponentHandCount` 不存在——这是预期的，Task 2 修）

Run: `cd server && npx tsc --noEmit`
Expected: 报错应**只**出现在 `games/huiming/ui/HuimingGame.tsx`。如果 server 侧也报错，说明有遗漏的调用点。

- [ ] **Step 9: 提交**

```bash
git add games/huiming/types.ts games/huiming/engine.ts games/huiming/plugin.ts games/huiming/__tests__/engine.test.ts games/huiming/__tests__/rules.test.ts games/huiming/__tests__/plugin.test.ts
git commit -m "feat(huiming): generalize engine, rules and plugin to N players"
```

---

## Task 2: 客户端 UI 支持多个对手

**Files:**
- Modify: `games/huiming/ui/HuimingGame.tsx`
- Modify: `games/huiming/ui/styles.css`

- [ ] **Step 1: 替换 `HuimingGame.tsx` 里的单对手显示**

删掉 `const opponentName = playerNames?.[s.opponentId] ?? '对手'`（第 15 行）。

把 `PlayerInfo` 那块（47-53 行）替换成对手列表：

```tsx
      <div className="huiming-opponents">
        {s.opponents.map(o => (
          <PlayerInfo
            key={o.id}
            label={playerNames?.[o.id] ?? '对手'}
            handCount={o.handCount}
            isTurn={s.currentTurn === o.index}
          />
        ))}
      </div>
```

把胜负文案（95-99 行）替换成：

```tsx
      {s.winner && (
        <div className="huiming-game-over">
          <h2>{s.winner === playerId ? '你赢了！' : `${playerNames?.[s.winner] ?? '对手'} 获胜`}</h2>
        </div>
      )}
```

其余部分（`isMyTurn`、`handleCellClick`、`handleHandClick`、暗取提示、手牌区）不动。

- [ ] **Step 2: 加对手面板样式**

在 `games/huiming/ui/styles.css` 末尾追加：

```css
.huiming-opponents {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding: 8px;
}
```

- [ ] **Step 3: 类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无输出（exit 0）。此前 `opponentId` / `opponentHandCount` 的报错应消失。

- [ ] **Step 4: 提交**

```bash
git add games/huiming/ui/HuimingGame.tsx games/huiming/ui/styles.css
git commit -m "feat(huiming): render all opponents in the client UI"
```

---

## Task 3: 更新规则文档与插件描述

**Files:**
- Modify: `docs/huiming-rules.md`
- Modify: `docs/huiming-rules-en.md`
- Modify: `games/huiming/plugin.ts`
- Modify: `games/huiming/ui/client-plugin.ts`

- [ ] **Step 1: 改两个插件的描述**

`games/huiming/plugin.ts` 与 `games/huiming/ui/client-plugin.ts` 里的 `description` 都从 `'基于25张扑克牌的双人博弈'` 改为 `'基于25张扑克牌的2~4人博弈'`。

- [ ] **Step 2: 改中文规则文档**

`docs/huiming-rules.md` 的改动点：

1. 第 3 行：`一款基于 **25 张扑克牌** 的双人博弈玩法。` → `一款基于 **25 张扑克牌** 的 2~4 人博弈玩法。`
2. 第 9 行：`- **人数**：2 人` → `- **人数**：2~4 人`
3. 规则 2：`双方玩家都将获得一次可以直接取走暗置牌的能力` → `所有玩家都将获得一次可以直接取走暗置牌的能力`
4. 规则 8：`由上一轮的后手方优先，双方轮流将自己的手牌置入场上的空位中` → `由上一轮的后手方（最后取牌者的下一位）优先，所有玩家轮流将自己的手牌置入场上的空位中`
5. 规则 8 结尾：`则比较双方手牌中拥有最多同花色牌的数量，较多者获胜。` → `则比较所有玩家手牌中拥有最多同花色牌的数量，数量唯一最多者获胜；若并列最多，则再进入下一轮。`
6. 提示第 1 条：`因此双方都会获得一次直接取走暗置牌的能力` → `因此所有玩家都会获得一次直接取走暗置牌的能力`
7. 提示最后一条：`双方互相知道对方手中的牌型` → `所有玩家互相知道对方手中的牌型`

- [ ] **Step 3: 改英文规则文档**

`docs/huiming-rules-en.md` 对应位置同步：

1. 第 3 行：`A two-player game based on **25 playing cards**.` → `A 2-4 player game based on **25 playing cards**.`
2. 第 9 行：`- **Players**: 2` → `- **Players**: 2-4`
3. 规则 2：`both players each gain the ability` → `all players each gain the ability`
4. 规则 8：`the player who went second in the previous round starts, and players take turns placing` → `the player who went second in the previous round (the one after whoever took the last card) starts, and all players take turns placing`
5. 规则 8 结尾：`the player with the most cards of a single suit in hand wins.` → `the player with the most cards of a single suit in hand wins; if several players tie for the most, another round begins.`
6. 提示第 1 条：`so both players gain the ability to take a face-down card` → `so all players gain the ability to take a face-down card`
7. 提示最后一条：`both players know each other's hands` → `all players know each other's hands`

- [ ] **Step 4: 全量验证**

Run: `npm run test`
Expected: core-server 20 passed，huiming 45 passed（36 原有 + 9 新增：plugin 7 条 + engine 2 条）。

Run: `cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit`
Expected: 两条都无输出（exit 0）。

Run: `cd games/landlord && npx vitest run && cd ../nimmt && npx vitest run`
Expected: landlord 41 passed，nimmt 12 passed（确认没有波及别的游戏）。

- [ ] **Step 5: 提交**

```bash
git add docs/huiming-rules.md docs/huiming-rules-en.md games/huiming/plugin.ts games/huiming/ui/client-plugin.ts
git commit -m "docs(huiming): document the 2-4 player range and N-player rule clarifications"
```

---

## Task 4: 手动验收（4 人局实机）

自动化测试覆盖不到真实的多人 socket 流程，这一条必须手动做。

**Files:** 无（仅验证）

- [ ] **Step 1: 起开发环境**

Run: `npm run dev`
Expected: server 在 3000、client 在 5173 启动，无报错。

- [ ] **Step 2: 开 4 人局**

用 4 个浏览器窗口（或 1 个普通窗口 + 3 个隐身窗口）分别打开 `http://localhost:5173`，各用不同昵称登录。第一个窗口创建晦明房间，把 `maxPlayers` 选成 4，其余三个加入，四人全部准备后开局。

- [ ] **Step 3: 逐项核对**

- 四人轮流：每次取牌后，回合按 创建者→第二→第三→第四→创建者 的顺序推进，且只有当前回合玩家的操作会被接受（其他人点击应被拒绝或不响应）。
- 非当前回合的玩家点击棋盘，不会改变任何状态。
- 每个玩家都能看到 3 个对手的名字与手牌数量，且看不到对手的具体牌面。
- 有人取牌后，相邻牌的明暗翻转对所有玩家可见（同一张牌在四人的视图里明暗一致）。
- 暗取消耗自己的次数；全暗时四人各加一次（手牌数旁的「暗取」计数应各 +1）。
- 把牌堆取空：若有人最大花色牌数唯一最多 → 该玩家获胜并显示其昵称；若并列最多 → 进入续放轮。
- 续放轮：按顺序轮转，手牌已空的玩家被自动跳过（不会卡住），棋盘填满后回到取牌阶段。
- 全程浏览器控制台无报错。

- [ ] **Step 4: 回归 2 人局**

再开一个 2 人晦明房间，完整打一局，确认与改动前表现一致。

---

## Self-Review 记录

- **Spec 覆盖**：设计文档第 1 节（数据模型）→ Task 1 Step 3；第 2 节（引擎）→ Task 1 Step 4；第 3 节（rules 不改）→ 计划中确实无 rules.ts 改动；第 4 节（插件状态机 / 补全一至三 / 取牌收尾抽取 / 续放跳过）→ Task 1 Step 5；第 5 节（UI）→ Task 2；第 6 节（测试）→ Task 1 Step 1、6；第 7 节（文档）→ Task 3；验收标准 1-3 → Task 1 Step 7/8 与 Task 3 Step 4，第 4 条 → Task 4。
- **类型一致性**：`nextIndex(game, from)`、`findNextPlayerWithCards(game, from)`、`resolveAfterTake(game, playerIdx)`、`opponents[].{index,id,handCount}`、`myPlayerIndex` 在 Task 1 与 Task 2 中命名一致。
- **占位符**：无 TBD / TODO；每个改动步骤都给了完整代码与确切命令。
- **已知未覆盖**：`docs/architecture.md`、`docs/design.md` 里仍描述 `opponentHandCount` 等旧的客户端视图字段。这两份是平台级历史文档、且已有多处与现状不符，本次按设计文档范围不动它们。

# 晦明 — 完整设计与交互文档

> 本文档是整个项目的权威参考，涵盖架构、状态管理、事件协议、游戏规则、交互流程、以及已知设计问题。
> 任何对核心逻辑的修改，都应先对照本文档确认一致性。

---

## 目录

1. [整体架构](#1-整体架构)
2. [数据所有权：谁拥有什么状态](#2-数据所有权谁拥有什么状态)
3. [客户端状态机（AppPhase）](#3-客户端状态机appphase)
4. [Socket 事件协议 —— 完整清单](#4-socket-事件协议--完整清单)
5. [房间生命周期](#5-房间生命周期)
6. [游戏生命周期](#6-游戏生命周期)
7. [晦明游戏规则（完整实现版）](#7-晦明游戏规则完整实现版)
8. [信息隔离机制](#8-信息隔离机制)
9. [插件系统](#9-插件系统)
10. [断线与重连](#10-断线与重连)
11. [状态管理问题诊断与原则](#11-状态管理问题诊断与原则)
12. [关键文件索引](#12-关键文件索引)

---

## 1. 整体架构

```
┌──────────────────────────────────────────────────────────┐
│  客户端（浏览器 / Electron）                              │
│                                                          │
│  App.tsx          ← 所有连接、房间、游戏阶段的调度中心     │
│    ├ useSocket    ← Socket.IO 连接管理                    │
│    ├ useGamePlugin ← 按 gameId 懒加载游戏客户端插件       │
│    └ [Game]Component ← 游戏 UI，只关心自己的 ClientState  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  传输层：Socket.IO（polling 优先，自动升级 websocket）     │
├──────────────────────────────────────────────────────────┤
│  服务端（Node.js + Express + Socket.IO）                  │
│                                                          │
│  socket-framework.ts  ← 事件路由、状态广播、房间事件      │
│    ├ RoomManager      ← 房间/玩家/socket 映射的唯一真相   │
│    ├ PluginLoader     ← 按 gameId 查找 GameServerPlugin  │
│    └ plugin.handleEvent → plugin.getClientState          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  共享层（packages/core/shared/）                          │
│                                                          │
│  card.ts   ← Card / DeckConfig / createDeck / shuffleDeck│
│  room.ts   ← Room / RoomPlayer / RoomSummary 类型        │
│  plugin.ts ← GamePlugin / GameState / ClientState 接口   │
└──────────────────────────────────────────────────────────┘
```

**核心原则：服务器是唯一真相源。客户端是只读视图。**

---

## 2. 数据所有权：谁拥有什么状态

这是理解整个系统最关键的一节。**每一份状态都有且只有一个拥有者**。

### 2.1 服务器独占（客户端永远不维护副本）

| 状态 | 位置 | 说明 |
|------|------|------|
| 游戏完整状态 | `Room.state`（GameState） | 包含双方手牌、所有暗牌内容、回合等 |
| 房间玩家列表 | `Room.players`（RoomPlayer[]） | 包含 ready、connected、socketId |
| 房主 | `Room.hostId` | 转移逻辑在 removePlayer 里 |
| 当前回合 | `game.currentTurn` | 由插件 handleEvent 更新 |
| 游戏阶段 | `game.phase`（placing/taking/ended） | 插件内部状态 |
| 暗取次数 | `game.players[i].darkPickCharges` | 插件内部状态 |
| 房间阶段 | `Room.phase`（waiting/playing/paused/ended） | socket-framework 管理 |

### 2.2 客户端独占（服务器不关心）

| 状态 | 位置 | 说明 |
|------|------|------|
| 当前 UI 阶段 | `phase`（AppPhase） | connect/lobby/room/playing/paused/ended |
| 已选游戏 | `selectedGameId` | 大厅里的下拉框选择 |
| 手动输入的服务器地址 | `serverInput` | 连接界面的输入框 |
| 选中的手牌 | `selectedCard` | HuimingGame 内的本地 UI 状态 |
| 放牌正反面选择 | `placingFaceUp` | HuimingGame 内的本地 UI 状态 |

### 2.3 服务器推送给客户端的（每个玩家一份独立视图）

| 推送事件 | 内容 | 消费方式 |
|----------|------|----------|
| `player:welcome` | `{ playerId, games: string[] }` | 设置 games 列表，进入 lobby |
| `rooms:list` | `RoomSummary[]` | 大厅房间列表 |
| `room:created` | `{ roomId, gameId, hostId, playerList, isHost }` | 进入 room 页 |
| `room:joined` | `{ gameId, playerList, isHost }` | 进入 room 页 |
| `room:updated` | `{ roomId, gameId, playerList, isHost }` | 更新房间页数据 |
| `game:stateUpdate` | `{ state: ClientState, version?, gameId? }` | 设置 gameState，进入 playing |
| `game:error` | `{ reason }` | 显示错误提示 |
| `game:over` | `{ winnerId }` | 进入 ended 页 |
| `game:paused` | `{ reason }` | 进入 paused 页 |
| `game:resumed` | — | 恢复 playing |
| `game:forfeited` | `{ winnerId }` | 进入 ended 页 |
| `room:playerLeft` | `{ playerId, isHost, dissolved }` | 更新房间或返回大厅 |
| `room:error` | `{ reason, code? }` | 显示错误，可能触发 NEED_HELLO 重试 |
| `room:full` | — | 显示"房间已满" |
| `room:notFound` | — | 显示"房间不存在" |

### 2.4 关键原则

```
客户端永远不要自行判断游戏规则。
客户端永远不要维护服务端状态的副本。
客户端只做三件事：
  1. 展示服务器推送的状态
  2. 收集用户操作并发送给服务器
  3. 管理纯 UI 状态（选中哪张手牌、下拉框选了什么）
```

违反这条原则就是前面 Joker 暗取 bug 的根因：客户端试图用 `cell.card`（暗置时为 null）判断 Joker，但这个信息本就不在客户端手里。

---

## 3. 客户端状态机（AppPhase）

客户端的整个 UI 由一个 `phase` 状态机驱动：

```
                  ┌──────────┐
                  │ connect  │  连接界面：输入服务器地址
                  └────┬─────┘
                       │ socket 连接成功 → player:welcome
                       ▼
                  ┌──────────┐
                  │  lobby   │  大厅：游戏选择、创建/加入房间
                  └────┬─────┘
                       │ room:created 或 room:joined
                       ▼
                  ┌──────────┐
                  │   room   │  房间页：玩家列表、准备、开始
                  └────┬─────┘
                       │ game:stateUpdate
                       ▼
                  ┌──────────┐
                  │ playing  │  游戏中：渲染游戏组件
                  └────┬─────┘
                       │ game:paused（对手断线）
                       ▼
                  ┌──────────┐
                  │  paused  │  暂停：等待对手重连
                  └────┬─────┘
                       │ game:resumed 或 game:forfeited
                       ▼
                  ┌──────────┐
                  │  ended   │  结束：显示胜负、再来一局
                  └──────────┘
```

**transition 来源（谁触发每个转换）：**

| 转换 | 触发条件 | 代码位置 |
|------|----------|----------|
| connect → lobby | `player:welcome` 事件 | App.tsx on('player:welcome') |
| lobby → room | `room:created` 或 `room:joined` 事件 | App.tsx on('room:created'/'room:joined') |
| lobby → room | `room:updated` 事件，且当前在 lobby/connect（重连时房间仍在 waiting） | App.tsx on('room:updated') |
| room → playing | `game:stateUpdate` 事件 | App.tsx on('game:stateUpdate') |
| playing → paused | `game:paused` 事件 | App.tsx on('game:paused') |
| playing → ended | `game:over` 事件 | App.tsx on('game:over') |
| paused → playing | `game:resumed` 事件 | App.tsx on('game:resumed') |
| paused → ended | `game:forfeited` 事件 | App.tsx on('game:forfeited') |
| 任意 → lobby | 用户点击"退出房间"/"返回大厅" | handleLeaveRoom |
| 任意 → connect | 用户点击"断开连接" | handleDisconnect |
| ended → lobby | 用户点击"返回大厅" | handleLeaveRoom |
| ended → playing | 用户点击"再来一局" 且所有人同意 | room:againAccepted（间接） |

---

## 4. Socket 事件协议 —— 完整清单

### 4.1 客户端 → 服务端

| 事件 | 载荷 | 触发场景 | 服务端处理 |
|------|------|----------|-----------|
| `player:hello` | `{ playerId: string, name: string }` | socket 连接成功后自动发送（useSocket.ts:79） | 注册玩家、清断线计时器、发送 welcome、检查重连房间 |
| `room:create` | `{ gameId: string, maxPlayers?: number }` | 点击"创建房间" | 验证游戏存在、创建房间、发送 room:created |
| `room:join` | `{ roomId: string }` | 点击房间列表"加入" 或 ?join= URL 自动加入 | 验证房间可用、加入、发送 room:joined + 广播 room:updated |
| `room:ready` | — | 点击"准备/取消准备" | 切换 ready 状态、广播 room:updated |
| `room:start` | — | 房主点击"开始游戏" | 校验（房主 + 全部 ready + 人数够）、初始化游戏、广播 stateUpdate |
| `room:leave` | — | 点击"退出房间" | 移除玩家、可能解散房间、广播 |
| `room:again` | — | 点击"再来一局" | 记录请求、全部同意则重新初始化游戏 |
| `room:update` | — | 重连后请求最新房间状态 | 发送 room:updated |
| `rooms:refresh` | — | 点击"刷新"房间列表 | 发送 rooms:list |
| `game:action` | `{ event: string, payload: any }` | 游戏内操作（取牌、暗取、放牌） | 转发给 plugin.handleEvent，广播 stateUpdate |

### 4.2 服务端 → 客户端

| 事件 | 载荷 | 客户端响应 |
|------|------|-----------|
| `player:welcome` | `{ playerId, games: string[] }` | 设置 games，进入 lobby，执行 pendingRetry |
| `rooms:list` | `RoomSummary[]` | 更新 rooms 列表 |
| `room:created` | `{ roomId, gameId, hostId, playerList, isHost }` | 进入 room 页 |
| `room:joined` | `{ gameId, playerList, isHost, ... }` | 进入 room 页 |
| `room:updated` | `{ roomId, gameId, playerList, isHost }` | 更新房间页数据；如果在 lobby/connect 则跳转 room 页 |
| `room:playerLeft` | `{ playerId, isHost, dissolved }` | dissolved → 回大厅；否则显示提示 |
| `room:againAccepted` | — | （隐式：服务端同时发送新的 stateUpdate） |
| `room:error` | `{ reason, code? }` | code=NEED_HELLO → 重握手 + 重试；否则显示错误 |
| `room:full` | — | 显示"房间已满" |
| `room:notFound` | — | 显示"房间不存在" |
| `game:stateUpdate` | `{ state: ClientState, version?, gameId? }` | 设置 gameState，进入 playing |
| `game:error` | `{ reason }` | 显示错误提示（3秒后消失） |
| `game:over` | `{ winnerId }` | 进入 ended 页 |
| `game:paused` | `{ reason }` | 进入 paused 页 |
| `game:resumed` | — | 恢复 playing |
| `game:forfeited` | `{ winnerId }` | 进入 ended 页 |
| `game:opponentDisconnected` | `{ playerId }` | 服务端内部用，客户端目前无响应 |

### 4.3 NEED_HELLO 重试机制

当服务端因 NAT 隧道重连等原因丢失 socket↔player 映射时，会返回 `room:error { code: 'NEED_HELLO' }`。客户端处理：

```
room:error (NEED_HELLO)
  └→ 重新发送 player:hello
  └→ 在 pendingRetryRef 里保存上一个失败的操作
  └→ player:welcome 到达后自动重试该操作
```

---

## 5. 房间生命周期

### 5.1 房间阶段

```
                  创建
                   │
                   ▼
              ┌──────────┐
   加入 ────> │ waiting  │ <──── 准备/取消准备
              └────┬─────┘
                   │ 房主点击 room:start + 条件满足
                   ▼
              ┌──────────┐
              │ playing  │ ← 游戏进行中
              └────┬─────┘
                   │ 一方断线
                   ▼
              ┌──────────┐
              │  paused  │ ← 等待重连（45秒超时）
              └────┬─────┘
                   │ 重连 / 超时 / 游戏自然结束
                   ▼
              ┌──────────┐
              │  ended   │ ← 显示结果
              └──────────┘
```

### 5.2 开始游戏的条件（服务端 socket-framework.ts:272-316）

```
room:start 前置校验：
  1. 发起者是 room.hostId（房主）
  2. room.phase === 'waiting'
  3. roomManager.isAllReady(room.id) === true
  4. room.players.length >= plugin.minPlayers
全部通过 → room.phase = 'playing', room.state = plugin.createInitialState(...)
```

### 5.3 玩家离开时的处理（socket-framework.ts:390-435）

```
room:leave 处理逻辑：
  ├─ 房间无人 → 删除房间
  ├─ 房主离开 或 游戏已开始 → 解散房间，所有人收到 room:playerLeft { dissolved: true }
  └─ 非房主离开 waiting 房间 → 保活，通知其他人 room:playerLeft { dissolved: false }
```

### 5.4 再来一局（socket-framework.ts:438-481）

```
room:again 处理逻辑：
  ├─ phase 不是 ended → 拒绝
  ├─ 记录请求到 playAgainRequests Map
  └─ 所有玩家都请求了 →
      ├─ 通知 room:againAccepted
      ├─ plugin.createInitialState() 重新初始化
      └─ broadcastState 给所有人
```

---

## 6. 游戏生命周期

### 6.1 状态流转

```
初始化：createInitialState(p1, p2)
  → phase: 'taking', currentTurn: 0, 全场暗牌

游戏进行中：
  玩家操作 → game:action { event, payload }
  → plugin.handleEvent(state, playerId, event, payload)
  → 更新 state
  → broadcastState（每人一份 getClientState 视图）
  → checkGameEnd

结束条件：
  plugin.checkGameEnd() 返回 winnerId（非 null）
  → room.phase = 'ended'
  → 广播 game:over { winnerId }
```

### 6.2 game:action 路由流程（socket-framework.ts:319-387）

```
game:action { event, payload }
  │
  ├─ 验证输入
  ├─ 获取 playerId（通过 socket 映射）
  ├─ 限频（100ms）
  ├─ 查找房间 + 验证 phase === 'playing'
  │
  ├→ plugin.handleEvent(room.state, playerId, event, payload)
  │    ├─ 返回 error → 发 game:error，结束
  │    └─ 返回 { state, broadcast }
  │
  ├→ room.state = result.state（原地更新引用）
  ├→ 广播 result.broadcast 事件
  ├→ broadcastState → 为每人生成 getClientState，发送 game:stateUpdate
  └→ checkGameEnd → 如果有赢家，发送 game:over
```

### 6.3 broadcastState 流程（socket-framework.ts:34-47）

```
broadcastState(room, plugin):
  version++
  for each player in room.players:
    clientState = plugin.getClientState(room.state, player.id)
    socket.emit('game:stateUpdate', { state: clientState, version, gameId })
```

**注意：** version 是单调递增的，客户端的 `stateVersionRef` 会忽略旧版本。

---

## 7. 晦明游戏规则（完整实现版）

基于 README 规则 + 实际代码实现。

### 7.1 牌组

- 红桃、黑桃、方块、梅花各 6 张（1-6），共 24 张
- 1 张 Joker（`joker_red`）
- 共 25 张

### 7.2 开局

- 5×5 网格，所有牌**暗置**（faceUp = false）
- Joker 固定在**正中心 (2,2)**（engine.ts:26-35 将随机位置的 Joker 换到中心）
- 其余 24 张随机排列

### 7.3 游戏阶段

游戏有三个 phase：

```
'taking'   — 主要阶段：取牌和放牌
'placing'  — 续局阶段：所有玩家轮流放牌
'ended'    — 游戏结束
```

### 7.4 核心规则（对应 README 编号）

**规则 1 — 取牌：** 在自己回合内，玩家可以取走一张**明置**牌（faceUp = true）。
```
客户端：cell.faceUp && cell.card → 发送 onAction('take', { row, col })
服务端：canTake() → cell.faceUp === true → 允许
       takeCard() → 从 board 移除，加入手牌
```

**规则 2 — 暗取：** 当场上所有牌都暗置时，双方获得一次暗取能力（darkPickCharges++）。该能力可累计。先手玩家开局必须立即使用（因为全场暗牌、只能暗取）。
```
触发条件：checkAllFaceDown(board) 取牌后自动检查
客户端：!cell.faceUp && cell.exists && darkPickCharges > 0 → 发送 onAction('darkPick', { row, col })
服务端：canTake() → faceUp=false + darkPickCharges > 0 → 允许
```

**规则 3 — Joker：** 明置、暗置都可以被取走；暗置取走时消耗一次暗取能力。Joker 可充当任意花色。
```
服务端：canTake() 不区分是否 Joker，暗置时只看 darkPickCharges > 0
（早期版本曾禁止暗取 Joker，2026-09-10 放开：该禁令会导致棋盘只剩一张
  背面朝上的 Joker 时无人能取、结算永不触发、所有人放牌机会用尽后死锁）
客户端不做此判断（暗牌 card 为 null，看不到是否 Joker），由服务端裁决
```

**规则 4 — 翻牌：** 取走一张牌后，其上下左右相邻的四张牌翻面（明↔暗）。空位跳过。
```
takeCard / darkPick 之后 → flipNeighbors(board, row, col)
  上下左右四格，如果有牌（card !== null）→ faceUp = !faceUp
```

**规则 5 — 回合结束：** 取牌后立即结束回合。
```
take / darkPick → game.hasTakenThisTurn = true → currentTurn 切换
```

**规则 6 — 放牌：** 每局每人**限一次**。可在自己回合将一张手牌放入空位（明暗自选）。**必须先放牌再取牌**。
```
phase='taking' 时：canPlace=true + hasTakenThisTurn=false → 放牌
                   放牌后 canPlace=false，但回合不结束，可以继续取牌
phase='placing'（续局）时：轮流放牌，每回合结束时切换
服务端限制：如果 hasTakenThisTurn=true → 拒绝放牌（"已取牌，本回合不能再放牌"）
```

**规则 7 — 胜利：** 集齐任意花色 6 张牌。
```
checkWinner(player): hand 中某花色数量 + Joker 数量 >= 6 → 获胜
Joker 可充当任意花色，但只算入最多花色的那一种
```

**规则 8 — 平局续局：** 场上牌全部取完（remaining === 0）且无人获胜 → 进入 placing 阶段。
```
board 上无牌 → round++ → phase='placing' → 后手先放 → 轮流放完 → phase='taking'
仍无胜负 → countMaxSuit 比较 → 数多者胜
```

### 7.5 客户端发送的游戏事件

| 事件名 | 载荷 | 对应操作 |
|--------|------|----------|
| `take` | `{ row, col }` | 取走明置牌 |
| `darkPick` | `{ row, col }` | 暗取暗置牌 |
| `place` | `{ cardId, row, col, faceUp }` | 放置手牌到空位 |

---

## 8. 信息隔离机制

### 8.1 原理

服务端维护完整状态 `HuimingState`（包含所有暗牌内容）。每次状态变更后，`getClientState(state, playerId)` 为每个玩家生成**独立视图**。

### 8.2 晦明的具体规则

| 信息 | 可见性 | 实现方式 |
|------|--------|----------|
| 明牌的花色和点数 | ✅ 全员可见 | `cell.faceUp ? cell.card : null` |
| 暗牌的花色和点数 | ❌ 隐藏 | `cell.card = null` |
| 暗牌的存在 | ✅ 全员可见 | `cell.exists = true` |
| 空位 | ✅ 全员可见 | `cell.exists = false` |
| 自己的手牌 | ✅ 完整 | `myHand: me.hand` |
| 对手的手牌内容 | ❌ 隐藏 | 只暴露数量 `opponentHandCount` |
| 暗取获得的牌 | ✅ 只告诉持有者 | 持有者 myHand 含该牌，对手只看到数量变化 |
| 暗取次数 | ✅ 双方可见 | `myDarkPickCharges` |
| Joker 是否在暗置 | ❌ 客户端不知道 | 客户端不应尝试判断 |

### 8.3 关键设计约束

```
客户端的 board 数据结构：
  { card: Card | null, faceUp: boolean, exists: boolean }
  
  - 明牌：card != null, faceUp = true, exists = true
  - 暗牌：card = null, faceUp = false, exists = true  ← 牌面不可见！
  - 空位：card = null, faceUp = false, exists = false

客户端对暗牌唯一能做的操作：提交给服务端（服务端判断是否 Joker、是否有暗取次数等）
客户端永远不要尝试检查暗牌的 card 属性——它永远是 null。
```

---

## 9. 插件系统

### 9.1 接口

```typescript
// 服务端插件
interface GameServerPlugin extends GamePlugin {
  createInitialState(players: string[]): GameState
  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult
  getClientState(state: GameState, playerId: string): ClientState
  checkGameEnd(state: GameState): string | null
}

// 客户端插件
interface GameClientPlugin extends GamePlugin {
  GameComponent: React.ComponentType<GameComponentProps>
}

// 通用属性
interface GamePlugin {
  id: string           // 如 'huiming'
  name: string         // 如 '晦明'
  minPlayers: number   // 如 2
  maxPlayers: number   // 如 2
  deckConfig: DeckConfig
}
```

### 9.2 注册

**服务端**（server/src/index.ts）：启动时传入 plugins 数组，startServer 内部注册到 PluginLoader。

**客户端**（client/src/App.tsx）：`registerClientPluginLoader('huiming', () => import('huiming/ui/client-plugin'))` —— 懒加载。进入 playing 阶段时 `useGamePlugin(gameId)` 触发加载。

### 9.3 EventResult

```typescript
interface EventResult {
  state: GameState                  // 更新后的游戏状态（原地修改引用）
  broadcast?: BroadcastMessage[]    // 可选的额外广播事件
  error?: string                    // 非空表示操作失败
  checkEndNow?: boolean             // false 跳过结束检查（默认 true）
}
```

当前晦明插件的 handleEvent 没有使用 broadcast 数组（状态全靠 broadcastState 传播），但框架支持。

---

## 10. 断线与重连

### 10.1 断线检测（服务端 disconnect 事件）

```
socket disconnect:
  ├→ roomManager.disconnectPlayer(playerId)   — 标记 connected=false，清除 socket 映射
  ├→ 通知对手 game:opponentDisconnected
  └→ 如果 room.phase === 'playing':
       ├→ room.phase = 'paused'
       ├→ 通知对手 game:paused
       └→ 启动 45 秒断线计时器
            └→ 超时后：room.phase = 'ended'，对手获胜 game:forfeited
```

### 10.2 重连流程

```
玩家重新连接 socket:
  │
  ├→ send player:hello
  │
  ├→ roomManager.updateSocket(playerId, newSocketId)  — 更新映射
  ├→ 清除断线计时器
  ├→ 发送 player:welcome + rooms:list
  │
  ├→ 如果玩家在某个房间中（findRoomByPlayer）:
  │    ├→ socket.join(room.id)
  │    ├→ 如果 phase === 'paused':
  │    │    ├→ phase = 'playing'
  │    │    └→ 通知对手 game:resumed
  │    │
  │    ├→ 如果 room.state 存在（游戏中）:
  │    │    └→ 发送 game:stateUpdate（含 gameId）
  │    └→ 如果 phase === 'waiting':
  │         └→ 发送 room:updated（房间详情）
  │
  └→ 如果玩家不在房间：正常进入大厅
```

### 10.3 自动连接（客户端）

```typescript
// App.tsx 首次加载时：
//   - 如果 origin 是 http(s)（生产/开发服务器）→ 自动连接该 origin
//   - 如果是 file://（桌面端）→ 停在连接界面

// URL 含 ?join=roomId → lobby 阶段自动发送 room:join
```

---

## 11. 状态管理问题诊断与原则

### 11.1 已出现的问题模式

**问题 1：客户端试图用自己没有的信息做判断**

Joker 暗取 bug 的本质：
```
客户端代码：cell.card && !cell.card.suit.startsWith('joker')
实际情况：  cell.card === null（暗置牌牌面被 getClientState 隐藏）
结果：      条件恒 false → 所有暗取操作失效
正确做法：  客户端允许提交任何暗牌，服务端 canTake() 负责拒绝 Joker
```

**教训：客户端永远不要基于隐藏信息做游戏逻辑判断。**

**问题 2：客户端维护服务端状态的副本**

App.tsx 中的 `isHost`、`roomPlayers`、`roomId`、`currentGameId` 都是从服务端推送事件中逐步拼凑出来的。如果某个事件漏发或时序不对，这些副本就会和服务器不一致。

**问题 3：phase 转换散布在多个事件处理器里**

`setPhase('room')` 出现在 `room:created`、`room:joined`、`room:updated`（条件判断）三处。`setPhase('playing')` 出现在 `game:stateUpdate` 和 `game:resumed` 两处。修改一处很容易漏掉另一处。

### 11.2 设计原则（后续开发必须遵守）

```
原则 1 — 服务端裁决
  游戏规则、胜负判定、合法操作校验 → 全部在服务端 plugin.handleEvent / canTake / canPlace 里完成。
  客户端只收集用户意图（点击了哪张牌），不做预判。
  如果操作非法，服务端返回 error，客户端显示提示。
  
原则 2 — 服务器推送是唯一更新通道
  客户端状态的变更只来自 socket 事件处理器。
  客户端永远不自行修改 game phase / room phase / player list。
  
原则 3 — UI 状态和服务器状态分离
  AppPhase（connect/lobby/room/playing/paused/ended）是纯 UI 调度。
  Room.phase / game.phase 是服务器内部状态，客户端不直接访问。
  
原则 4 — 游戏组件只关心 ClientState
  HuimingGame / HuimingBoard 只接收 ClientState，不知道 GameState 的存在。
  它们调用 onAction(event, payload) 提交操作，由框架转发给服务端。
```

### 11.3 客户端状态清理清单

App.tsx 中应由服务器事件维护的客户端状态：

| 状态 | 唯一写入来源 | 不应被其他地方修改 |
|------|-------------|-------------------|
| `games` | player:welcome | — |
| `rooms` | rooms:list | — |
| `roomId` | room:created, room:joined, room:updated | handleLeaveRoom（清空） |
| `currentGameId` | room:created, room:joined, room:updated, game:stateUpdate | handleLeaveRoom（清空） |
| `roomPlayers` | room:created, room:joined, room:updated | — |
| `isHost` | room:created, room:joined, room:updated | — |
| `gameState` | game:stateUpdate | handleLeaveRoom（清空） |
| `winnerId` | game:over, game:forfeited | handleLeaveRoom（清空） |
| `phase` | 各事件处理器（见状态机表） | handleLeaveRoom → lobby, handleDisconnect → connect |

---

## 12. 关键文件索引

### 共享层（packages/core/shared/）

| 文件 | 职责 |
|------|------|
| `card.ts` | Card 类型、DeckConfig、createDeck、shuffleDeck |
| `room.ts` | Room / RoomPlayer / RoomSummary / RoomPhase 类型定义 |
| `plugin.ts` | GamePlugin / GameServerPlugin / GameClientPlugin 接口、GameState / ClientState 类型 |

### 服务端框架（packages/core/server/）

| 文件 | 职责 |
|------|------|
| `room-manager.ts` | 房间 CRUD、玩家↔房间↔socket 三向映射、ready/host 管理 |
| `plugin-loader.ts` | 服务端插件注册/查找 |
| `socket-framework.ts` | 所有 socket 事件的注册与路由、状态广播、断线处理 |
| `start-server.ts` | Express + Socket.IO 启动、静态文件托管 |

### 客户端框架（packages/core/client/）

| 文件 | 职责 |
|------|------|
| `hooks/useSocket.ts` | Socket.IO 连接管理、player:hello 自动发送、NEED_HELLO 重试 |
| `hooks/useGamePlugin.ts` | 按 gameId 懒加载客户端游戏插件 |
| `components/PlayingCard.tsx` | 单张扑克牌渲染（正面/背面/空位/交互/高亮） |
| `components/CardGrid.tsx` | M×N 牌面网格，支持动态交互/高亮判断 |
| `components/CardHand.tsx` | 手牌区组件 |
| `components/PlayerInfo.tsx` | 玩家信息栏 |

### 晦明游戏（games/huiming/）

| 文件 | 职责 |
|------|------|
| `types.ts` | HuimingState / HuimingClientState / HuimingPlayer / HuimingBoard 类型 |
| `engine.ts` | 纯函数状态机：initHuimingGame、takeCard、flipNeighbors、placeCard、checkAllFaceDown、grantDarkPickCharges |
| `rules.ts` | 纯函数规则校验：canTake、canPlace、canDarkPick、checkWinner、countMaxSuit |
| `plugin.ts` | 服务端插件：createInitialState、handleEvent（take/darkPick/place 路由）、getClientState（信息隔离）、checkGameEnd |
| `ui/client-plugin.ts` | 客户端插件定义 |
| `ui/HuimingGame.tsx` | 游戏主界面：回合判断、手牌选择、取牌/暗取/放牌触发、明暗选择 |
| `ui/HuimingBoard.tsx` | 5×5 牌面网格：交互模式判断（明牌可取、暗牌可暗取、空位可放） |

### 应用层

| 文件 | 职责 |
|------|------|
| `client/src/App.tsx` | 全局状态管理、阶段调度、所有 socket 事件监听、大厅/房间/游戏 UI |
| `server/src/index.ts` | 服务器入口：启动、注册插件 |
| `client/src/styles/app.css` | 全局样式 |
| `games/huiming/ui/styles.css` | 晦明游戏特有样式 |

---

## 附录 A：socket 消息载荷完整类型

```typescript
// client → server
player:hello    { playerId: string, name: string }
room:create     { gameId: string, maxPlayers?: number }
room:join       { roomId: string }
room:ready      // 无载荷
room:start      // 无载荷
room:leave      // 无载荷
room:again      // 无载荷
room:update     // 无载荷
rooms:refresh   // 无载荷
game:action     { event: 'take'|'darkPick'|'place', payload: any }

// server → client
player:welcome    { playerId: string, games: string[] }
rooms:list        RoomSummary[]
room:created      { roomId, gameId, hostId, playerList: RoomPlayerSummary[], isHost: boolean }
room:joined       { gameId, playerList: RoomPlayerSummary[], isHost: boolean, roomId, hostId, maxPlayers, phase }
room:updated      { roomId, gameId, playerList: RoomPlayerSummary[], isHost: boolean, hostId, maxPlayers, phase }
room:playerLeft   { playerId: string, isHost: boolean, dissolved?: boolean }
room:againAccepted // 无载荷
room:error        { reason: string, code?: 'NEED_HELLO', socketId?: string }
room:full         // 无载荷
room:notFound     // 无载荷
game:stateUpdate  { state: ClientState, version?: number, gameId?: string }
game:error        { reason: string }
game:over         { winnerId: string }
game:paused       { reason: string }
game:resumed      // 无载荷
game:forfeited    { winnerId: string }
game:opponentDisconnected { playerId: string }
```

## 附录 B：晦明 ClientState 完整字段

```typescript
interface HuimingClientState {
  board: {
    card: Card | null       // 明牌有值，暗牌为 null
    faceUp: boolean
    exists: boolean         // true=有牌（明或暗），false=空位
  }[][]
  myHand: Card[]            // 自己的手牌（完整暴露）
  opponentHandCount: number // 对手手牌数量
  myDarkPickCharges: number // 剩余暗取次数
  myCanPlace: boolean       // 是否还有放牌机会
  myPlayerIndex: 0 | 1      // 自己是第几号玩家
  currentTurn: 0 | 1        // 当前轮到谁
  phase: string             // 'taking' | 'placing' | 'ended'
  round: number             // 当前轮次
  winner: string | null     // 赢家 playerId
  hasTakenThisTurn: boolean // 本回合是否已取牌
}
```

## 附录 C：晦明游戏状态完整字段（服务端 HuimingState）

```typescript
interface HuimingState {
  board: {
    card: Card | null       // 完整牌面信息
    faceUp: boolean
  }[][]
  players: [
    {
      id: string
      hand: Card[]
      darkPickCharges: number  // 初始 1，checkAllFaceDown 后 +1
      canPlace: boolean        // 初始 true，放牌后 false，续局重置
    },
    { /* 同上 */ }
  ]
  currentTurn: 0 | 1          // 初始 0（先手）
  phase: 'taking' | 'placing' | 'ended'
  round: number                // 初始 1，续局时 +1
  winner: string | null        // 赢家 playerId
  hasTakenThisTurn: boolean    // 用于 enforce "先放牌再取牌"
}
```

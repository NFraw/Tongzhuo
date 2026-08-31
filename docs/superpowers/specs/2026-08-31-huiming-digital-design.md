# 通用卡牌联机平台 + 晦明游戏 — 设计规格

> 可插拔的卡牌游戏联机平台，首个游戏为晦明

## 1. 概述

构建一个通用卡牌游戏联机平台（基座），支持通过插件机制接入不同卡牌游戏。首个游戏插件为晦明（Huì Míng）—— 一款基于 25 张扑克牌的双人策略博弈。

后续可通过相同接口接入斗地主、德州扑克等其他卡牌游戏。

## 2. 目标与范围

### 2.1 平台基座能力

- 通用扑克牌定义（标准 52 张 + Joker/大小王可扩展）
- 通用房间管理（创建/加入/匹配，游戏无关）
- 通用卡牌渲染组件（牌面、手牌区、网格、玩家信息）
- 通用动画系统（翻牌、发牌、出牌动画）
- 插件注册机制（游戏规则/事件/UI 以插件形式注册）
- Socket.IO 通信框架（游戏无关的消息路由）

### 2.2 晦明游戏插件

- 完整游戏规则实现（取牌、翻牌、暗取、放牌、续局）
- 经典卡牌风格 UI（2.5D 效果）
- 房间链接匹配

### 2.3 非目标（MVP 不包含）

- AI 对手
- 随机匹配 / 用户系统
- 移动端适配
- 游戏录像 / 回放
- 排行榜
- 斗地主等其他游戏（仅预留接口）

## 3. 技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端框架 | Vite + React + TypeScript |
| 状态管理 | Zustand |
| 后端 | Node.js + Express + Socket.IO |
| 测试 | Vitest |
| 部署 | 本地服务器 + 樱花穿透 |

## 4. 项目结构

```
huiming/
├── package.json                    # 根 monorepo
├── tsconfig.json
├── packages/
│   └── core/                       # 基座层
│       ├── shared/
│       │   ├── card.ts             # 通用牌组类型
│       │   ├── room.ts             # 房间类型
│       │   ├── plugin.ts           # 插件接口定义
│       │   └── index.ts
│       ├── server/
│       │   ├── room-manager.ts     # 通用房间管理器
│       │   ├── plugin-loader.ts    # 插件加载器
│       │   ├── socket-framework.ts # Socket.IO 框架
│       │   ├── __tests__/
│       │   │   ├── room-manager.test.ts
│       │   │   └── plugin-loader.test.ts
│       │   └── index.ts            # 服务器入口
│       └── client/
│           ├── components/
│           │   ├── PlayingCard.tsx  # 通用扑克牌渲染
│           │   ├── CardHand.tsx     # 手牌区
│           │   ├── CardGrid.tsx     # 可配置网格
│           │   ├── PlayerInfo.tsx   # 玩家信息栏
│           │   └── GameRoom.tsx     # 房间容器
│           ├── hooks/
│           │   ├── useSocket.ts
│           │   └── useGamePlugin.ts
│           ├── animations/
│           │   └── card-animations.ts
│           └── assets/
│               └── cards/           # 标准扑克牌素材
├── games/
│   └── huiming/                     # 晦明游戏插件
│       ├── plugin.ts               # 插件注册入口
│       ├── types.ts                # 晦明专用类型
│       ├── engine.ts               # 状态机
│       ├── rules.ts                # 规则校验
│       ├── events.ts               # Socket 事件处理
│       ├── __tests__/
│       │   ├── engine.test.ts
│       │   └── rules.test.ts
│       ├── ui/
│       │   ├── HuimingBoard.tsx    # 5×5 牌面
│       │   ├── HuimingGame.tsx     # 游戏主界面
│       │   └── styles.css
│       └── assets/                 # 晦明特有素材
├── assets/                          # 原始牌面素材
└── server/                          # 实际部署入口
    └── index.ts                     # 加载 core + 注册插件
```

## 5. 核心类型定义

### 5.1 通用牌组（packages/core/shared/card.ts）

```typescript
// 标准花色
type StandardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

// 扩展花色（大小王等）
type ExtendedSuit = 'joker_red' | 'joker_black'

// 游戏可自定义花色
type Suit = StandardSuit | ExtendedSuit | string

// 标准点数
type StandardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

interface Card {
  id: string           // 唯一标识，如 "hearts-A"
  suit: Suit
  rank: StandardRank | string
  value: number        // 数值权重（用于比较）
  deckIndex: number    // 在牌组中的位置
}

// 牌组配置 — 每个游戏定义自己需要的牌
interface DeckConfig {
  suits: Suit[]
  ranks: string[]
  jokers: number       // 0, 1, or 2
  custom?: Card[]      // 自定义牌（如特殊牌）
}
```

### 5.2 插件接口（packages/core/shared/plugin.ts）

```typescript
interface GamePlugin {
  id: string                    // "huiming" | "doudizhu"
  name: string                  // 显示名称
  description: string
  minPlayers: number
  maxPlayers: number
  deckConfig: DeckConfig
}

interface GameServerPlugin extends GamePlugin {
  // 创建初始游戏状态
  createInitialState(players: string[]): GameState
  // 处理游戏事件（返回新状态 + 需要广播的事件）
  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult
  // 为指定玩家生成可见状态（信息隔离）
  getClientState(state: GameState, playerId: string): ClientState
  // 检查游戏是否结束，返回赢家 ID 或 null
  checkGameEnd(state: GameState): string | null
}

interface GameClientPlugin extends GamePlugin {
  // 游戏主界面组件
  GameComponent: React.ComponentType<GameComponentProps>
  // 可选：游戏特有材质
  assets?: Record<string, string>
}

interface EventResult {
  state: GameState
  broadcast: { event: string; data: any }[]
  error?: string
}
```

### 5.3 房间类型（packages/core/shared/room.ts）

```typescript
interface Room {
  id: string
  gameId: string        // 使用的游戏插件 ID
  players: string[]     // socket IDs
  state: GameState | null
  maxPlayers: number
  phase: 'waiting' | 'playing' | 'ended'
}
```

### 5.4 晦明游戏类型（games/huiming/types.ts）

```typescript
type HuimingSuit = 'hearts' | 'spades' | 'diamonds' | 'clubs'

interface HuimingCell {
  card: Card | null
  faceUp: boolean
}

interface HuimingPlayer {
  id: string
  hand: Card[]
  darkPickCharges: number
  canPlace: boolean
}

interface HuimingState {
  board: HuimingCell[][]   // 5×5
  players: [HuimingPlayer, HuimingPlayer]
  currentTurn: 0 | 1
  phase: 'placing' | 'taking' | 'ended'
  round: number
  winner: string | null
}

interface HuimingClientState {
  board: { card: Card | null; faceUp: boolean }[][]
  myHand: Card[]
  opponentHandCount: number
  myDarkPickCharges: number
  myCanPlace: boolean
  currentTurn: 0 | 1
  phase: string
  round: number
  winner: string | null
}
```

## 6. 基座层设计

### 6.1 房间管理器（RoomManager）

游戏无关的房间生命周期管理：

- `createRoom(playerId, gameId)` — 创建房间
- `joinRoom(roomId, playerId)` — 加入房间
- `removePlayer(playerId)` — 移除玩家
- `findRoomByPlayer(playerId)` — 查找玩家所在房间
- `getRoom(roomId)` — 获取房间

房间满员时自动调用游戏插件的 `createInitialState()` 初始化游戏。

### 6.2 插件加载器（PluginLoader）

- 注册游戏插件（服务端和客户端）
- 根据 gameId 查找插件
- 验证插件接口完整性

### 6.3 Socket 框架（SocketFramework）

通用的消息路由，将游戏特定的事件转发给对应插件：

- `room:create` / `room:join` — 基座处理
- `game:*` — 转发给游戏插件的 `handleEvent()`
- 断线重连 — 基座处理，调用插件 `getClientState()` 恢复

### 6.4 通用渲染组件

| 组件 | 功能 |
|------|------|
| `PlayingCard` | 单张扑克牌渲染，支持正面/背面/自定义样式 |
| `CardHand` | 手牌区，支持扇形/平铺布局 |
| `CardGrid` | 可配置的牌面网格（M×N） |
| `PlayerInfo` | 玩家信息栏（手牌数、状态等） |
| `GameRoom` | 房间容器，处理连接状态和游戏切换 |

## 7. 晦明游戏逻辑

### 7.1 牌组配置

```typescript
const huimingDeck: DeckConfig = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['1', '2', '3', '4', '5', '6'],
  jokers: 1,
}
// 共 4×6 + 1 = 25 张
```

### 7.2 回合流程

正常阶段（phase: `taking`）：
```
轮到玩家 → [可选：放牌] → 必须取牌 → 翻牌触发 → 回合结束
```

续局放牌阶段（phase: `placing`）：
```
轮到玩家 → 放一张手牌 → 回合结束 → 所有牌放完后切回 taking
```

### 7.3 规则校验函数

- `canTake(state, row, col, playerId)` — 是否可取
- `canPlace(state, playerId)` — 是否可放
- `canDarkPick(state, playerId)` — 是否可暗取
- `checkWinner(player)` — 是否集齐 6 张同花色（Joker 万能）
- `isAllFaceDown(board)` — 是否全暗（触发暗取能力）
- `getFlippableNeighbors(board, row, col)` — 获取相邻牌

### 7.4 信息隔离

服务端维护完整状态。每次状态变更后，为每个玩家生成可见视图：
- 暗置牌不暴露花色点数
- 暗取获得的牌只告诉持有者

## 8. 界面设计

### 8.1 晦明界面布局

```
┌─────────────────────────────────┐
│  顶部：对手信息                   │
├─────────────────────────────────┤
│         5×5 牌面网格（居中）        │
├─────────────────────────────────┤
│  底部：手牌区（居中）+ 操作按钮     │
└─────────────────────────────────┘
```

### 8.2 视觉风格

- 深灰底（#141820）+ 浅米色牌面（#f8f6f0）
- 红桃/方块红色，黑桃/梅花蓝色，Joker 金色
- 2.5D 效果：微渐变 + 投影，hover 上浮

## 9. 部署

### 9.1 本地开发

```bash
npm install
npm run dev          # 前端 + 后端同时启动
```

### 9.2 生产部署

1. `npm run build` — 前端构建，产物到 server/public
2. `npm run server` — 启动 Express + Socket.IO
3. 樱花穿透 TCP 隧道映射端口

### 9.3 配置项

- `PORT` — 服务器端口（默认 3000）
- `?server=<地址>` — 客户端连接地址
- `?game=<游戏ID>` — 选择游戏

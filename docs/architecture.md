# 晦明数字版 — 架构设计文档

> 通用卡牌联机平台 + 晦明游戏插件的技术架构详解

## 目录

1. [整体架构](#1-整体架构)
2. [联机流程设计](#2-联机流程设计)
3. [房间管理逻辑](#3-房间管理逻辑)
4. [Socket 通信协议](#4-socket-通信协议)
5. [插件系统设计](#5-插件系统设计)
6. [信息隔离机制](#6-信息隔离机制)
7. [通用组件层](#7-通用组件层)
8. [接入新游戏指南](#8-接入新游戏指南)
9. [目录结构](#9-目录结构)

---

## 1. 整体架构

系统分为三层，自下而上：

```
┌───────────────────────────────────────────────────────────────┐
│                       游戏插件层                               │
│                                                               │
│   games/huiming/         games/doudizhu/       games/...     │
│   ┌─────────────────┐   ┌─────────────────┐                  │
│   │ plugin.ts       │   │ plugin.ts       │   每个游戏独立：   │
│   │ engine.ts       │   │ engine.ts       │   - 游戏规则      │
│   │ rules.ts        │   │ rules.ts        │   - 状态机        │
│   │ types.ts        │   │ types.ts        │   - 专用类型      │
│   │ ui/             │   │ ui/             │   - 界面组件      │
│   └────────┬────────┘   └────────┬────────┘                  │
│            │ implements           │ implements                │
├────────────┼──────────────────────┼───────────────────────────┤
│            │         平台基座层    │                           │
│            │    (packages/core/)  │                           │
│   ┌────────┴──────────────────────┴────────┐                  │
│   │                                        │                  │
│   │   ┌─ shared/ ──────────────────────┐   │                  │
│   │   │  card.ts     通用牌组类型       │   │                  │
│   │   │  plugin.ts   插件接口定义       │   │                  │
│   │   │  room.ts     房间类型           │   │                  │
│   │   └────────────────────────────────┘   │                  │
│   │                                        │                  │
│   │   ┌─ server/ ──────────────────────┐   │                  │
│   │   │  RoomManager     房间生命周期   │   │                  │
│   │   │  PluginLoader    插件注册查找   │   │                  │
│   │   │  SocketFramework 事件路由       │   │                  │
│   │   └────────────────────────────────┘   │                  │
│   │                                        │                  │
│   │   ┌─ client/ ──────────────────────┐   │                  │
│   │   │  PlayingCard    单张扑克牌渲染  │   │                  │
│   │   │  CardGrid       可配置网格      │   │                  │
│   │   │  CardHand       手牌区          │   │                  │
│   │   │  PlayerInfo     玩家信息栏      │   │                  │
│   │   │  useSocket      Socket hook     │   │                  │
│   │   │  useGamePlugin  插件 hook       │   │                  │
│   │   └────────────────────────────────┘   │                  │
│   └────────────────────────────────────────┘                  │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                       基础设施层                               │
│                                                               │
│   Express · Socket.IO · Vite · React · TypeScript · Zustand   │
└───────────────────────────────────────────────────────────────┘
```

**核心原则：** 平台层处理「连接、房间、通信、渲染」，游戏插件只关心「规则、状态、UI」。

---

## 2. 联机流程设计

### 2.1 完整时序图

```
玩家A (浏览器)                     服务器                        玩家B (浏览器)
    │                                │                                │
    │  ① Socket.IO 连接              │                                │
    │───────────────────────────────>│                                │
    │                                │                                │
    │  ② 服务器推送可用游戏列表        │                                │
    │<───── games:list ─────────────│                                │
    │   ['huiming']                  │                                │
    │                                │                                │
    │  ③ 玩家A 创建房间               │                                │
    │───── room:create ────────────>│                                │
    │   { gameId: 'huiming' }       │                                │
    │                                │  RoomManager.createRoom()      │
    │                                │  生成 8位hex 房间ID             │
    │  ④ 返回房间ID                   │                                │
    │<───── room:created ───────────│                                │
    │   { roomId: 'a1b2c3d4' }      │                                │
    │                                │                                │
    │  ⑤ 玩家A 复制房间链接            │                                │
    │   http://host?join=a1b2c3d4    │                                │
    │   ─────── (通过微信/QQ等发送) ───────>                          │
    │                                │                                │
    │                                │     ⑥ 玩家B 打开链接            │
    │                                │<───── Socket.IO 连接 ─────────│
    │                                │                                │
    │                                │     ⑦ 自动加入房间              │
    │                                │<───── room:join ──────────────│
    │                                │   { roomId: 'a1b2c3d4' }      │
    │                                │  RoomManager.joinRoom()        │
    │                                │  校验房间存在且未满              │
    │                                │                                │
    │                                │     ⑧ 加入成功                  │
    │                                │───── room:joined ────────────>│
    │                                │   { opponentId: 'socketA' }    │
    │                                │                                │
    │                                │  ⑨ 房间满员，初始化游戏          │
    │                                │  plugin.createInitialState()   │
    │                                │  phase: waiting → playing      │
    │                                │                                │
    │  ⑩ 双方收到游戏初始状态          │                                │
    │<───── game:stateUpdate ───────│───── game:stateUpdate ────────>│
    │   (玩家A的可见视图)              │   (玩家B的可见视图)              │
    │                                │                                │
    │  ────── 游戏进行中 ────────────────────────────────────────────  │
    │                                │                                │
    │  ⑪ 玩家A 执行操作               │                                │
    │───── game:action ────────────>│                                │
    │   { event: 'take',            │  plugin.handleEvent()          │
    │     payload: {row:1,col:2} }  │  更新状态 + 生成各自视图         │
    │                                │                                │
    │  ⑫ 双方收到状态更新              │                                │
    │<───── game:stateUpdate ───────│───── game:stateUpdate ────────>│
    │                                │                                │
    │                                │  ⑬ 检查游戏结束                 │
    │                                │  plugin.checkGameEnd()         │
    │                                │  如有赢家 → game:over           │
```

### 2.2 客户端状态机

```
                    ┌──────────┐
                    │  lobby   │  大厅：选择游戏、创建房间
                    └────┬─────┘
                         │ room:create 成功
                         ▼
                    ┌──────────┐
                    │ waiting  │  等待：显示房间链接、等待对手
                    └────┬─────┘
                         │ 收到 game:stateUpdate
                         ▼
                    ┌──────────┐
                    │ playing  │  游戏：渲染游戏界面、处理交互
                    └──────────┘
```

### 2.3 断线处理

```
玩家A                          服务器                        玩家B
  │                              │                              │
  │   (网络断开)                  │                              │
  │   ─ ─ ─ ─ ─ ─ X             │                              │
  │                              │  Socket.IO disconnect 事件   │
  │                              │  RoomManager.removePlayer()  │
  │                              │  通知对手                     │
  │                              │───── game:opponentDisconnected ───>│
  │                              │                              │
  │   (重新连接)                  │                              │
  │─────────────────────────────>│                              │
  │                              │  需要重新加入房间              │
  │                              │  （当前无自动重连机制）         │
```

---

## 3. 房间管理逻辑

### 3.1 数据结构

```typescript
// packages/core/server/room-manager.ts

class RoomManager {
  // 房间存储：roomId → Room
  private rooms = new Map<string, Room>()

  // 玩家索引：playerId → roomId（用于快速查找玩家所在房间）
  private playerToRoom = new Map<string, string>()
}

interface Room {
  id: string           // 8位随机 hex，如 "a1b2c3d4"
  gameId: string       // 游戏插件 ID，如 "huiming"
  players: string[]    // Socket.IO socket.id 列表
  state: GameState     // 游戏状态（房间满员后由插件初始化）
  maxPlayers: number   // 最大玩家数（由游戏插件定义）
  phase: 'waiting' | 'playing' | 'ended'  // 房间阶段
}
```

### 3.2 生命周期

```
  createRoom()              joinRoom()             游戏结束 / 断线
      │                        │                        │
      ▼                        ▼                        ▼
  ┌────────┐    满员触发    ┌────────┐               ┌────────┐
  │ waiting │ ────────────> │ playing│ ────────────>  │ ended  │
  └────────┘  初始化状态    └────────┘  checkGameEnd  └────────┘
       │                                          
       │ 玩家离开                                  
       ▼                                          
    (销毁)                                        
```

### 3.3 核心方法

**createRoom(playerId, gameId, maxPlayers)**
```
输入: 创建者 socket ID, 游戏ID, 最大玩家数
输出: Room 对象
逻辑:
  1. 生成 8位随机 hex 作为房间 ID
  2. 创建 Room 对象，players = [playerId]，phase = 'waiting'
  3. 存入 rooms Map
  4. 建立 playerToRoom 索引
  5. 返回 Room
```

**joinRoom(roomId, playerId)**
```
输入: 房间 ID, 加入者 socket ID
输出: { success: boolean, reason?: string }
逻辑:
  1. 查找房间是否存在 → 不存在返回 { success: false, reason: 'notFound' }
  2. 检查房间是否已满 → 已满返回 { success: false, reason: 'full' }
  3. 将 playerId 加入 players 数组
  4. 建立 playerToRoom 索引
  5. 返回 { success: true }
```

**findRoomByPlayer(playerId)**
```
输入: 玩家 socket ID
输出: Room | null
逻辑: 通过 playerToRoom 反查 roomId，再从 rooms 获取 Room
复杂度: O(1)
```

**removePlayer(playerId)**
```
输入: 玩家 socket ID
逻辑:
  1. 通过 playerToRoom 找到房间
  2. 从 players 数组移除该玩家
  3. 删除 playerToRoom 索引
  4. 如果房间无剩余玩家，销毁房间
```

**getRoom(roomId)**
```
输入: 房间 ID
输出: Room | null
逻辑: 直接从 rooms Map 查找
```

### 3.4 房间 ID 生成

使用 `crypto.randomBytes(4).toString('hex')` 生成 8 位十六进制字符串，如 `a1b2c3d4`。碰撞概率约 1/4.3×10⁹，对 MVP 足够。

---

## 4. Socket 通信协议

### 4.1 消息类型

#### 基座层消息（SocketFramework 处理）

| 方向 | 事件 | 载荷 | 说明 |
|------|------|------|------|
| S→C | `games:list` | `string[]` | 可用游戏插件 ID 列表 |
| C→S | `room:create` | `{ gameId }` | 创建房间 |
| S→C | `room:created` | `{ roomId }` | 房间创建成功 |
| C→S | `room:join` | `{ roomId }` | 加入房间 |
| S→C | `room:joined` | `{ opponentId }` | 加入成功 |
| S→C | `room:error` | `{ reason }` | 房间错误 |
| S→C | `room:full` | - | 房间已满 |
| S→C | `room:notFound` | - | 房间不存在 |
| C→S | `game:action` | `{ event, payload }` | 游戏操作（转发给插件） |
| S→C | `game:stateUpdate` | `{ state }` | 游戏状态更新（每玩家独立视图） |
| S→C | `game:error` | `{ reason }` | 游戏操作错误 |
| S→C | `game:over` | `{ winnerId }` | 游戏结束 |
| S→C | `game:opponentDisconnected` | `{ playerId }` | 对手断线 |

#### 游戏层消息（插件通过 broadcast 返回）

插件的 `handleEvent()` 返回 `EventResult`，其中 `broadcast` 数组定义需要广播的消息：

```typescript
interface EventResult {
  state: GameState                              // 新的游戏状态
  broadcast: { event: string; data: any }[]     // 需要广播的事件
  error?: string                                // 错误信息（操作失败时）
}
```

SocketFramework 会将 broadcast 中的事件发送给房间内所有玩家。

### 4.2 事件路由流程

```
客户端发送 game:action
         │
         ▼
SocketFramework 接收
         │
         ▼
通过 RoomManager.findRoomByPlayer(socket.id) 查找房间
         │
         ├── 未找到房间 → 忽略
         │
         ▼
通过 PluginLoader.getPlugin(room.gameId) 获取游戏插件
         │
         ▼
调用 plugin.handleEvent(room.state, socket.id, event, payload)
         │
         ├── 返回 error → 发送 game:error 给发送者
         │
         ▼
更新 room.state = result.state
         │
         ▼
广播 result.broadcast 中的事件
         │
         ▼
为每个玩家调用 plugin.getClientState(room.state, playerId)
         │
         ▼
发送 game:stateUpdate 给每个玩家（各自独立视图）
         │
         ▼
调用 plugin.checkGameEnd(room.state)
         │
         ├── 返回 winnerId → 发送 game:over
         └── 返回 null → 继续
```

---

## 5. 插件系统设计

### 5.1 接口定义

#### GamePlugin（基础接口）

```typescript
// packages/core/shared/plugin.ts

interface GamePlugin {
  id: string              // 游戏唯一标识，如 "huiming"
  name: string            // 显示名称，如 "晦明"
  description: string     // 游戏描述
  minPlayers: number      // 最少玩家数
  maxPlayers: number      // 最多玩家数
  deckConfig: DeckConfig  // 使用的牌组配置
}
```

#### GameServerPlugin（服务端插件）

```typescript
interface GameServerPlugin extends GamePlugin {
  /**
   * 创建初始游戏状态
   * 当房间满员时由 SocketFramework 调用
   * @param players 玩家 socket ID 列表
   * @returns 初始游戏状态
   */
  createInitialState(players: string[]): GameState

  /**
   * 处理游戏事件
   * 当玩家发送 game:action 时由 SocketFramework 调用
   * @param state 当前游戏状态
   * @param playerId 操作者 socket ID
   * @param event 事件名称（如 'take', 'place'）
   * @param payload 事件载荷
   * @returns 新状态 + 广播事件 + 可选错误
   */
  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult

  /**
   * 为指定玩家生成可见状态（信息隔离）
   * 每次状态更新后为每个玩家分别调用
   * @param state 完整游戏状态
   * @param playerId 目标玩家 socket ID
   * @returns 该玩家可见的状态视图
   */
  getClientState(state: GameState, playerId: string): ClientState

  /**
   * 检查游戏是否结束
   * 每次状态更新后调用
   * @param state 当前游戏状态
   * @returns 赢家玩家 ID，或 null（未结束）
   */
  checkGameEnd(state: GameState): string | null
}
```

#### GameClientPlugin（客户端插件）

```typescript
interface GameClientPlugin extends GamePlugin {
  /**
   * 游戏主界面组件
   * 接收 GameComponentProps: { state, playerId, onAction }
   */
  GameComponent: React.ComponentType<GameComponentProps>

  /**
   * 游戏特有材质（可选）
   * 键为材质名称，值为 URL 或 base64
   */
  assets?: Record<string, string>
}

interface GameComponentProps {
  state: ClientState      // 来自 getClientState 的可见状态
  playerId: string        // 当前玩家 socket ID
  onAction: (event: string, payload: any) => void  // 发送游戏操作
}
```

### 5.2 插件加载器

```typescript
// packages/core/server/plugin-loader.ts

class PluginLoader {
  private plugins = new Map<string, GameServerPlugin>()

  // 注册插件
  register(plugin: GameServerPlugin): void

  // 根据 ID 获取插件
  getPlugin(gameId: string): GameServerPlugin | null

  // 列出所有已注册插件 ID
  listPlugins(): string[]
}
```

**注册时机：** 服务器启动时，在 `server/src/index.ts` 中手动注册：

```typescript
const pluginLoader = new PluginLoader()
pluginLoader.register(huimingServerPlugin)
// pluginLoader.register(doudizhuServerPlugin)  // 未来
```

**客户端注册：** 在 `client/src/App.tsx` 中手动注册：

```typescript
registerClientPlugin(huimingClientPlugin)
// registerClientPlugin(doudizhuClientPlugin)  // 未来
```

### 5.3 插件与基座的交互边界

```
                    插件负责                    基座负责
                ┌───────────────┐          ┌───────────────┐
  游戏规则       │      ✓        │          │               │
  状态机         │      ✓        │          │               │
  信息隔离       │      ✓        │          │               │
  胜负判定       │      ✓        │          │               │
  游戏 UI        │      ✓        │          │               │
  ─────────────────────────────────────────────────────────
  房间管理       │               │          │      ✓        │
  Socket 通信    │               │          │      ✓        │
  事件路由       │               │          │      ✓        │
  状态广播       │               │          │      ✓        │
  通用卡牌渲染   │               │          │      ✓        │
  连接管理       │               │          │      ✓        │
                └───────────────┘          └───────────────┘
```

---

## 6. 信息隔离机制

### 6.1 问题

在卡牌游戏中，玩家不应该看到对手的暗牌信息。但服务端需要维护完整状态来做逻辑判断。

### 6.2 解决方案

服务端维护完整状态 `GameState`，每次状态变更后，为每个玩家分别调用 `getClientState()` 生成独立视图。

```
服务端完整状态 HuimingState:
┌─────────────────────────────────────────────┐
│ board[2][2] = { card: {suit:'hearts',...},  │  ← 服务端知道这是红桃
│                 faceUp: false }              │
└─────────────────────────────────────────────┘
                    │
                    │ getClientState(state, playerA)
                    ▼
玩家A 视图 HuimingClientState:
┌─────────────────────────────────────────────┐
│ board[2][2] = { card: null,                 │  ← 客户端不知道是什么牌
│                 faceUp: false,               │
│                 exists: true }               │  ← 但知道这里有牌
└─────────────────────────────────────────────┘
```

### 6.3 晦明的信息隔离规则

| 信息类型 | 是否暴露 | 说明 |
|----------|---------|------|
| 明牌的花色和点数 | 暴露 | 所有人可见 |
| 暗牌的花色和点数 | 隐藏 | card 设为 null |
| 暗牌的存在性 | 暴露 | exists = true |
| 空位 | 暴露 | exists = false |
| 对手手牌内容 | 隐藏 | 只暴露数量 |
| 自己手牌内容 | 暴露 | 完整暴露 |
| 暗取获得的牌 | 隐藏 | 只告诉持有者 |
| 暗取次数 | 暴露 | 双方可见 |

### 6.4 实现代码

```typescript
// games/huiming/plugin.ts

function getClientState(state: HuimingState, playerId: string): HuimingClientState {
  const idx = state.players.findIndex(p => p.id === playerId) as 0 | 1
  const me = state.players[idx]
  const opp = state.players[1 - idx]
  return {
    board: state.board.map(row => row.map(cell => ({
      card: cell.faceUp ? cell.card : null,   // 暗牌隐藏内容
      faceUp: cell.faceUp,
      exists: cell.card !== null,              // 暴露存在性
    }))),
    myHand: me.hand,                           // 完整暴露自己的手牌
    opponentHandCount: opp.hand.length,         // 只暴露对手手牌数量
    myDarkPickCharges: me.darkPickCharges,
    myCanPlace: me.canPlace,
    myPlayerIndex: idx,
    currentTurn: state.currentTurn,
    phase: state.phase,
    round: state.round,
    winner: state.winner,
    hasTakenThisTurn: state.hasTakenThisTurn,
  }
}
```

---

## 7. 通用组件层

### 7.1 组件清单

| 组件 | 文件 | 功能 |
|------|------|------|
| `PlayingCard` | `packages/core/client/components/PlayingCard.tsx` | 单张扑克牌渲染，支持正面/背面/空位/高亮/交互 |
| `CardGrid` | `packages/core/client/components/CardGrid.tsx` | 可配置 M×N 网格，支持交互和高亮回调 |
| `CardHand` | `packages/core/client/components/CardHand.tsx` | 手牌区，支持选择和高亮 |
| `PlayerInfo` | `packages/core/client/components/PlayerInfo.tsx` | 玩家信息栏，显示手牌数、回合指示器 |
| `GameRoom` | `packages/core/client/components/GameRoom.tsx` | 房间容器 |

### 7.2 PlayingCard

```typescript
interface PlayingCardProps {
  card?: Card | null       // 牌数据（null 表示无牌或暗牌）
  faceUp?: boolean         // 是否正面朝上
  exists?: boolean         // 是否有牌存在（区分暗牌和空位）
  onClick?: () => void     // 点击回调
  interactive?: boolean    // 是否可交互（控制 hover 效果和 cursor）
  highlighted?: boolean    // 是否高亮（金色边框）
  className?: string       // 额外 CSS 类
}
```

渲染逻辑：
- `exists=false && card=null` → 空位（虚线边框）
- `exists=true && card=null && faceUp=false` → 暗牌（深色背面，✦ 图案）
- `card!=null && faceUp=true` → 明牌（浅色正面，花色 + 点数）

### 7.3 CardGrid

```typescript
interface CardGridProps {
  grid: GridCell[][]                                    // M×N 网格数据
  cols?: number                                         // 列数（默认取 grid[0].length）
  onCellClick?: (row: number, col: number) => void      // 点击回调
  isCellInteractive?: (row, col, cell) => boolean       // 动态判断是否可交互
  isCellHighlighted?: (row, col, cell) => boolean       // 动态判断是否高亮
}
```

### 7.4 Hooks

**useSocket**
```typescript
const { emit, on, socket, socketId } = useSocket({ serverUrl? })

// emit: 发送事件
// on: 监听事件，返回清理函数
// socket: Socket.IO 实例 ref
// socketId: 当前 socket ID
```

**useGamePlugin / registerClientPlugin**
```typescript
// 注册（在 App 初始化时调用一次）
registerClientPlugin(huimingClientPlugin)

// 查询
const plugin = useGamePlugin('huiming')
```

---

## 8. 接入新游戏指南

### 8.1 步骤概览

```
1. 创建目录 games/<gameId>/
2. 定义类型 types.ts
3. 实现引擎 engine.ts
4. 实现规则 rules.ts
5. 实现服务端插件 plugin.ts
6. 实现客户端 UI ui/
7. 注册插件
```

### 8.2 详细步骤

#### 步骤 1：创建目录

```
games/<gameId>/
├── types.ts          # 游戏专用类型
├── engine.ts         # 纯函数状态机
├── rules.ts          # 规则校验函数
├── plugin.ts         # 服务端插件实现
├── ui/
│   ├── GameComponent.tsx   # 游戏主界面
│   ├── client-plugin.ts    # 客户端插件定义
│   └── styles.css          # 游戏特有样式
└── __tests__/
    ├── engine.test.ts
    └── rules.test.ts
```

#### 步骤 2：定义类型

```typescript
// games/<gameId>/types.ts

import type { Card } from '@huiming/core-shared'

// 游戏专用状态（服务端维护的完整状态）
export interface MyGameState {
  // ... 游戏状态字段
}

// 客户端可见状态（信息隔离后的视图）
export interface MyClientState {
  // ... 可见状态字段
}
```

#### 步骤 3：实现引擎

```typescript
// games/<gameId>/engine.ts

// 纯函数：输入状态 + 操作 → 输出新状态
// 不做规则校验，只做状态变更
export function createInitialState(p1: string, p2: string): MyGameState { ... }
export function doSomeAction(game: MyGameState, ...): void { ... }
```

#### 步骤 4：实现规则

```typescript
// games/<gameId>/rules.ts

// 纯函数：判断操作是否合法
export function canDoSomething(game: MyGameState, ...): boolean { ... }
```

#### 步骤 5：实现服务端插件

```typescript
// games/<gameId>/plugin.ts

import type { GameServerPlugin } from '@huiming/core-shared'

export const myServerPlugin: GameServerPlugin = {
  id: 'mygame',
  name: '我的游戏',
  description: '...',
  minPlayers: 2,
  maxPlayers: 2,
  deckConfig: { suits: [...], ranks: [...], jokers: 0 },

  createInitialState(players) { ... },
  handleEvent(state, playerId, event, payload) { ... },
  getClientState(state, playerId) { ... },
  checkGameEnd(state) { ... },
}
```

#### 步骤 6：实现客户端插件

```typescript
// games/<gameId>/ui/client-plugin.ts

import type { GameClientPlugin } from '@huiming/core-shared'
import { MyGameComponent } from './GameComponent'

export const myClientPlugin: GameClientPlugin = {
  id: 'mygame',
  name: '我的游戏',
  description: '...',
  minPlayers: 2,
  maxPlayers: 2,
  deckConfig: { ... },
  GameComponent: MyGameComponent,
}
```

```tsx
// games/<gameId>/ui/GameComponent.tsx

import type { GameComponentProps } from '@huiming/core-shared'

export function MyGameComponent({ state, playerId, onAction }: GameComponentProps) {
  // 渲染游戏界面
  // 调用 onAction(event, payload) 发送操作
}
```

#### 步骤 7：注册插件

服务端 — `server/src/index.ts`：
```typescript
import { myServerPlugin } from 'mygame/plugin'
pluginLoader.register(myServerPlugin)
```

客户端 — `client/src/App.tsx`：
```typescript
import { myClientPlugin } from 'mygame/ui/client-plugin'
registerClientPlugin(myClientPlugin)
```

### 8.3 自动复用 vs 需要编写

| 类别 | 自动复用 | 需要编写 |
|------|---------|---------|
| 房间管理 | ✓ | |
| Socket 通信 | ✓ | |
| 事件路由 | ✓ | |
| 状态广播 | ✓ | |
| 信息隔离框架 | ✓ | getClientState 实现 |
| 通用卡牌渲染 | ✓ | |
| 翻牌/发牌动画 | ✓ | |
| ──── | ──── | ──── |
| 游戏规则 | | ✓ |
| 状态机 | | ✓ |
| 游戏 UI | | ✓ |
| 特殊牌面素材 | | ✓ |

---

## 9. 目录结构

```
huiming/
├── package.json                         # monorepo 根配置
├── tsconfig.json                        # TypeScript 根配置
├── .gitignore
│
├── packages/
│   └── core/                            # 平台基座层
│       ├── shared/                      # 通用类型（前后端共享）
│       │   ├── card.ts                  #   牌组类型 + 工具函数
│       │   ├── plugin.ts               #   插件接口定义
│       │   ├── room.ts                  #   房间类型
│       │   └── index.ts                 #   统一导出
│       │
│       ├── server/                      # 服务端框架
│       │   ├── room-manager.ts          #   房间生命周期管理
│       │   ├── plugin-loader.ts         #   插件注册与查找
│       │   ├── socket-framework.ts      #   Socket.IO 事件路由
│       │   ├── __tests__/               #   测试
│       │   └── index.ts                 #   统一导出
│       │
│       └── client/                      # 客户端框架
│           ├── components/              #   通用卡牌组件
│           │   ├── PlayingCard.tsx
│           │   ├── CardGrid.tsx
│           │   ├── CardHand.tsx
│           │   ├── PlayerInfo.tsx
│           │   ├── GameRoom.tsx
│           │   └── index.ts
│           ├── hooks/                   #   通用 Hooks
│           │   ├── useSocket.ts
│           │   ├── useGamePlugin.ts
│           │   └── index.ts
│           ├── styles/
│           │   └── core.css             #   核心样式
│           └── package.json
│
├── games/
│   └── huiming/                         # 晦明游戏插件
│       ├── types.ts                     #   晦明专用类型
│       ├── engine.ts                    #   状态机（纯函数）
│       ├── rules.ts                     #   规则校验（纯函数）
│       ├── plugin.ts                    #   服务端插件实现
│       ├── __tests__/                   #   测试
│       │   ├── engine.test.ts
│       │   └── rules.test.ts
│       ├── ui/
│       │   ├── HuimingGame.tsx          #   游戏主界面
│       │   ├── HuimingBoard.tsx         #   5×5 牌面网格
│       │   ├── client-plugin.ts         #   客户端插件定义
│       │   └── styles.css              #   晦明特有样式
│       └── package.json
│
├── client/                              # 客户端应用
│   ├── index.html                       #   HTML 入口
│   ├── vite.config.ts                   #   Vite 配置
│   ├── tsconfig.json
│   ├── package.json
│   ├── public/
│   │   └── assets/                      #   静态牌面素材
│   └── src/
│       ├── main.tsx                     #   React 入口
│       ├── App.tsx                      #   主应用（大厅 + 游戏）
│       └── styles/
│           └── app.css                  #   应用样式
│
├── server/                              # 服务器应用
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       └── index.ts                     #   服务器入口
│
├── assets/                              # 原始牌面素材
│   ├── JOKER.png
│   ├── 红桃.png
│   ├── 黑桃.png
│   ├── 方块.png
│   └── 梅花.png
│
└── docs/                                # 文档
    ├── architecture.md                  #   本文档
    └── superpowers/
        ├── specs/                       #   设计规格
        └── plans/                       #   实施计划
```

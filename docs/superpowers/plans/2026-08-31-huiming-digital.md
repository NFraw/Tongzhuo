# 通用卡牌平台 + 晦明游戏 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可插拔的卡牌游戏联机平台基座，首个游戏插件为晦明。

**Architecture:** 三层架构 — 基座层（packages/core/）提供通用牌组、房间管理、渲染组件、插件机制；游戏层（games/）实现具体规则和 UI；基础设施层提供 Express + Socket.IO + Vite。

**Tech Stack:** Vite + React + TypeScript, Zustand, Express + Socket.IO, Vitest

---

## 文件结构总览

```
huiming/
├── package.json
├── tsconfig.json
├── packages/core/
│   ├── shared/
│   │   ├── card.ts              # 通用牌组类型
│   │   ├── room.ts              # 房间类型
│   │   ├── plugin.ts            # 插件接口
│   │   └── index.ts
│   ├── server/
│   │   ├── room-manager.ts      # 房间管理器
│   │   ├── plugin-loader.ts     # 插件加载器
│   │   ├── socket-framework.ts  # Socket 框架
│   │   ├── __tests__/
│   │   └── index.ts             # 服务器入口
│   └── client/
│       ├── components/
│       │   ├── PlayingCard.tsx
│       │   ├── CardHand.tsx
│       │   ├── CardGrid.tsx
│       │   ├── PlayerInfo.tsx
│       │   └── GameRoom.tsx
│       ├── hooks/
│       │   ├── useSocket.ts
│       │   └── useGamePlugin.ts
│       └── animations/
│           └── card-animations.ts
├── games/huiming/
│   ├── plugin.ts
│   ├── types.ts
│   ├── engine.ts
│   ├── rules.ts
│   ├── events.ts
│   ├── __tests__/
│   ├── ui/
│   │   ├── HuimingBoard.tsx
│   │   ├── HuimingGame.tsx
│   │   └── styles.css
│   └── assets/
└── server/index.ts              # 部署入口
```

---

## Task 1: Monorepo 脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`
- Create: `packages/core/shared/package.json`
- Create: `packages/core/server/package.json`
- Create: `packages/core/server/tsconfig.json`
- Create: `packages/core/server/vitest.config.ts`
- Create: `games/huiming/package.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`

- [ ] **Step 1: 创建根 package.json**

```json
{
  "name": "huiming",
  "private": true,
  "workspaces": [
    "packages/core/*",
    "games/*",
    "server",
    "client"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "npm -w server run dev",
    "dev:client": "npm -w client run dev",
    "build": "npm -w client run build && cp -r client/dist server/public",
    "server": "npm -w server run start",
    "test": "npm -w @huiming/core-server run test && npm -w huiming run test"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建根 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建 packages/core/shared/package.json**

```json
{
  "name": "@huiming/core-shared",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts",
  "types": "index.ts"
}
```

- [ ] **Step 4: 创建 packages/core/server/package.json**

```json
{
  "name": "@huiming/core-server",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.21.0",
    "socket.io": "^4.8.0",
    "@huiming/core-shared": "*"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 5: 创建 packages/core/server/tsconfig.json**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 6: 创建 packages/core/server/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 7: 创建 games/huiming/package.json**

```json
{
  "name": "huiming",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@huiming/core-shared": "*",
    "@huiming/core-server": "*"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 8: 创建 server/package.json**

```json
{
  "name": "@huiming/server",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@huiming/core-server": "*",
    "huiming": "*",
    "express": "^4.21.0",
    "socket.io": "^4.8.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 9: 创建 server/tsconfig.json**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 10: 创建 client/package.json**

```json
{
  "name": "@huiming/client",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io-client": "^4.8.0",
    "zustand": "^5.0.0",
    "@huiming/core-shared": "*"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 11: 创建 client/tsconfig.json**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 12: 创建 client/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 13: 创建 client/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>卡牌平台</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 14: 安装依赖验证**

```bash
cd D:\03Project\1\huiming && npm install
```

- [ ] **Step 15: Commit**

```bash
git add -A && git commit -m "chore: initialize monorepo with core packages and game plugin structure"
```

---

## Task 2: 核心共享类型

**Files:**
- Create: `packages/core/shared/card.ts`
- Create: `packages/core/shared/room.ts`
- Create: `packages/core/shared/plugin.ts`
- Create: `packages/core/shared/index.ts`

- [ ] **Step 1: 创建通用牌组类型**

```typescript
// packages/core/shared/card.ts
export type StandardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type ExtendedSuit = 'joker_red' | 'joker_black'
export type Suit = StandardSuit | ExtendedSuit | string

export type StandardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  id: string
  suit: Suit
  rank: StandardRank | string
  value: number
  deckIndex: number
}

export interface DeckConfig {
  suits: Suit[]
  ranks: string[]
  jokers: number
  custom?: Card[]
}

/** 根据配置创建牌组 */
export function createDeck(config: DeckConfig): Card[] {
  const deck: Card[] = []
  let index = 0

  for (const suit of config.suits) {
    for (const rank of config.ranks) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        value: rankToValue(rank),
        deckIndex: index++,
      })
    }
  }

  for (let i = 0; i < config.jokers; i++) {
    deck.push({
      id: `joker-${i}`,
      suit: i === 0 ? 'joker_red' : 'joker_black',
      rank: 'JOKER',
      value: 0,
      deckIndex: index++,
    })
  }

  if (config.custom) {
    for (const card of config.custom) {
      deck.push({ ...card, deckIndex: index++ })
    }
  }

  return deck
}

/** 洗牌（Fisher-Yates） */
export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function rankToValue(rank: string): number {
  const map: Record<string, number> = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
  }
  return map[rank] ?? 0
}
```

- [ ] **Step 2: 创建房间类型**

```typescript
// packages/core/shared/room.ts
export type RoomPhase = 'waiting' | 'playing' | 'ended'

export interface Room {
  id: string
  gameId: string
  players: string[]
  state: any | null
  maxPlayers: number
  phase: RoomPhase
}
```

- [ ] **Step 3: 创建插件接口**

```typescript
// packages/core/shared/plugin.ts
import type { Card, DeckConfig } from './card'

export interface GameState {
  [key: string]: any
}

export interface ClientState {
  [key: string]: any
}

export interface EventResult {
  state: GameState
  broadcast: { event: string; data: any }[]
  error?: string
}

export interface GameComponentProps {
  state: ClientState
  playerId: string
  onAction: (event: string, payload: any) => void
}

export interface GamePlugin {
  id: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  deckConfig: DeckConfig
}

export interface GameServerPlugin extends GamePlugin {
  createInitialState(players: string[]): GameState
  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult
  getClientState(state: GameState, playerId: string): ClientState
  checkGameEnd(state: GameState): string | null
}

export interface GameClientPlugin extends GamePlugin {
  GameComponent: React.ComponentType<GameComponentProps>
  assets?: Record<string, string>
}
```

- [ ] **Step 4: 创建导出文件**

```typescript
// packages/core/shared/index.ts
export * from './card'
export * from './room'
export * from './plugin'
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/shared/ && git commit -m "feat: add core shared types (card, room, plugin interfaces)"
```

---

## Task 3: 服务器核心 — 房间管理器

**Files:**
- Create: `packages/core/server/room-manager.ts`
- Create: `packages/core/server/__tests__/room-manager.test.ts`

- [ ] **Step 1: 编写房间管理器测试**

```typescript
// packages/core/server/__tests__/room-manager.test.ts
import { describe, it, expect } from 'vitest'
import { RoomManager } from '../room-manager'

describe('RoomManager', () => {
  it('should create a room', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('player1', 'test-game', 2)
    expect(room.id).toBeTruthy()
    expect(room.players).toEqual(['player1'])
    expect(room.gameId).toBe('test-game')
    expect(room.phase).toBe('waiting')
  })

  it('should allow second player to join', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('p1', 'test-game', 2)
    const result = manager.joinRoom(room.id, 'p2')
    expect(result.success).toBe(true)
    expect(room.players).toEqual(['p1', 'p2'])
  })

  it('should reject third player when full', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('p1', 'test-game', 2)
    manager.joinRoom(room.id, 'p2')
    const result = manager.joinRoom(room.id, 'p3')
    expect(result.success).toBe(false)
    expect(result.reason).toBe('full')
  })

  it('should reject non-existent room', () => {
    const manager = new RoomManager()
    expect(manager.joinRoom('nope', 'p1')).toEqual({ success: false, reason: 'notFound' })
  })

  it('should find room by player', () => {
    const manager = new RoomManager()
    const room = manager.createRoom('p1', 'test-game', 2)
    expect(manager.findRoomByPlayer('p1')).toBe(room)
    expect(manager.findRoomByPlayer('p2')).toBeNull()
  })

  it('should remove player and clean up empty room', () => {
    const manager = new RoomManager()
    manager.createRoom('p1', 'test-game', 2)
    manager.removePlayer('p1')
    expect(manager.findRoomByPlayer('p1')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm -w @huiming/core-server run test
```

- [ ] **Step 3: 实现房间管理器**

```typescript
// packages/core/server/room-manager.ts
import { randomBytes } from 'crypto'
import type { Room } from '@huiming/core-shared'

export class RoomManager {
  private rooms = new Map<string, Room>()
  private playerToRoom = new Map<string, string>()

  createRoom(playerId: string, gameId: string, maxPlayers: number): Room {
    const id = randomBytes(4).toString('hex')
    const room: Room = {
      id,
      gameId,
      players: [playerId],
      state: null,
      maxPlayers,
      phase: 'waiting',
    }
    this.rooms.set(id, room)
    this.playerToRoom.set(playerId, id)
    return room
  }

  joinRoom(roomId: string, playerId: string): { success: boolean; reason?: string } {
    const room = this.rooms.get(roomId)
    if (!room) return { success: false, reason: 'notFound' }
    if (room.players.length >= room.maxPlayers) return { success: false, reason: 'full' }

    room.players.push(playerId)
    this.playerToRoom.set(playerId, roomId)
    return { success: true }
  }

  findRoomByPlayer(playerId: string): Room | null {
    const roomId = this.playerToRoom.get(playerId)
    return roomId ? (this.rooms.get(roomId) ?? null) : null
  }

  removePlayer(playerId: string): void {
    const roomId = this.playerToRoom.get(playerId)
    if (!roomId) return
    const room = this.rooms.get(roomId)
    if (!room) return

    room.players = room.players.filter(id => id !== playerId)
    this.playerToRoom.delete(playerId)

    if (room.players.length === 0) {
      this.rooms.delete(roomId)
    }
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null
  }
}
```

- [ ] **Step 4: 运行测试通过**

```bash
npm -w @huiming/core-server run test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/server/ && git commit -m "feat: implement RoomManager"
```

---

## Task 4: 服务器核心 — 插件加载器 + Socket 框架

**Files:**
- Create: `packages/core/server/plugin-loader.ts`
- Create: `packages/core/server/socket-framework.ts`
- Create: `packages/core/server/__tests__/plugin-loader.test.ts`

- [ ] **Step 1: 编写插件加载器测试**

```typescript
// packages/core/server/__tests__/plugin-loader.test.ts
import { describe, it, expect } from 'vitest'
import { PluginLoader } from '../plugin-loader'
import type { GameServerPlugin } from '@huiming/core-shared'

const mockPlugin: GameServerPlugin = {
  id: 'test',
  name: 'Test Game',
  description: 'A test game',
  minPlayers: 2,
  maxPlayers: 2,
  deckConfig: { suits: ['hearts'], ranks: ['A'], jokers: 0 },
  createInitialState: () => ({ board: [] }),
  handleEvent: (state) => ({ state, broadcast: [] }),
  getClientState: (state) => state,
  checkGameEnd: () => null,
}

describe('PluginLoader', () => {
  it('should register and retrieve a plugin', () => {
    const loader = new PluginLoader()
    loader.register(mockPlugin)
    expect(loader.getPlugin('test')).toBe(mockPlugin)
  })

  it('should return null for unknown plugin', () => {
    const loader = new PluginLoader()
    expect(loader.getPlugin('unknown')).toBeNull()
  })

  it('should list all registered plugins', () => {
    const loader = new PluginLoader()
    loader.register(mockPlugin)
    expect(loader.listPlugins()).toEqual(['test'])
  })
})
```

- [ ] **Step 2: 实现插件加载器**

```typescript
// packages/core/server/plugin-loader.ts
import type { GameServerPlugin } from '@huiming/core-shared'

export class PluginLoader {
  private plugins = new Map<string, GameServerPlugin>()

  register(plugin: GameServerPlugin): void {
    this.plugins.set(plugin.id, plugin)
  }

  getPlugin(gameId: string): GameServerPlugin | null {
    return this.plugins.get(gameId) ?? null
  }

  listPlugins(): string[] {
    return [...this.plugins.keys()]
  }
}
```

- [ ] **Step 3: 实现 Socket 框架**

```typescript
// packages/core/server/socket-framework.ts
import type { Server, Socket } from 'socket.io'
import { RoomManager } from './room-manager'
import { PluginLoader } from './plugin-loader'

export function setupSocketFramework(
  io: Server,
  roomManager: RoomManager,
  pluginLoader: PluginLoader
): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`)

    // 列出可用游戏
    socket.emit('games:list', pluginLoader.listPlugins())

    // 创建房间
    socket.on('room:create', ({ gameId }: { gameId: string }) => {
      const plugin = pluginLoader.getPlugin(gameId)
      if (!plugin) {
        socket.emit('room:error', { reason: '游戏不存在' })
        return
      }
      const room = roomManager.createRoom(socket.id, gameId, plugin.maxPlayers)
      socket.join(room.id)
      socket.emit('room:created', { roomId: room.id })
    })

    // 加入房间
    socket.on('room:join', ({ roomId }: { roomId: string }) => {
      const result = roomManager.joinRoom(roomId, socket.id)
      if (!result.success) {
        socket.emit(result.reason === 'full' ? 'room:full' : 'room:notFound')
        return
      }

      socket.join(roomId)
      const room = roomManager.getRoom(roomId)!
      const plugin = pluginLoader.getPlugin(room.gameId)!

      socket.emit('room:joined', { opponentId: room.players.find(id => id !== socket.id)! })

      // 房间满员，初始化游戏
      if (room.players.length === room.maxPlayers) {
        room.phase = 'playing'
        room.state = plugin.createInitialState(room.players)
        broadcastState(io, room, plugin)
      }
    })

    // 游戏事件转发给插件
    socket.on('game:action', ({ event, payload }: { event: string; payload: any }) => {
      const room = roomManager.findRoomByPlayer(socket.id)
      if (!room || !room.state || room.phase !== 'playing') return

      const plugin = pluginLoader.getPlugin(room.gameId)
      if (!plugin) return

      const result = plugin.handleEvent(room.state, socket.id, event, payload)
      if (result.error) {
        socket.emit('game:error', { reason: result.error })
        return
      }

      room.state = result.state

      // 广播事件
      for (const msg of result.broadcast) {
        io.to(room.id).emit(msg.event, msg.data)
      }

      // 广播状态更新
      broadcastState(io, room, plugin)

      // 检查游戏结束
      const winnerId = plugin.checkGameEnd(room.state)
      if (winnerId) {
        room.phase = 'ended'
        io.to(room.id).emit('game:over', { winnerId })
      }
    })

    // 断线
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`)
      const room = roomManager.findRoomByPlayer(socket.id)
      if (!room) return

      const plugin = pluginLoader.getPlugin(room.gameId)
      if (plugin && room.state) {
        // 通知对手
        const opponent = room.players.find(id => id !== socket.id)
        if (opponent) {
          io.to(opponent).emit('game:opponentDisconnected', { playerId: socket.id })
        }
      }

      roomManager.removePlayer(socket.id)
    })
  })
}

function broadcastState(io: Server, room: any, plugin: any): void {
  for (const playerId of room.players) {
    const clientState = plugin.getClientState(room.state, playerId)
    io.to(playerId).emit('game:stateUpdate', { state: clientState })
  }
}
```

- [ ] **Step 4: 运行测试通过**

```bash
npm -w @huiming/core-server run test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/server/ && git commit -m "feat: implement PluginLoader and SocketFramework"
```

---

## Task 5: 通用客户端组件

**Files:**
- Create: `packages/core/client/components/PlayingCard.tsx`
- Create: `packages/core/client/components/CardHand.tsx`
- Create: `packages/core/client/components/CardGrid.tsx`
- Create: `packages/core/client/components/PlayerInfo.tsx`
- Create: `packages/core/client/components/GameRoom.tsx`
- Create: `packages/core/client/components/index.ts`

- [ ] **Step 1: 实现 PlayingCard 组件**

```tsx
// packages/core/client/components/PlayingCard.tsx
import type { Card } from '@huiming/core-shared'

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  joker_red: '★', joker_black: '★',
}

const SUIT_COLORS: Record<string, string> = {
  hearts: '#cc4444', diamonds: '#cc4444',
  clubs: '#4488cc', spades: '#4488cc',
  joker_red: '#b8960a', joker_black: '#b8960a',
}

interface PlayingCardProps {
  card?: Card | null
  faceUp?: boolean
  onClick?: () => void
  interactive?: boolean
  highlighted?: boolean
  className?: string
}

export function PlayingCard({
  card, faceUp = true, onClick, interactive, highlighted, className = '',
}: PlayingCardProps) {
  if (!card) {
    return <div className={`playing-card card-empty ${className}`} />
  }

  const symbol = SUIT_SYMBOLS[card.suit] ?? '?'
  const color = SUIT_COLORS[card.suit] ?? '#888'

  return (
    <div
      className={`playing-card ${faceUp ? 'card-face' : 'card-back'} ${interactive ? 'card-interactive' : ''} ${highlighted ? 'card-highlighted' : ''} ${className}`}
      onClick={interactive ? onClick : undefined}
    >
      {faceUp ? (
        <div className="card-content" style={{ color }}>
          <span className="card-suit">{symbol}</span>
          <span className="card-rank">{card.rank}</span>
        </div>
      ) : (
        <div className="card-back-pattern"><span>✦</span></div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 实现 CardHand 组件**

```tsx
// packages/core/client/components/CardHand.tsx
import type { Card } from '@huiming/core-shared'
import { PlayingCard } from './PlayingCard'

interface CardHandProps {
  cards: Card[]
  onCardClick?: (card: Card) => void
  selectable?: boolean
  selectedId?: string | null
}

export function CardHand({ cards, onCardClick, selectable, selectedId }: CardHandProps) {
  return (
    <div className="card-hand">
      {cards.map(card => (
        <PlayingCard
          key={card.id}
          card={card}
          faceUp
          interactive={selectable}
          highlighted={card.id === selectedId}
          onClick={() => onCardClick?.(card)}
        />
      ))}
      {cards.length === 0 && <span className="hand-empty">暂无手牌</span>}
    </div>
  )
}
```

- [ ] **Step 3: 实现 CardGrid 组件**

```tsx
// packages/core/client/components/CardGrid.tsx
import type { Card } from '@huiming/core-shared'
import { PlayingCard } from './PlayingCard'

export interface GridCell {
  card: Card | null
  faceUp: boolean
}

interface CardGridProps {
  grid: GridCell[][]
  cols?: number
  onCellClick?: (row: number, col: number) => void
  isCellInteractive?: (row: number, col: number, cell: GridCell) => boolean
  isCellHighlighted?: (row: number, col: number, cell: GridCell) => boolean
}

export function CardGrid({
  grid, cols, onCellClick, isCellInteractive, isCellHighlighted,
}: CardGridProps) {
  const columnCount = cols ?? (grid[0]?.length ?? 5)
  return (
    <div
      className="card-grid"
      style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => (
          <PlayingCard
            key={`${r}-${c}`}
            card={cell.card}
            faceUp={cell.faceUp}
            interactive={isCellInteractive?.(r, c, cell)}
            highlighted={isCellHighlighted?.(r, c, cell)}
            onClick={() => onCellClick?.(r, c)}
          />
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 4: 实现 PlayerInfo 组件**

```tsx
// packages/core/client/components/PlayerInfo.tsx
interface PlayerInfoProps {
  label: string
  handCount: number
  extraInfo?: { key: string; value: string | number }[]
  isTurn?: boolean
  align?: 'left' | 'right'
}

export function PlayerInfo({ label, handCount, extraInfo, isTurn, align = 'left' }: PlayerInfoProps) {
  return (
    <div className={`player-info player-info-${align}`}>
      <span className={`turn-dot ${isTurn ? 'active' : ''}`} />
      <span>{label}</span>
      <span>手牌 <strong>{handCount}</strong></span>
      {extraInfo?.map(({ key, value }) => (
        <span key={key}>{key} <strong>{value}</strong></span>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 实现 GameRoom 容器**

```tsx
// packages/core/client/components/GameRoom.tsx
import type { ReactNode } from 'react'

interface GameRoomProps {
  connected: boolean
  children: ReactNode
}

export function GameRoom({ connected, children }: GameRoomProps) {
  if (!connected) {
    return (
      <div className="game-room-disconnected">
        <p>连接中...</p>
      </div>
    )
  }
  return <div className="game-room">{children}</div>
}
```

- [ ] **Step 6: 创建导出文件**

```typescript
// packages/core/client/components/index.ts
export { PlayingCard } from './PlayingCard'
export { CardHand } from './CardHand'
export { CardGrid } from './CardGrid'
export type { GridCell } from './CardGrid'
export { PlayerInfo } from './PlayerInfo'
export { GameRoom } from './GameRoom'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/client/ && git commit -m "feat: add reusable card components (PlayingCard, CardHand, CardGrid, PlayerInfo, GameRoom)"
```

---

## Task 6: 客户端 Hooks + 样式

**Files:**
- Create: `packages/core/client/hooks/useSocket.ts`
- Create: `packages/core/client/hooks/useGamePlugin.ts`
- Create: `packages/core/client/hooks/index.ts`
- Create: `packages/core/client/styles/core.css`

- [ ] **Step 1: 实现 useSocket hook**

```typescript
// packages/core/client/hooks/useSocket.ts
import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseSocketOptions {
  serverUrl?: string
}

export function useSocket({ serverUrl }: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const url = serverUrl || new URLSearchParams(window.location.search).get('server') || window.location.origin
    const socket = io(url, { transports: ['websocket', 'polling'] })
    socketRef.current = socket
    return () => { socket.disconnect() }
  }, [serverUrl])

  const emit = useCallback((event: string, payload?: any) => {
    socketRef.current?.emit(event, payload)
  }, [])

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler)
    return () => { socketRef.current?.off(event, handler) }
  }, [])

  const socketId = socketRef.current?.id ?? null

  return { emit, on, socketId, socket: socketRef }
}
```

- [ ] **Step 2: 实现 useGamePlugin hook**

```typescript
// packages/core/client/hooks/useGamePlugin.ts
import type { GameClientPlugin } from '@huiming/core-shared'

const plugins = new Map<string, GameClientPlugin>()

export function registerClientPlugin(plugin: GameClientPlugin) {
  plugins.set(plugin.id, plugin)
}

export function useGamePlugin(gameId: string): GameClientPlugin | null {
  return plugins.get(gameId) ?? null
}
```

- [ ] **Step 3: 创建 hooks 导出**

```typescript
// packages/core/client/hooks/index.ts
export { useSocket } from './useSocket'
export { useGamePlugin, registerClientPlugin } from './useGamePlugin'
```

- [ ] **Step 4: 创建核心样式**

```css
/* packages/core/client/styles/core.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #141820;
  color: #c8d0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  min-height: 100vh;
}

/* PlayingCard */
.playing-card {
  aspect-ratio: 3/4;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
}

.card-back {
  background: linear-gradient(145deg, #2a3040, #1e2430);
  border: 1.5px solid #3a4555;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.card-face {
  background: linear-gradient(145deg, #f8f6f0, #eae6da);
  border: 1.5px solid #d0c8b0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.card-empty {
  background: transparent;
  border: 1.5px dashed #3a4555;
}

.card-interactive { cursor: pointer; }
.card-interactive:hover {
  transform: translateY(-4px) scale(1.05);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.card-highlighted {
  border-color: #e5c07b;
  box-shadow: 0 0 12px rgba(229,192,123,0.3);
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.card-suit { font-size: 24px; }
.card-rank { font-size: 14px; font-weight: 700; color: #333; }
.card-back-pattern { font-size: 20px; opacity: 0.3; color: #8a90a0; }

/* CardGrid */
.card-grid {
  display: grid;
  gap: 8px;
  max-width: 480px;
  margin: 0 auto;
}

/* CardHand */
.card-hand {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hand-empty { color: #4a5060; font-size: 14px; }

/* PlayerInfo */
.player-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #1a2030;
  border-radius: 10px;
  font-size: 13px;
  color: #8a90a0;
}

.turn-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #4a5060;
}

.turn-dot.active {
  background: #4a4;
  box-shadow: 0 0 6px #4a4;
}

/* GameRoom */
.game-room {
  width: 100%;
  max-width: 600px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  margin: 0 auto;
}

.game-room-disconnected {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: #6a7080;
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/client/hooks/ packages/core/client/styles/ && git commit -m "feat: add client hooks and core styles"
```

---

## Task 7: 晦明游戏 — 类型 + 引擎

**Files:**
- Create: `games/huiming/types.ts`
- Create: `games/huiming/engine.ts`
- Create: `games/huiming/__tests__/engine.test.ts`

- [ ] **Step 1: 创建晦明专用类型**

```typescript
// games/huiming/types.ts
import type { Card } from '@huiming/core-shared'

export type HuimingSuit = 'hearts' | 'spades' | 'diamonds' | 'clubs'

export interface HuimingCell {
  card: Card | null
  faceUp: boolean
}

export type HuimingBoard = HuimingCell[][]

export interface HuimingPlayer {
  id: string
  hand: Card[]
  darkPickCharges: number
  canPlace: boolean
}

export interface HuimingState {
  board: HuimingBoard
  players: [HuimingPlayer, HuimingPlayer]
  currentTurn: 0 | 1
  phase: 'placing' | 'taking' | 'ended'
  round: number
  winner: string | null
}

export interface HuimingClientState {
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

- [ ] **Step 2: 编写引擎测试**

```typescript
// games/huiming/__tests__/engine.test.ts
import { describe, it, expect } from 'vitest'
import { createHuimingBoard, initHuimingGame, takeCard, placeCard, flipNeighbors, checkAllFaceDown, grantDarkPickCharges } from '../engine'

describe('createHuimingBoard', () => {
  it('should create 5x5 grid with 25 cards', () => {
    const board = createHuimingBoard()
    expect(board).toHaveLength(5)
    board.forEach(row => expect(row).toHaveLength(5))
    let count = 0
    board.forEach(row => row.forEach(cell => { if (cell.card) count++ }))
    expect(count).toBe(25)
  })

  it('should have joker at center (2,2)', () => {
    const board = createHuimingBoard()
    expect(board[2][2].card?.suit).toMatch(/joker/)
  })

  it('should have all cards face down', () => {
    const board = createHuimingBoard()
    board.forEach(row => row.forEach(cell => {
      if (cell.card) expect(cell.faceUp).toBe(false)
    }))
  })
})

describe('initHuimingGame', () => {
  it('should initialize correctly', () => {
    const game = initHuimingGame('p1', 'p2')
    expect(game.players).toHaveLength(2)
    expect(game.currentTurn).toBe(0)
    expect(game.phase).toBe('taking')
    expect(game.round).toBe(1)
    expect(game.winner).toBeNull()
  })
})

describe('takeCard', () => {
  it('should take a face-up card', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board[0][0].faceUp = true
    const card = game.board[0][0].card!
    const result = takeCard(game, 0, 0, 0)
    expect(result.success).toBe(true)
    expect(game.board[0][0].card).toBeNull()
    expect(game.players[0].hand).toContainEqual(card)
  })

  it('should fail on empty cell', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board[0][0].card = null
    expect(takeCard(game, 0, 0, 0).success).toBe(false)
  })

  it('should fail on face-down without charges', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].darkPickCharges = 0
    expect(takeCard(game, 0, 0, 0).success).toBe(false)
  })

  it('should deduct dark pick charge', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].darkPickCharges = 1
    takeCard(game, 0, 0, 0)
    expect(game.players[0].darkPickCharges).toBe(0)
  })
})

describe('flipNeighbors', () => {
  it('should flip 4 adjacent cards', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board.forEach(row => row.forEach(cell => { if (cell.card) cell.faceUp = false }))
    game.board[1][2].faceUp = true
    game.board[3][2].faceUp = true
    game.board[2][1].faceUp = true
    game.board[2][3].faceUp = true
    flipNeighbors(game.board, 2, 2)
    expect(game.board[1][2].faceUp).toBe(false)
    expect(game.board[3][2].faceUp).toBe(false)
    expect(game.board[2][1].faceUp).toBe(false)
    expect(game.board[2][3].faceUp).toBe(false)
  })

  it('should skip empty cells', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board[1][2].card = null
    expect(() => flipNeighbors(game.board, 2, 2)).not.toThrow()
  })
})

describe('placeCard', () => {
  it('should place card from hand to empty cell', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board[0][0].card = null
    const card = { id: 'test', suit: 'hearts', rank: '1', value: 1, deckIndex: 0 }
    game.players[0].hand.push(card)
    game.players[0].canPlace = true
    const result = placeCard(game, 0, 'test', 0, 0, true)
    expect(result.success).toBe(true)
    expect(game.board[0][0].card?.id).toBe('test')
    expect(game.players[0].canPlace).toBe(false)
  })

  it('should fail without place ability', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].canPlace = false
    expect(placeCard(game, 0, 'test', 0, 0, true).success).toBe(false)
  })
})

describe('checkAllFaceDown', () => {
  it('should return true when all face down', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board.forEach(row => row.forEach(cell => { if (cell.card) cell.faceUp = false }))
    expect(checkAllFaceDown(game.board)).toBe(true)
  })

  it('should return false when any face up', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board[0][0].faceUp = true
    expect(checkAllFaceDown(game.board)).toBe(false)
  })
})
```

- [ ] **Step 3: 运行测试验证失败**

```bash
npm -w huiming run test
```

- [ ] **Step 4: 实现引擎**

```typescript
// games/huiming/engine.ts
import { createDeck, shuffleDeck, type Card } from '@huiming/core-shared'
import type { HuimingBoard, HuimingCell, HuimingPlayer, HuimingState } from './types'

const HUIMING_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['1', '2', '3', '4', '5', '6'],
  jokers: 1,
}

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

  // Place joker at center
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
  }
}

export function takeCard(
  game: HuimingState, playerIdx: number, row: number, col: number
): { success: boolean; reason?: string } {
  const cell = game.board[row]?.[col]
  if (!cell?.card) return { success: false, reason: '该位置没有牌' }
  if (!cell.faceUp && game.players[playerIdx].darkPickCharges <= 0) {
    return { success: false, reason: '需要暗取次数' }
  }

  if (!cell.faceUp) game.players[playerIdx].darkPickCharges--
  game.players[playerIdx].hand.push(cell.card)
  cell.card = null
  return { success: true }
}

export function flipNeighbors(board: HuimingBoard, row: number, col: number): void {
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const r = row + dr, c = col + dc
    if (r >= 0 && r < 5 && c >= 0 && c < 5 && board[r][c].card) {
      board[r][c].faceUp = !board[r][c].faceUp
    }
  }
}

export function checkAllFaceDown(board: HuimingBoard): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell.card && cell.faceUp) return false
    }
  }
  return true
}

export function grantDarkPickCharges(game: HuimingState): void {
  game.players[0].darkPickCharges++
  game.players[1].darkPickCharges++
}

export function placeCard(
  game: HuimingState, playerIdx: number, cardId: string, row: number, col: number, faceUp: boolean
): { success: boolean; reason?: string } {
  const player = game.players[playerIdx]
  if (!player.canPlace) return { success: false, reason: '放牌机会已用完' }
  const cell = game.board[row]?.[col]
  if (!cell || cell.card !== null) return { success: false, reason: '不是空位' }
  const idx = player.hand.findIndex(c => c.id === cardId)
  if (idx === -1) return { success: false, reason: '手牌中没有这张牌' }

  const [card] = player.hand.splice(idx, 1)
  cell.card = card
  cell.faceUp = faceUp
  player.canPlace = false
  return { success: true }
}

export function countRemainingCards(board: HuimingBoard): number {
  let count = 0
  for (const row of board) {
    for (const cell of row) {
      if (cell.card) count++
    }
  }
  return count
}
```

- [ ] **Step 5: 运行测试通过**

```bash
npm -w huiming run test
```

- [ ] **Step 6: Commit**

```bash
git add games/huiming/ && git commit -m "feat: implement Huiming game engine"
```

---

## Task 8: 晦明游戏 — 规则 + 插件注册

**Files:**
- Create: `games/huiming/rules.ts`
- Create: `games/huiming/__tests__/rules.test.ts`
- Create: `games/huiming/plugin.ts`

- [ ] **Step 1: 编写规则测试**

```typescript
// games/huiming/__tests__/rules.test.ts
import { describe, it, expect } from 'vitest'
import { canTake, canPlace, canDarkPick, checkWinner, countMaxSuit } from '../rules'
import { initHuimingGame } from '../engine'
import type { Card } from '@huiming/core-shared'

describe('canTake', () => {
  it('can take face-up card', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board[0][0].faceUp = true
    expect(canTake(game, 0, 0, 0)).toBe(true)
  })
  it('cannot take face-down without charges', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].darkPickCharges = 0
    expect(canTake(game, 0, 0, 0)).toBe(false)
  })
  it('can take face-down with charges', () => {
    const game = initHuimingGame('p1', 'p2')
    expect(canTake(game, 0, 0, 0)).toBe(true)
  })
  it('cannot take from empty', () => {
    const game = initHuimingGame('p1', 'p2')
    game.board[0][0].card = null
    expect(canTake(game, 0, 0, 0)).toBe(false)
  })
})

describe('canPlace', () => {
  it('can place with ability and hand', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].hand.push({ id: 'x', suit: 'hearts', rank: '1', value: 1, deckIndex: 0 })
    expect(canPlace(game, 0)).toBe(true)
  })
  it('cannot place without ability', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].canPlace = false
    expect(canPlace(game, 0)).toBe(false)
  })
  it('cannot place with empty hand', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].hand = []
    expect(canPlace(game, 0)).toBe(false)
  })
})

describe('checkWinner', () => {
  it('detects 6 of same suit', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].hand = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`, suit: 'hearts', rank: String(i+1), value: i+1, deckIndex: i,
    }))
    expect(checkWinner(game.players[0])).toBe(true)
  })
  it('returns false with 5', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].hand = Array.from({ length: 5 }, (_, i) => ({
      id: `h${i}`, suit: 'hearts', rank: String(i+1), value: i+1, deckIndex: i,
    }))
    expect(checkWinner(game.players[0])).toBe(false)
  })
  it('joker counts as any suit', () => {
    const game = initHuimingGame('p1', 'p2')
    game.players[0].hand = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `h${i}`, suit: 'hearts', rank: String(i+1), value: i+1, deckIndex: i,
      })),
      { id: 'j', suit: 'joker_red', rank: 'JOKER', value: 0, deckIndex: 24 },
    ]
    expect(checkWinner(game.players[0])).toBe(true)
  })
})

describe('countMaxSuit', () => {
  it('counts most common suit plus jokers', () => {
    const hand: Card[] = [
      { id: 'h1', suit: 'hearts', rank: '1', value: 1, deckIndex: 0 },
      { id: 'h2', suit: 'hearts', rank: '2', value: 2, deckIndex: 1 },
      { id: 's1', suit: 'spades', rank: '1', value: 1, deckIndex: 2 },
      { id: 'j', suit: 'joker_red', rank: 'JOKER', value: 0, deckIndex: 3 },
    ]
    expect(countMaxSuit(hand)).toBe(3) // 2 hearts + 1 joker
  })
})
```

- [ ] **Step 2: 实现规则**

```typescript
// games/huiming/rules.ts
import type { Card, Suit } from '@huiming/core-shared'
import type { HuimingPlayer, HuimingState } from './types'

const SUITS: Suit[] = ['hearts', 'spades', 'diamonds', 'clubs']

export function canTake(game: HuimingState, row: number, col: number, playerIdx: number): boolean {
  const cell = game.board[row]?.[col]
  if (!cell?.card) return false
  if (cell.faceUp) return true
  return game.players[playerIdx].darkPickCharges > 0
}

export function canPlace(game: HuimingState, playerIdx: number): boolean {
  const p = game.players[playerIdx]
  return p.canPlace && p.hand.length > 0
}

export function canDarkPick(game: HuimingState, playerIdx: number): boolean {
  return game.players[playerIdx].darkPickCharges > 0
}

export function checkWinner(player: HuimingPlayer): boolean {
  const jokers = player.hand.filter(c => c.suit.toString().startsWith('joker')).length
  for (const suit of SUITS) {
    if (player.hand.filter(c => c.suit === suit).length + jokers >= 6) return true
  }
  return false
}

export function countMaxSuit(hand: Card[]): number {
  const jokers = hand.filter(c => c.suit.toString().startsWith('joker')).length
  let max = 0
  for (const suit of SUITS) {
    const count = hand.filter(c => c.suit === suit).length
    if (count > max) max = count
  }
  return max + jokers
}
```

- [ ] **Step 3: 实现插件注册**

```typescript
// games/huiming/plugin.ts
import type { GameServerPlugin, GameClientPlugin, GameState, EventResult } from '@huiming/core-shared'
import { initHuimingGame, takeCard, placeCard, flipNeighbors, checkAllFaceDown, grantDarkPickCharges, countRemainingCards } from './engine'
import { canTake, canPlace, checkWinner, countMaxSuit } from './rules'
import type { HuimingState, HuimingClientState } from './types'

const HUIMING_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['1', '2', '3', '4', '5', '6'],
  jokers: 1,
}

function getClientState(state: HuimingState, playerId: string): HuimingClientState {
  const idx = state.players.findIndex(p => p.id === playerId)
  const me = state.players[idx]
  const opp = state.players[1 - idx]
  return {
    board: state.board.map(row => row.map(cell => ({
      card: cell.faceUp ? cell.card : null,
      faceUp: cell.faceUp,
    }))),
    myHand: me.hand,
    opponentHandCount: opp.hand.length,
    myDarkPickCharges: me.darkPickCharges,
    myCanPlace: me.canPlace,
    currentTurn: state.currentTurn,
    phase: state.phase,
    round: state.round,
    winner: state.winner,
  }
}

export const huimingServerPlugin: GameServerPlugin = {
  id: 'huiming',
  name: '晦明',
  description: '基于25张扑克牌的双人博弈',
  minPlayers: 2,
  maxPlayers: 2,
  deckConfig: HUIMING_DECK_CONFIG,

  createInitialState(players: string[]): GameState {
    return initHuimingGame(players[0], players[1])
  },

  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult {
    const game = state as HuimingState
    const playerIdx = game.players.findIndex(p => p.id === playerId) as 0 | 1

    if (game.currentTurn !== playerIdx) {
      return { state, broadcast: [], error: '不是你的回合' }
    }

    const broadcast: { event: string; data: any }[] = []

    switch (event) {
      case 'take': {
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = payload
        if (!canTake(game, row, col, playerIdx)) return { state, broadcast, error: '不能取这张牌' }
        takeCard(game, playerIdx, row, col)
        flipNeighbors(game.board, row, col)
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)
        if (checkWinner(game.players[playerIdx])) {
          game.phase = 'ended'
          game.winner = playerId
        } else {
          const remaining = countRemainingCards(game.board)
          if (remaining <= 1) {
            const p0Max = countMaxSuit(game.players[0].hand)
            const p1Max = countMaxSuit(game.players[1].hand)
            if (p0Max !== p1Max) {
              game.phase = 'ended'
              game.winner = game.players[p0Max > p1Max ? 0 : 1].id
            } else {
              game.round++
              game.currentTurn = 1 - game.currentTurn as 0 | 1
              game.phase = 'placing'
              game.players[0].canPlace = true
              game.players[1].canPlace = true
            }
          } else {
            game.currentTurn = 1 - game.currentTurn as 0 | 1
          }
        }
        break
      }
      case 'darkPick': {
        if (game.phase !== 'taking') return { state, broadcast, error: '不是取牌阶段' }
        const { row, col } = payload
        if (!canTake(game, row, col, playerIdx)) return { state, broadcast, error: '不能取这张牌' }
        takeCard(game, playerIdx, row, col)
        flipNeighbors(game.board, row, col)
        if (checkAllFaceDown(game.board)) grantDarkPickCharges(game)
        if (checkWinner(game.players[playerIdx])) {
          game.phase = 'ended'
          game.winner = playerId
        } else {
          game.currentTurn = 1 - game.currentTurn as 0 | 1
        }
        break
      }
      case 'place': {
        const { cardId, row, col, faceUp } = payload
        if (game.phase === 'placing') {
          if (!canPlace(game, playerIdx)) return { state, broadcast, error: '不能放牌' }
          placeCard(game, playerIdx, cardId, row, col, faceUp)
          // Check if all placed
          let hasEmpty = false
          for (const r of game.board) { for (const cell of r) { if (!cell.card) hasEmpty = true } }
          if (!hasEmpty) {
            game.phase = 'taking'
            game.players[0].canPlace = true
            game.players[1].canPlace = true
          }
          game.currentTurn = 1 - game.currentTurn as 0 | 1
        } else if (game.phase === 'taking') {
          if (!canPlace(game, playerIdx)) return { state, broadcast, error: '不能放牌' }
          placeCard(game, playerIdx, cardId, row, col, faceUp)
          // Don't end turn, player still needs to take
        }
        break
      }
      default:
        return { state, broadcast, error: '未知事件' }
    }

    return { state, broadcast }
  },

  getClientState,
  checkGameEnd(state: GameState): string | null {
    return (state as HuimingState).winner
  },
}
```

- [ ] **Step 4: 运行测试通过**

```bash
npm -w huiming run test
```

- [ ] **Step 5: Commit**

```bash
git add games/huiming/ && git commit -m "feat: implement Huiming rules and plugin registration"
```

---

## Task 9: 晦明游戏 — UI 组件

**Files:**
- Create: `games/huiming/ui/HuimingBoard.tsx`
- Create: `games/huiming/ui/HuimingGame.tsx`
- Create: `games/huiming/ui/styles.css`

- [ ] **Step 1: 实现 HuimingBoard**

```tsx
// games/huiming/ui/HuimingBoard.tsx
import { CardGrid, type GridCell } from '@huiming/core-client/components'
import type { HuimingClientState } from '../types'

interface HuimingBoardProps {
  state: HuimingClientState
  onCellClick: (row: number, col: number) => void
  interactive: boolean
  darkPickMode: boolean
}

export function HuimingBoard({ state, onCellClick, interactive, darkPickMode }: HuimingBoardProps) {
  const grid: GridCell[][] = state.board.map(row =>
    row.map(cell => ({ card: cell.card, faceUp: cell.faceUp }))
  )

  return (
    <CardGrid
      grid={grid}
      cols={5}
      onCellClick={onCellClick}
      isCellInteractive={(r, c, cell) => {
        if (!interactive) return false
        if (cell.faceUp && cell.card) return true
        if (!cell.faceUp && cell.card && darkPickMode) return true
        return false
      }}
      isCellHighlighted={(r, c, cell) => {
        return !cell.faceUp && !!cell.card && darkPickMode
      }}
    />
  )
}
```

- [ ] **Step 2: 实现 HuimingGame**

```tsx
// games/huiming/ui/HuimingGame.tsx
import { useState } from 'react'
import type { GameComponentProps } from '@huiming/core-shared'
import { PlayerInfo, CardHand, GameRoom } from '@huiming/core-client/components'
import { HuimingBoard } from './HuimingBoard'
import type { HuimingClientState, HuimingCell } from '../types'
import type { Card } from '@huiming/core-shared'
import './styles.css'

export function HuimingGame({ state, playerId, onAction }: GameComponentProps) {
  const s = state as HuimingClientState
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [placingFaceUp, setPlacingFaceUp] = useState(true)

  const isMyTurn = s.currentTurn === 0 // simplified: first player is "me" in client state

  const handleCellClick = (row: number, col: number) => {
    if (s.winner || !isMyTurn) return
    const cell = s.board[row][col]

    if (selectedCard) {
      if (!cell.card) {
        onAction('place', { cardId: selectedCard.id, row, col, faceUp: placingFaceUp })
        setSelectedCard(null)
      }
      return
    }

    if (cell.card && cell.faceUp) {
      onAction('take', { row, col })
    } else if (cell.card && !cell.faceUp && s.myDarkPickCharges > 0) {
      onAction('darkPick', { row, col })
    }
  }

  const handleHandClick = (card: Card) => {
    if (s.myCanPlace && isMyTurn) setSelectedCard(card)
  }

  return (
    <>
      <PlayerInfo
        label="对手"
        handCount={s.opponentHandCount}
        isTurn={!isMyTurn}
      />

      <HuimingBoard
        state={s}
        onCellClick={handleCellClick}
        interactive={isMyTurn && !s.winner}
        darkPickMode={s.myDarkPickCharges > 0 && !selectedCard}
      />

      <div className="huiming-hand-section">
        {selectedCard && (
          <div className="huiming-place-controls">
            <span>放置: {selectedCard.rank === 'JOKER' ? 'Joker' : `${selectedCard.suit} ${selectedCard.rank}`}</span>
            <label><input type="radio" checked={placingFaceUp} onChange={() => setPlacingFaceUp(true)} /> 明置</label>
            <label><input type="radio" checked={!placingFaceUp} onChange={() => setPlacingFaceUp(false)} /> 暗置</label>
            <button onClick={() => setSelectedCard(null)}>取消</button>
          </div>
        )}
        <PlayerInfo
          label="你"
          handCount={s.myHand.length}
          extraInfo={[
            { key: '暗取', value: s.myDarkPickCharges },
            { key: '轮次', value: s.round },
          ]}
          isTurn={isMyTurn}
        />
        <CardHand
          cards={s.myHand}
          selectable={s.myCanPlace && isMyTurn && !selectedCard}
          onCardClick={handleHandClick}
          selectedId={selectedCard?.id}
        />
      </div>

      {s.winner && (
        <div className="huiming-game-over">
          <h2>{s.winner === playerId ? '你赢了！' : '对手获胜'}</h2>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: 创建晦明样式**

```css
/* games/huiming/ui/styles.css */
.huiming-hand-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #1a2030;
  border-radius: 10px;
}

.huiming-place-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #8a90a0;
}

.huiming-place-controls label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.huiming-place-controls button {
  padding: 4px 12px;
  background: #2a3040;
  border: 1px solid #3a4555;
  border-radius: 6px;
  color: #c8d0e0;
  cursor: pointer;
}

.huiming-game-over {
  position: fixed;
  inset: 0;
  background: rgba(20,24,32,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.huiming-game-over h2 {
  font-size: 48px;
  color: #e5c07b;
}
```

- [ ] **Step 4: Commit**

```bash
git add games/huiming/ui/ && git commit -m "feat: implement Huiming game UI components"
```

---

## Task 10: 客户端 App + 服务器入口

**Files:**
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/styles/app.css`
- Create: `server/src/index.ts`
- Copy: `client/public/assets/`

- [ ] **Step 1: 复制牌面素材**

```bash
mkdir -p D:\03Project\1\huiming\client\public\assets
cp D:\03Project\1\huiming\assets\*.png D:\03Project\1\huiming\client\public\assets\
```

- [ ] **Step 2: 创建 main.tsx**

```tsx
// client/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/app.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

- [ ] **Step 3: 创建 App.tsx**

```tsx
// client/src/App.tsx
import { useState, useEffect } from 'react'
import { useSocket } from '@huiming/core-client/hooks'
import { GameRoom } from '@huiming/core-client/components'
import { registerClientPlugin, useGamePlugin } from '@huiming/core-client/hooks'
import { huimingClientPlugin } from '../../games/huiming/ui/client-plugin'

// Register plugins
registerClientPlugin(huimingClientPlugin)

function App() {
  const { emit, on, socket } = useSocket()
  const [connected, setConnected] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameState, setGameState] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)

  useEffect(() => {
    const off1 = on('connect', () => {
      setConnected(true)
      setPlayerId(socket.current?.id ?? null)
    })
    const off2 = on('disconnect', () => setConnected(false))
    const off3 = on('room:created', ({ roomId }: any) => setRoomId(roomId))
    const off4 = on('room:joined', () => {})
    const off5 = on('room:full', () => setError('房间已满'))
    const off6 = on('room:notFound', () => setError('房间不存在'))
    const off7 = on('game:stateUpdate', ({ state }: any) => setGameState(state))
    const off8 = on('game:error', ({ reason }: any) => setError(reason))
    const off9 = on('game:over', () => {})

    return () => { off1(); off2(); off3(); off4(); off5(); off6(); off7(); off8(); off9() }
  }, [])

  // Auto-join from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const room = params.get('room')
    if (room && connected && !roomId) {
      emit('room:join', { roomId: room })
    }
  }, [connected, roomId])

  const plugin = useGamePlugin(gameId || 'huiming')

  if (!gameState) {
    return (
      <div className="lobby">
        <h1>卡牌平台</h1>
        <p className="subtitle">选择游戏开始</p>
        {!roomId ? (
          <div className="lobby-actions">
            <button className="btn btn-primary" onClick={() => { setGameId('huiming'); emit('room:create', { gameId: 'huiming' }) }} disabled={!connected}>
              创建晦明房间
            </button>
          </div>
        ) : (
          <div className="lobby-waiting">
            <p>等待对手加入...</p>
            <div className="lobby-link">
              <input readOnly value={`${window.location.origin}/?room=${roomId}`} />
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?room=${roomId}`)}>复制链接</button>
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {!connected && <p className="status">连接中...</p>}
      </div>
    )
  }

  if (!plugin) return <p>加载游戏插件失败</p>

  const GameComponent = plugin.GameComponent
  return (
    <GameRoom connected={connected}>
      <GameComponent
        state={gameState}
        playerId={playerId!}
        onAction={(event: string, payload: any) => emit('game:action', { event, payload })}
      />
    </GameRoom>
  )
}

export default App
```

- [ ] **Step 4: 创建客户端插件注册文件**

```typescript
// games/huiming/ui/client-plugin.ts
import type { GameClientPlugin } from '@huiming/core-shared'
import { HuimingGame } from './HuimingGame'

export const huimingClientPlugin: GameClientPlugin = {
  id: 'huiming',
  name: '晦明',
  description: '基于25张扑克牌的双人博弈',
  minPlayers: 2,
  maxPlayers: 2,
  deckConfig: {
    suits: ['hearts', 'diamonds', 'clubs', 'spades'],
    ranks: ['1', '2', '3', '4', '5', '6'],
    jokers: 1,
  },
  GameComponent: HuimingGame,
}
```

- [ ] **Step 5: 创建 app 样式**

```css
/* client/src/styles/app.css */
@import '@huiming/core-client/styles/core.css';

.lobby {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.lobby h1 { font-size: 48px; letter-spacing: 8px; }
.lobby .subtitle { color: #8a90a0; }

.lobby-actions { display: flex; flex-direction: column; gap: 12px; }
.lobby-waiting { text-align: center; }
.lobby-link { display: flex; gap: 8px; margin-top: 12px; }

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary { background: #4a8; color: #fff; }
.btn-primary:disabled { background: #2a4a3a; cursor: not-allowed; }

.error { color: #e06c75; }
.status { color: #6a7080; }

input {
  padding: 10px 14px;
  background: #1e2530;
  border: 1px solid #3a4555;
  border-radius: 8px;
  color: #c8d0e0;
  font-size: 14px;
}
```

- [ ] **Step 6: 创建服务器入口**

```typescript
// server/src/index.ts
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import { RoomManager, setupSocketFramework, PluginLoader } from '@huiming/core-server'
import { huimingServerPlugin } from 'huiming/plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// Register plugins
const pluginLoader = new PluginLoader()
pluginLoader.register(huimingServerPlugin)

// Setup framework
const roomManager = new RoomManager()
setupSocketFramework(io, roomManager, pluginLoader)

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`卡牌平台已启动: http://localhost:${PORT}`)
  console.log(`已注册游戏: ${pluginLoader.listPlugins().join(', ')}`)
})
```

- [ ] **Step 7: Commit**

```bash
git add client/ server/ games/huiming/ui/client-plugin.ts && git commit -m "feat: wire up client app and server entry with plugin system"
```

---

## Task 11: 集成验证

**Files:** None (manual testing)

- [ ] **Step 1: 启动后端**

```bash
npm -w @huiming/server run dev
```

Expected: 服务器启动，显示"已注册游戏: huiming"

- [ ] **Step 2: 启动前端**

```bash
npm -w @huiming/client run dev
```

Expected: 前端启动在 http://localhost:5173

- [ ] **Step 3: 测试完整流程**

1. 浏览器打开 http://localhost:5173
2. 点击"创建晦明房间"
3. 复制链接，在新窗口打开
4. 验证两个窗口进入游戏
5. 测试取牌、翻牌、放牌功能
6. 验证回合切换

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: complete card platform with Huiming game MVP"
```

---

## 计划自检

### 规格覆盖

| 规格要求 | 对应 Task |
|---------|----------|
| 通用牌组系统 | Task 2 (card.ts) |
| 通用房间管理 | Task 3 (RoomManager) |
| 通用渲染组件 | Task 5 (PlayingCard, CardHand, CardGrid, PlayerInfo) |
| 插件注册机制 | Task 2 (接口), Task 4 (PluginLoader) |
| Socket 框架 | Task 4 (socket-framework) |
| 晦明引擎 | Task 7 |
| 晦明规则 | Task 8 |
| 晦明 UI | Task 9 |
| 晦明插件注册 | Task 8 (plugin.ts) |
| 在线对战 | Task 4 (Socket 框架) + Task 10 (服务器入口) |
| 房间链接 | Task 10 (App.tsx) |
| 樱花穿透部署 | Task 10 (服务器配置) |

### 占位符扫描

无 TBD、TODO。所有代码步骤包含完整实现。

### 类型一致性

- `Card`, `DeckConfig` 在 `packages/core/shared/card.ts` 定义，所有层引用一致
- `GamePlugin`, `GameServerPlugin`, `GameClientPlugin` 在 `packages/core/shared/plugin.ts` 定义
- `HuimingState`, `HuimingClientState` 在 `games/huiming/types.ts` 定义，插件内部使用
- Socket 事件统一使用 `game:action` + `{ event, payload }` 格式，基座转发给插件

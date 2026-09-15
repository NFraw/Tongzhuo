# 技术栈学习指南（实用导向）

> 本文档面向有 C/C++/Java 基础的开发者，通过 Tongzhuo 项目学习 TypeScript、React、Node.js、Socket.IO、PixiJS、GSAP、Electron。
>
> 阅读本文档前，建议先通读项目中已注释的核心代码文件。

---

## 目录

1. [TypeScript — JavaScript 的"类型安全版"](#1-typescript)
2. [React — 声明式 UI 框架](#2-react)
3. [Node.js — 服务端 JavaScript 运行时](#3-nodejs)
4. [Socket.IO — 实时双向通信](#4-socketio)
5. [PixiJS — 2D WebGL 渲染引擎](#5-pixijs)
6. [GSAP — 高性能动画库](#6-gsap)
7. [Electron — 桌面应用打包](#7-electron)
8. [项目架构总览](#8-项目架构总览)
9. [常见开发模式速查](#9-常见开发模式速查)

---

## 1. TypeScript

### 1.1 一句话理解

TypeScript = JavaScript + 静态类型系统。编译后变成纯 JavaScript 运行。

类比 C++：TypeScript 之于 JavaScript，就像带类型的 C 之于无类型的脚本语言。编译时检查类型，运行时没有额外开销。

### 1.2 核心概念对照表

| TypeScript | C++/Java | 示例 |
|-----------|----------|------|
| `interface` | `class`（纯虚/接口） | `interface Card { id: string; suit: Suit }` |
| `type` | `typedef` / `using` | `type Suit = 'hearts' \| 'spades'` |
| `enum` | `enum` | `enum HandType { Single, Pair }` |
| `class` | `class` | `class RoomManager { ... }` |
| `const` | `const` | `const PI = 3.14` |
| `let` | 局部变量 | `let count = 0` |
| `function` | 函数 | `function add(a: number, b: number): number` |
| `=>` (箭头函数) | Lambda / 函数指针 | `const f = (x: number) => x * 2` |
| `?` (可选) | 指针可为 null | `interface O { name?: string }` |
| `!` (非空断言) | `assert(ptr != null)` | `el!.play()` |
| `as` 类型转换 | `static_cast<T>()` | `state as LandlordState` |
| 泛型 `T<T>` | 模板 `template<T>` | `Map<string, Card>` |
| `any` | `void*`（危险，尽量避免） | `payload: any` |
| `unknown` | 安全的 `void*` | 需要先检查类型才能使用 |

### 1.3 项目中的实际用法

```typescript
// 1. 接口定义（types.ts）
interface Card {
  id: string        // 每张牌的唯一标识
  suit: Suit        // 花色
  rank: string      // 点数
  value: number     // 数值（用于比较大小）
}

// 2. 联合类型（类似 C++ 的 union，但更安全）
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
type Phase = 'waiting' | 'playing' | 'ended'

// 3. 泛型函数
function find<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  return arr.find(predicate)
}

// 4. 类型断言（当 TypeScript 无法自动推断时）
const game = state as LandlordState

// 5. 可选链（安全访问可能为 null 的属性）
const card = cell?.card  // 如果 cell 为 null/undefined，card 为 undefined
```

### 1.4 你需要知道的"坑"

1. **TypeScript 只在编译时检查**——运行时仍然是 JavaScript，没有类型安全。
2. **`any` 是逃生舱**——用它会关闭类型检查，尽量用 `unknown` 代替。
3. **接口 vs 类型**——`interface` 可以被 `implements`，`type` 可以做联合类型。大多数情况可以互换。

### 1.5 项目文件速查

- `packages/core/shared/types.ts` — 所有共享类型定义
- `games/landlord/types.ts` — 斗地主游戏类型
- `packages/core/shared/plugin.ts` — 插件接口定义（interface 的好例子）

---

## 2. React — 声明式 UI 框架

### 2.1 一句话理解

React = 用"状态"驱动 UI 更新的框架。你声明"UI 应该长什么样"，React 自动计算差异并更新 DOM。

类比 Java Swing：Swing 你手动调 `button.setText("new")`，React 你只管改状态，UI 自动更新。

### 2.2 核心概念

#### 组件 = 函数

```tsx
// 一个 React 组件就是一个返回 JSX 的函数
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>
}

// 使用：像 HTML 标签一样
<Greeting name="Alice" />
```

#### 状态 = `useState`

```tsx
// useState 返回 [当前值, 修改函数]
const [count, setCount] = useState(0)

// 修改状态 → 触发组件重新渲染
setCount(count + 1)
```

类比 C++：想象一个 `int count`，每次修改它时，所有用到它的 UI 自动重绘。

#### 副作用 = `useEffect`

```tsx
// 组件挂载时执行，卸载时清理
useEffect(() => {
  const handler = () => console.log('clicked')
  window.addEventListener('click', handler)
  return () => window.removeEventListener('click', handler)  // 清理
}, [])  // 空依赖数组 = 只在挂载/卸载时执行
```

类比 Java：`useEffect` 的清理函数就像 `finally` 块或 `AutoCloseable.close()`。

#### 引用 = `useRef`

```tsx
// useRef 持有一个可变值，修改它不会触发重渲染
const socketRef = useRef<Socket | null>(null)
socketRef.current = io(url)  // 修改不会触发重渲染
```

类比 C++：`useRef` 就像一个指针，指向一个持久化的值。

### 2.3 项目中的关键模式

#### 模式 1：状态驱动 UI

```tsx
// App.tsx — phase 状态决定显示哪个页面
const [phase, setPhase] = useState<AppPhase>('connect')

if (phase === 'connect') return <ConnectPage />
if (phase === 'lobby') return <LobbyPage />
if (phase === 'playing') return <GamePage />
```

#### 模式 2：事件监听 + 清理

```tsx
// App.tsx — 注册 Socket.IO 事件监听
useEffect(() => {
  const cleanups = [
    on('room:created', (data) => { setRoom(data); setPhase('room') }),
    on('game:stateUpdate', ({ state }) => { setGameState(state) }),
  ]
  return () => cleanups.forEach(fn => fn())  // 卸载时清理
}, [on, connected])
```

#### 模式 3：回调传递

```tsx
// 父组件传递操作函数给子组件
<GameComponent
  state={gameState}
  onAction={(event, payload) => emit('game:action', { event, payload })}
/>
```

### 2.4 JSX 语法速查

```tsx
// 条件渲染
{error && <div className="error">{error}</div>}

// 列表渲染
{items.map(item => <li key={item.id}>{item.name}</li>)}

// 事件处理
<button onClick={() => doSomething()}>Click</button>

// 样式（对象形式）
<div style={{ position: 'absolute', top: 0 }}>...</div>
```

### 2.5 项目文件速查

- `client/src/App.tsx` — 根组件，应用状态管理
- `games/landlord/ui/LandlordGame.tsx` — 游戏组件（React + PixiJS 混合）
- `packages/core/client/hooks/useSocket.ts` — 自定义 Hook（Socket.IO 连接管理）
- `packages/core/client/hooks/useAudio.ts` — 自定义 Hook（音频管理）

---

## 3. Node.js — 服务端 JavaScript 运行时

### 3.1 一句话理解

Node.js = Chrome V8 引擎 + 文件/网络等系统 API。让 JavaScript 可以在服务器上运行。

类比 Java：Node.js 之于 JavaScript，就像 JVM 之于 Java。但 Node.js 是单线程的（用异步 I/O 代替多线程）。

### 3.2 核心概念

#### 模块系统

```typescript
// 导出（类似 Java 的 public）
export function createRoom(player: RoomPlayer): Room { ... }
export class RoomManager { ... }

// 导入（类似 Java 的 import）
import { createRoom } from './room-manager'
import type { Card } from '@tongzhuo/core-shared'  // type-only import
```

#### npm + workspaces

```
huiming/
├── package.json          ← 根配置（定义 workspaces）
├── packages/
│   └── core/
│       ├── shared/       ← 共享代码（前后端共用）
│       ├── client/       ← 客户端库
│       └── server/       ← 服务端库
├── games/
│   ├── landlord/         ← 斗地主游戏
│   ├── huiming/          ← 晦明游戏
│   └── nimmt/            ← 牛头人游戏
└── client/               ← 前端应用
```

类比 Java：npm workspaces ≈ Maven 多模块项目。每个子目录是一个独立的包，可以互相引用。

#### 异步编程

```typescript
// async/await — 异步代码写起来像同步
async function init() {
  const app = new Application()
  await app.init({ ... })  // 等待初始化完成
  return app
}

// 回调（Node.js 传统风格）
fs.readFile('data.txt', (err, data) => {
  if (err) console.error(err)
  else console.log(data)
})

// Promise（async/await 的底层）
const result = new Promise((resolve, reject) => {
  setTimeout(() => resolve('done'), 1000)
})
```

类比 C++：`async/await` ≈ `co_await`（C++20 协程），都是让异步代码看起来像同步。

### 3.3 项目中的 Node.js 用法

- **服务器入口**：`server/src/index.ts` — 启动 HTTP 服务器 + Socket.IO
- **数据库**：`packages/core/server/db.ts` — SQLite（better-sqlite3）
- **文件系统**：`packages/core/server/server-config.ts` — 读写配置文件
- **加密**：`packages/core/server/user-store.ts` — 密码哈希（scrypt）、Token 签名（HMAC）

### 3.4 你需要知道的"坑"

1. **单线程**——Node.js 主线程是单线程的，长时间计算会阻塞所有请求。用 Worker Threads 或子进程处理 CPU 密集任务。
2. **异步无处不在**——数据库查询、文件读写、网络请求都是异步的。忘记 `await` 是常见 bug。
3. **`node_modules` 很大**——这是正常的。`npm install` 会下载所有依赖到 `node_modules/`。

---

## 4. Socket.IO — 实时双向通信

### 4.1 一句话理解

Socket.IO = WebSocket + 自动重连 + 房间管理 + 事件系统。让客户端和服务器可以实时互发消息。

类比 C++ Socket 编程：Socket.IO 封装了底层的 TCP/WebSocket，提供高层的"事件"接口，类似 RPC（远程过程调用）。

### 4.2 核心 API

```typescript
// ─── 服务器端（socket-framework.ts） ───
io.on('connection', (socket) => {
  // 监听事件
  socket.on('player:hello', (data) => { ... })
  socket.on('room:create', (data) => { ... })
  socket.on('game:action', (data) => { ... })

  // 发送给特定客户端
  socket.emit('player:welcome', { playerId, games })

  // 发送给房间内所有人
  io.to(roomId).emit('game:stateUpdate', { state })

  // 断开事件
  socket.on('disconnect', () => { ... })
})

// ─── 客户端（useSocket.ts） ───
const socket = io('http://server:3000', {
  auth: { token: 'xxx', clientVersion: '1.7.0' }
})

// 发送事件
socket.emit('room:create', { gameId: 'landlord' })

// 监听事件
socket.on('game:stateUpdate', (data) => { ... })
```

### 4.3 项目中的事件流

```
客户端                          服务器
  │                               │
  │── room:create ──────────────→ │ 创建房间
  │                               │
  │←── room:created ──────────── │ 返回房间信息
  │                               │
  │── room:join ────────────────→ │ 加入房间
  │                               │
  │←── room:updated ──────────── │ 广播给所有人
  │                               │
  │── game:action(play) ────────→ │ 处理出牌
  │                               │
  │←── game:stateUpdate ──────── │ 广播新状态
  │←── game:stateUpdate ──────── │ (每个玩家看到不同视角)
```

### 4.4 认证流程

```
客户端                          服务器
  │                               │
  │── io(url, {auth:{token}}) ──→ │ 中间件验证
  │                               │   1. 检查服务器密码
  │                               │   2. 检查版本兼容
  │                               │   3. 验证 Token
  │                               │
  │   验证失败：connect_error     │
  │   验证成功：connect + welcome │
  │                               │
  │── player:hello ─────────────→ │ 握手（发送 playerId + 昵称）
```

### 4.5 项目文件速查

- `packages/core/server/socket-framework.ts` — 服务器端 Socket.IO 框架
- `packages/core/client/hooks/useSocket.ts` — 客户端 Socket.IO Hook
- `packages/core/server/room-manager.ts` — 房间管理器

---

## 5. PixiJS — 2D WebGL 渲染引擎

### 5.1 一句话理解

PixiJS = 用 WebGL（GPU 加速）在浏览器中绘制 2D 图形。比 DOM/Canvas 2D 快得多，适合游戏和动画。

类比 C++：PixiJS 之于浏览器 2D 渲染，就像 SDL/SFML 之于桌面 2D 渲染。

### 5.2 核心概念

```typescript
// 1. Application — 应用入口
const app = new Application()
await app.init({ width: 800, height: 600, background: '#1a1a2e' })

// 2. Stage — 场景图根节点（所有可见对象的容器）
app.stage.addChild(sprite)

// 3. Sprite — 可见的 2D 对象（图片/纹理）
const sprite = new Sprite(texture)
sprite.x = 100        // 位置
sprite.y = 200
sprite.scale.set(0.5) // 缩放
sprite.rotation = 0.5 // 旋转（弧度）
sprite.alpha = 0.8    // 透明度

// 4. Container — 容器（类似 div，可以包含子对象）
const container = new Container()
container.addChild(sprite1)
container.addChild(sprite2)
container.sortableChildren = true  // 允许 zIndex 排序
sprite1.zIndex = 1

// 5. Texture — 纹理（GPU 中的图片数据）
const texture = Texture.from(canvas)  // 从 canvas 创建
const texture = Texture.from('image.png')  // 从文件加载
```

### 5.3 项目中的架构

```
GameCanvas.tsx (React 宿主)
  │
  ├── new Application()  ← PixiJS 应用
  │
  ├── BaseGameRenderer   ← 抽象基类（按需渲染循环）
  │   └── LandlordRenderer  ← 斗地主渲染器
  │       ├── background     (Sprite)     — 牌桌背景
  │       ├── layerOppBacks  (Container)  — 对手牌背
  │       ├── layerBottom    (Container)  — 底牌
  │       ├── layerLastPlay  (Container)  — 出牌区
  │       ├── layerHand      (Container)  — 我的手牌
  │       └── layerUI        (Container)  — 回合指示器
  │
  ├── SpritePool          ← 对象池（复用 Sprite）
  ├── TextureFactory      ← 纹理工厂（canvas 光栅化）
  └── layout.ts           ← 纯布局计算
```

### 5.4 关键设计：按需渲染

```typescript
// 不是每帧都渲染（60fps 空跑很浪费）
// 而是只在有动画或新状态时才渲染

private renderTick = (): void => {
  const active = this.hasActiveTweens()  // 有活跃动画？
  if (this._needsRender || active || this._hadActiveTweens) {
    this.app.renderer.render(this.app.stage)  // 手动渲染一帧
  }
}
```

### 5.5 项目文件速查

- `packages/core/client/renderer/GameCanvas.tsx` — React 宿主组件
- `packages/core/client/renderer/BaseGameRenderer.ts` — 抽象基类
- `packages/core/client/renderer/SpritePool.ts` — 对象池
- `packages/core/client/renderer/TextureFactory.ts` — 纹理工厂
- `games/landlord/ui/renderer/LandlordRenderer.ts` — 斗地主渲染器
- `games/landlord/ui/renderer/layout.ts` — 布局计算

---

## 6. GSAP — 高性能动画库

### 6.1 一句话理解

GSAP = GreenSock Animation Platform。让任何 JavaScript 对象的属性随时间平滑变化。

类比 C++：想象一个插值函数 `lerp(start, end, t)`，GSAP 自动管理 `t` 的变化曲线和时间。

### 6.2 核心 API

```typescript
import { gsap } from 'gsap'

// 基本补间：让 sprite.x 从当前位置平滑变化到 300
gsap.to(sprite, { x: 300, duration: 0.5, ease: 'power2.out' })

// 从某值开始动画
gsap.from(sprite, { alpha: 0, duration: 0.3 })

// 指定起止值
gsap.fromTo(sprite.scale,
  { x: 1.7, y: 1.7 },   // 起始
  { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' }  // 结束
)

// 延迟和交错
gsap.to(sprite, { y: 100, delay: 0.12 })  // 延迟 120ms

// 杀死动画（中断）
gsap.killTweensOf(sprite)           // 杀死该对象的所有动画
gsap.killTweensOf(sprite, 'x,y')   // 只杀 x/y 属性的动画

// 回调
gsap.to(sprite, {
  alpha: 0,
  onComplete: () => pool.release(sprite),  // 动画结束时
})
```

### 6.3 缓动函数速查

| ease | 效果 | 用途 |
|------|------|------|
| `'power2.out'` | 先快后慢 | 通用移动 |
| `'power2.in'` | 先慢后快 | 离场动画 |
| `'back.out(1.2)'` | 回弹效果 | 弹入动画 |
| `'power1.out'` | 轻微减速 | BGM 淡入淡出 |

### 6.4 项目中的动画模式

```typescript
// 模式 1：属性动画
gsap.to(sprite, { x: 100, y: 200, alpha: 1, duration: 0.3 })

// 模式 2：缩放动画（翻牌效果）
gsap.to(sprite.scale, {
  x: 0, duration: 0.15,
  onComplete: () => {
    sprite.texture = newTexture
    gsap.to(sprite.scale, { x: 1, duration: 0.15 })
  }
})

// 模式 3：交错动画（发牌）
let delay = 0
for (const card of cards) {
  gsap.to(card.sprite, { y: targetY, alpha: 1, delay, duration: 0.3 })
  delay += 0.06  // 每张牌间隔 60ms
}

// 模式 4：BGM 淡入淡出
gsap.to(audioElement, { volume: 0.8, duration: 0.4, ease: 'power1.out' })
```

### 6.5 项目文件速查

- `games/landlord/ui/renderer/LandlordRenderer.ts` — 所有斗地主动画
- `packages/core/client/hooks/useAudio.ts` — BGM 淡入淡出

---

## 7. Electron — 桌面应用打包

### 7.1 一句话理解

Electron = Chromium（浏览器）+ Node.js。让 Web 应用可以打包成桌面 .exe/.app。

类比 Java：Electron 之于 Web 应用，就像 JAR 之于 Java 应用——把代码和运行时打包在一起。

### 7.2 项目中的 Electron 结构

```
desktop/
├── main.js        ← Electron 主进程（创建窗口、管理生命周期）
├── package.json   ← 桌面应用配置（名称、版本、入口）
└── preload.js     ← 预加载脚本（安全沙箱）
```

### 7.3 main.js 核心逻辑

```javascript
const { app, BrowserWindow } = require('electron')

// 创建窗口，加载前端应用
const win = new BrowserWindow({ width: 1280, height: 800 })
win.loadFile('../client/dist/index.html')

// 保持硬件加速开启（PixiJS WebGL 需要 GPU）
// 不要调 app.disableHardwareAcceleration()
```

### 7.4 打包命令

```bash
cd desktop
npm run build    # 打包成 .exe（Windows）或 .app（macOS）
```

### 7.5 项目文件速查

- `desktop/main.js` — Electron 主进程
- `desktop/package.json` — 打包配置

---

## 8. 项目架构总览

### 8.1 数据流

```
┌─────────────────────────────────────────────────────────┐
│                    客户端（浏览器/Electron）                │
│                                                          │
│  App.tsx (状态管理)                                       │
│    ├── useSocket (Socket.IO 连接)                        │
│    ├── useAudio (BGM + 语音)                             │
│    └── GameComponent (游戏视图)                           │
│          ├── LandlordGame.tsx (React HUD)                │
│          └── GameCanvas → LandlordRenderer (PixiJS)      │
│                                                          │
└───────────────────────┬─────────────────────────────────┘
                        │ Socket.IO (WebSocket)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    服务器（Node.js）                       │
│                                                          │
│  socket-framework.ts (事件路由 + 认证)                   │
│    ├── room-manager.ts (房间管理)                        │
│    ├── user-store.ts (用户数据)                          │
│    └── GameServerPlugin (游戏逻辑)                       │
│          ├── landlord/plugin.ts (斗地主)                 │
│          ├── huiming/plugin.ts (晦明)                    │
│          └── nimmt/plugin.ts (牛头人)                    │
│                                                          │
│  SQLite (huiming.db)                                     │
└─────────────────────────────────────────────────────────┘
```

### 8.2 插件系统

```
GameServerPlugin (服务器)
  ├── createInitialState(players) → GameState
  ├── handleEvent(state, playerId, event, payload) → EventResult
  ├── getClientState(state, playerId) → ClientState
  └── checkGameEnd(state) → winner | null

GameClientPlugin (客户端)
  ├── GameComponent — React 组件
  ├── renderer? — 可选的 PixiJS 渲染器工厂
  └── assets? — 资源映射
```

添加新游戏只需：
1. 在 `games/` 下创建新目录
2. 实现 `GameServerPlugin`（4 个方法）
3. 实现 `GameClientPlugin`（React 组件 + 可选渲染器）
4. 在 `server/src/index.ts` 和 `client/src/App.tsx` 中注册

---

## 9. 常见开发模式速查

### 9.1 Hook 模式（React）

```typescript
// 自定义 Hook：封装可复用的状态逻辑
function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  const connect = useCallback((url: string) => {
    socketRef.current = io(url)
    socketRef.current.on('connect', () => setConnected(true))
  }, [])

  return { connect, connected, emit: socketRef.current?.emit }
}
```

### 9.2 对象池模式（PixiJS）

```typescript
// 避免频繁 new/destroy，减少 GC 压力
class SpritePool {
  acquire(texture: Texture): Sprite {
    const sprite = this.pool.pop() || new Sprite(texture)
    sprite.texture = texture
    sprite.visible = true
    return sprite
  }
  release(sprite: Sprite): void {
    sprite.visible = false
    this.pool.push(sprite)
  }
}
```

### 9.3 状态机模式（游戏逻辑）

```typescript
// 用 switch/case 实现状态转换
switch (event) {
  case 'bid': {
    if (game.currentPhase !== 'bidding') return error
    // 处理叫分逻辑...
    break
  }
  case 'play': {
    if (game.currentPhase !== 'playing') return error
    // 处理出牌逻辑...
    break
  }
}
```

### 9.4 事件驱动模式（Socket.IO）

```typescript
// 服务器：注册事件处理器
socket.on('room:create', (data) => {
  const room = roomManager.createRoom(...)
  socket.emit('room:created', room)
})

// 客户端：监听事件更新 UI
on('room:created', (data) => {
  setRoom(data)
  setPhase('room')
})
```

---

## 附录：快速查找

| 想做什么 | 看哪个文件 |
|---------|-----------|
| 修改卡牌外观 | `TextureFactory.ts` → `drawFace()` |
| 修改手牌排列 | `layout.ts` → `computeLayout()` |
| 修改出牌动画 | `LandlordRenderer.ts` → `syncLastPlay()` |
| 修改游戏规则 | `games/*/rules.ts` + `engine.ts` |
| 添加新游戏 | 参考 `games/landlord/` 的结构 |
| 修改 BGM | `useAudio.ts` + `public/audio/bgm/` |
| 修改服务器配置 | `server-config.ts` |
| 修改用户系统 | `user-store.ts` |
| 修改认证流程 | `socket-framework.ts` 中间件 |
| 修改房间逻辑 | `room-manager.ts` |
| 打包桌面应用 | `desktop/` 目录 |

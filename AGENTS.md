# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 开发流程分级（先读这一节）

本项目**不套用重型多 agent 仪式**，按改动规模选择流程，默认走最轻的一级。

依据（实测一次典型的 4 文件改动）：会话 97.7% 的 token 花在「每轮重发整个上下文」，输出只占 1%。成本 ≈ 轮数 × 上下文大小。派 subagent 要从零重建上下文，是最大的成本放大器。

| 级别 | 触发条件 | 流程 |
|------|----------|------|
| **A** | 1–2 个文件、没有设计决策（改 bug、调文案、小重构） | 直接改 → 跑相关测试 → 报告。不写文档，不派 agent。 |
| **B** | 3–8 个文件，或一个模块内部的行为变更 | 对话里给一份短计划（文件清单 + 接口签名 + 验收标准，**不贴完整代码**）→ 直接实现 → 收尾做一次独立验证 |
| **C** | 新子系统、改接口契约（如 `GameServerPlugin`）、动 socket / 认证 / 数据库等基础设施 | 完整流程：设计讨论 → spec 文档 → 计划 → 逐任务实现 |

不确定级别时**往轻的选**——发现低估了再升级，比一开始就走重流程便宜。

### 明确不要做

- **不要在计划文档里复述完整代码。** 同一份代码写两遍、读多遍是纯浪费；给签名和验收标准即可。
- **不要为每个任务派「实现 + 规格审查 + 质量审查」三个 agent。** 一次改动收尾时做一次验证就够。
- **不要保留跨功能的巨型会话。** 一个功能做完就重开，别让无关历史进入后续每一轮的上下文。

### 始终保留（这是质量的来源，不要砍）

1. **改动前的设计确认** —— 有歧义、影响游戏规则或接口契约时先问清楚再动手（口头即可，不落文档）。
2. **逻辑代码的 TDD** —— 先写失败测试再实现。适用于引擎、规则、状态机、数据转换；纯 UI 样式和文案不需要。
3. **收尾前的独立验证** —— 声明完成前必须实际跑测试 / 构建。自己跑过的检查不算独立验证。
4. **持久记忆 / 笔记的维护** —— 记录用户偏好、被否决的方案、外部系统指针。

## Commands

```bash
# Development (starts both server on :3000 and client on :5173)
npm run dev

# Run individually
npm run dev:server   # server with tsx watch
npm run dev:client   # Vite dev server

# Build for production (client → server/public)
npm run build

# Run all tests
npm run test

# Run a single game's tests
cd games/landlord && npx vitest run
cd games/huiming && npx vitest run
cd games/nimmt && npx vitest run

# Run core server tests
cd packages/core/server && npx vitest run

# Desktop
npm run desktop          # launch Electron
npm run desktop:build    # build client + Electron app
```

No linter or formatter is configured in this project.

## Architecture

This is an **npm workspaces monorepo** with a plugin-based game system. The core platform (rooms, sockets, auth) is game-agnostic; each game is a plugin.

### Package dependency flow

```
core/shared  ←  core/server  ←  server/ (entry point)
core/shared  ←  core/client  ←  client/ (React SPA)
core/shared  ←  games/* (each game plugin)
core/server  ←  desktop/ (Electron wrapper)
```

### Plugin contract (`packages/core/shared/plugin.ts`)

Every game implements two interfaces:

**Server side — `GameServerPlugin`** (4 methods):
- `createInitialState(players)` → full game state
- `handleEvent(state, playerId, event, payload)` → `EventResult` (new state + optional broadcast messages)
- `getClientState(state, playerId)` → sanitized view per player (hides opponent cards)
- `checkGameEnd(state)` → winner ID or null

**Client side — `GameClientPlugin`**:
- `GameComponent` — React component receiving `GameComponentProps` (state, playerId, onAction, playerNames)
- `renderer?` — optional `GameRendererFactory` for PixiJS canvas rendering

### Game file convention (`games/*/`)

Each game follows this structure:
- `types.ts` — state types (server full state + client sanitized state)
- `engine.ts` — pure functions: `createInitialState()`, state mutation helpers
- `rules.ts` — pure validation: `canTake()`, `isValidPlay()`, `checkWinner()`, etc.
- `plugin.ts` — `GameServerPlugin` implementation (state machine via `switch` on event type)
- `ui/client-plugin.ts` — `GameClientPlugin` implementation
- `ui/*Game.tsx` — React UI component

### Client-server data flow (Socket.IO)

1. Client `onAction(event, payload)` → emits `game:action`
2. `socket-framework.ts` validates (rate limit, room membership, game phase)
3. `plugin.handleEvent()` returns `EventResult` with new state
4. `broadcastState()` calls `plugin.getClientState()` **per player** (private channels, not room broadcast)
5. Each player receives `game:stateUpdate` with their own perspective

### Plugin registration

**Server** (`server/src/index.ts`): pass plugins to `startServer({ plugins: [...] })`
**Client** (`client/src/App.tsx`): `registerClientPluginLoader('name', () => import('game/ui/client-plugin'))`

### Key modules

| Module | Location | Role |
|--------|----------|------|
| SocketFramework | `packages/core/server/socket-framework.ts` | All Socket.IO event handling and middleware |
| RoomManager | `packages/core/server/room-manager.ts` | Room lifecycle, player join/leave, game start |
| UserStore | `packages/core/server/user-store.ts` | Auth (scrypt passwords, HMAC tokens), coin system |
| useSocket | `packages/core/client/hooks/useSocket.ts` | Client socket connection, reconnection, auth |
| GameCanvas | `packages/core/client/renderer/GameCanvas.tsx` | PixiJS canvas host with WebGL fallback |
| BaseGameRenderer | `packages/core/client/renderer/BaseGameRenderer.ts` | Abstract renderer with rAF coalescing |

### Canvas rendering (landlord)

The landlord game uses a dual rendering path: PixiJS canvas (default) with CSS fallback when WebGL is unavailable. `LandlordRenderer` extends `BaseGameRenderer`, using `TextureFactory` (canvas-rasterized card textures) and `SpritePool` (object pooling). React HUD overlays the canvas for buttons and text.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, PixiJS 8, GSAP 3
- **Backend**: Node.js, Express, Socket.IO, better-sqlite3
- **Desktop**: Electron 35, electron-builder
- **Testing**: Vitest 3
- **Protocol version**: `packages/core/shared/version.ts`
- **Default ports**: Server 3000, Client dev 5173
- **Database**: SQLite at `server/data/huiming.db` (WAL mode)

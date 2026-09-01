# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

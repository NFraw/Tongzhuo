**English** | [简体中文](README.md)

# Tongzhuo

An open-source, extensible online multiplayer game platform for party games, card games, board games and social games. Built with TypeScript + React + Node.js + Socket.IO, available in web browsers and as an Electron desktop app, with a plugin system for adding new games.

## Included Games

| Game | Players | Description |
|------|---------|-------------|
| **Huiming** | 2-4 | A strategic 2-4 player game with 25 cards. Cards flip between face-up and face-down — collect 6 of the same suit to win. See [docs/huiming-rules-en.md](docs/huiming-rules-en.md) |
| **Landlord (Dou Di Zhu)** | 3 | Classic Chinese card game with bidding, bombs, and spring mechanics. Features voice chat and animations. |
| **Nimmt!** | 2-10 | Strategic card game — pick a card each round and place it in the right row, avoiding collecting bull heads. |

Adding a game means implementing two interfaces, `GameServerPlugin` and `GameClientPlugin`. The platform itself knows nothing about specific rules, so party, board and social games can all be plugged in the same way.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + PixiJS 8 (Canvas rendering) + GSAP (animations)
- **Backend**: Node.js + Socket.IO + better-sqlite3
- **Desktop**: Electron 35
- **Architecture**: npm workspaces monorepo with a plugin-based game system

## Project Structure

```
tongzhuo/
├── packages/
│   └── core/
│       ├── shared/      # Shared types, card utilities, plugin interfaces
│       ├── server/      # Server: room management, user system, Socket.IO
│       └── client/      # Client: socket connection, UI hooks, canvas renderer framework
├── games/
│   ├── huiming/         # Huiming (engine + rules + plugin)
│   ├── landlord/        # Landlord (engine + rules + plugin + renderer)
│   └── nimmt/           # Nimmt! (engine + rules + plugin)
├── client/              # Web client (React SPA)
├── desktop/             # Electron desktop app
├── server/              # Server entry point
├── docs/                # Documentation
└── cards/               # Card assets
```

## Quick Start

```bash
# Install dependencies
npm install

# Start server (default port 3000)
npm run dev:server

# Start client (default port 5173)
npm run dev:client
```

Open `http://localhost:5173` in your browser, enter a nickname, and join the lobby.

## Documentation

- [Architecture](docs/architecture.md) — System architecture and module responsibilities
- [Design](docs/design.md) — Game design philosophy
- [Learning Guide](docs/learning-guide.md) — TypeScript/React/Node.js/Socket.IO/PixiJS/GSAP/Electron primer
- [Huiming Rules](docs/huiming-rules-en.md) — Huiming game rules
- [Voice Catalog](docs/voice-catalog.md) — Landlord voice asset list

## License

The source code is licensed under the [MIT License](LICENSE).

Note: third-party audio and art assets under `voice/`, `bgm/` and `assets/` (for example the Dou Di Zhu voice lines and background music) are **not** covered by the MIT License and remain the property of their respective owners. Do not use them commercially or redistribute them; replace them before publishing a derivative work.

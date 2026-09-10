**English** | [简体中文](README.md)

# Happy Cards (Huanle Kapai)

An online multiplayer card game platform supporting multiple card games, built with TypeScript + React + Node.js + Socket.IO. Available on web browsers and Electron desktop.

## Games

| Game | Players | Description |
|------|---------|-------------|
| **Huiming** | 2-4 | A strategic 2-4 player game with 25 cards. Cards flip between face-up and face-down — collect 6 of the same suit to win. See [docs/huiming-rules-en.md](docs/huiming-rules-en.md) |
| **Landlord (Dou Di Zhu)** | 3 | Classic Chinese card game with bidding, bombs, and spring mechanics. Features voice chat and animations. |
| **Nimmt!** | 2-10 | Strategic card game — pick a card each round and place it in the right row, avoiding collecting bull heads. |

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + PixiJS 8 (Canvas rendering) + GSAP (animations)
- **Backend**: Node.js + Socket.IO + better-sqlite3
- **Desktop**: Electron 35
- **Architecture**: npm workspaces monorepo with a plugin-based game system

## Project Structure

```
huiming/
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

All rights reserved. Game rules and assets belong to the author. For commercial use or reprints, please contact the author.

[English](README.en.md) | **简体中文**

# 欢乐卡牌

一个支持多种卡牌玩法的在线对战平台，基于 TypeScript + React + Node.js + Socket.IO 构建，支持 Web 浏览器和 Electron 桌面端。

## 包含的玩法

| 玩法 | 人数 | 简介 |
|------|------|------|
| **晦明** | 2-4 人 | 基于 25 张扑克牌的 2~4 人博弈，明暗牌不断翻转，集齐六张同花色即胜。规则见 [docs/huiming-rules.md](docs/huiming-rules.md) |
| **欢乐斗地主** | 3 人 | 经典中国斗地主玩法，支持抢地主、炸弹、春天等机制，配合语音和动画 |
| **牛头人（Nimmt!）** | 2-10 人 | 策略卡牌游戏，每回合选牌并放到合适的行中，避免收集牛头 |

## 技术栈

- **前端**：React 19 + TypeScript + Vite + PixiJS 8（Canvas 渲染）+ GSAP（动画）
- **后端**：Node.js + Socket.IO + better-sqlite3
- **桌面端**：Electron 35
- **架构**：npm workspaces monorepo，插件化游戏系统

## 项目结构

```
huiming/
├── packages/
│   └── core/
│       ├── shared/      # 共享类型、卡牌工具、插件接口
│       ├── server/      # 服务端：房间管理、用户系统、Socket.IO
│       └── client/      # 客户端：Socket 连接、UI hooks、Canvas 渲染框架
├── games/
│   ├── huiming/         # 晦明（引擎 + 规则 + 插件）
│   ├── landlord/        # 欢乐斗地主（引擎 + 规则 + 插件 + 渲染器）
│   └── nimmt/           # 牛头人（引擎 + 规则 + 插件）
├── client/              # Web 客户端（React SPA）
├── desktop/             # Electron 桌面端
├── server/              # 服务端入口
├── docs/                # 文档
└── cards/               # 卡牌素材
```

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务端（默认端口 3000）
npm run dev:server

# 启动客户端（默认端口 5173）
npm run dev:client
```

浏览器打开 `http://localhost:5173`，输入昵称即可进入大厅。

## 文档

- [架构设计](docs/architecture.md) — 整体架构与模块职责
- [设计文档](docs/design.md) — 游戏设计思路
- [学习指南](docs/learning-guide.md) — TypeScript/React/Node.js/Socket.IO/PixiJS/GSAP/Electron 技术栈入门
- [晦明规则](docs/huiming-rules.md) — 晦明玩法规则详解
- [语音目录](docs/voice-catalog.md) — 斗地主语音素材列表

## 许可

保留所有权利。玩法与素材归作者所有，如需商用或转载请联系作者。

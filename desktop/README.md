# Tongzhuo - 桌面版

基于 Electron 的 Tongzhuo 在线多人游戏平台桌面客户端。

## 架构

采用 **Electron 壳 + 内嵌服务器** 架构：

- 主进程启动内嵌的 Tongzhuo 服务器
- `@tongzhuo/core-server` 与 `huiming` 插件先用 esbuild 打包成自包含的 `server.bundle.js`，主进程直接 `require` 它
- 自动分配空闲端口
- 渲染进程通过 HTTP 加载游戏

> 为什么用 esbuild 打包：`@tongzhuo/core-server` / `huiming` 这些 workspace 包只有 TypeScript 源码、无构建产物，Electron 主进程无法直接 `import` 它们。打包成一个 bundle 后 server 逻辑自包含，运行时无需 node_modules。

## 开发

```bash
# 安装依赖（在项目根目录）
npm install

# 开发模式运行
npm run desktop

# 或者进入 desktop 目录
cd desktop
npm run dev
```

## 构建

必须先生成 server bundle，再打包 Electron。`desktop:build` 已串联好完整流程：

```bash
# 完整构建（含 client 构建）——推荐在项目根目录执行
npm run desktop:build

# 或者进入 desktop 目录（需先构建好 client/dist）
cd desktop
npm run build        # 当前平台
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 文件结构

```
desktop/
├── main.js               # Electron 主进程
├── preload.js            # 预加载脚本
├── server-entry.ts       # esbuild 打包入口
├── server.bundle.js      # 构建产物（gitignore）
├── scripts/build-server.js  # esbuild 打包脚本
├── package.json          # 依赖配置
├── electron-builder.yml  # 打包配置
└── README.md
```

## 从 DSH 项目借鉴的设计

- `pickFreePort()` - 预分配空闲端口
- `waitUntilUp()` - HTTP 就绪轮询
- 内嵌服务器架构
- 简洁的 IPC 通信

## 待办

- 提供正式的应用图标（当前使用 Electron 默认图标）

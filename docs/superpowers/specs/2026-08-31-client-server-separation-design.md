# 客户端/服务端分离 — 设计文档

- 日期：2026-08-31
- 主题：桌面客户端去内嵌服务器，改为连接独立服务器；web 前端自动连接自身 origin
- 状态：已获用户确认

## 背景与目标

当前架构中，**桌面客户端（Electron）把后端服务器内嵌进客户端**：打开桌面应用即自动 `startServer()` 拉起一个内嵌的 huiming 服务器（随机端口），客户端再通过 `window.electronAPI?.isDesktop` 自动连接 `127.0.0.1:<随机端口>`。这与"单台服务器被远程 + 本地客户端共同访问"的部署模型冲突。

目标：

1. **单一独立服务器**：`start-server.bat` 启动的游戏后端（托管 web 前端 + socket.io），同时被以下客户端访问：
   - 远程用户：浏览器经内网穿透 NAT 域名打开
   - 本地用户：浏览器 `127.0.0.1:3001` 打开，或桌面客户端连接
2. **桌面客户端去内嵌化**：打开桌面应用不再启动任何后端服务器进程，仅作为瘦客户端连接上述独立服务器。

## 目标架构

```
                    ┌─────────────────────────────┐
   远程用户(浏览器)──►│  独立服务器 start-server.bat   │
   本地用户(浏览器)──►│  (游戏后端 + web前端 + socket.io)│
                    │  固定端口 3001(可配)          │
                    └──────┬─────────▲────────────┘
                    内网穿透域名↘  │LAN IP/localhost│
   (cpolar/frp/ngrok)        │         │
                    ┌───────▼─────────▼──────────┐
                    │   桌面客户端(瘦壳/Electron)     │
                    │  只展示前端，不跑任何后端        │
                    └─────────────────────────────┘
```

## 改动项

### 1. web 前端：自动连接自身 origin

文件：`client/src/App.tsx`

- 删除现第 105–113 行基于 `window.electronAPI?.isDesktop` 的自动连接段。
- 替换成统一规则：当 `window.location.origin` 以 `http` 开头时，自动 `connect(window.location.origin)`；否则（桌面 `file://`，origin 不以 `http` 开头）停留在连接界面，由用户手动输入服务器地址。
  - 道理：生产环境 web 页面由游戏服务器自身托管，origin 即游戏服务器 → 自动连对。
  - dev 环境 Vite 已把 `/socket.io` 代理到 `localhost:3000`，自动连 `localhost:5173` origin 也能通过代理连通。
  - 桌面 `file://` 场景 origin 不是服务器 → 不自动连，回到连接界面。

### 2. 桌面客户端：去内嵌（瘦壳）

文件：`desktop/main.js`

- 删除内嵌服务器相关：`pickFreePort()`、`startServer()`（内嵌 `server.bundle.js`）、`waitUntilUp()`、`loadURL('http://127.0.0.1:<port>')`。
- 改为 `loadFile()` 加载构建好的 `client/dist/index.html`：
  - dev（非打包）：`path.join(__dirname, '../client/dist/index.html')`
  - 打包（isPackaged）：`path.join(process.resourcesPath, 'client/index.html')`
- 不再监听任何端口、不再创建任何服务器进程。
- 删除的 `port` / `serverHandle` 相关生命周期逻辑（`window-all-closed`、`SIGINT`/`SIGTERM` 里的 server 关闭逻辑改为纯 `app.quit()`）。

删除文件：

- `desktop/server-entry.ts`
- `desktop/scripts/build-server.js`
- `desktop/server.bundle.js`

### 3. 构建产物相对路径

文件：`client/vite.config.ts`

- 在 `defineConfig` 中增加 `base: './'`，使构建产物 `index.html` 里的资源引用（`/assets/...`）变为相对路径，`file://` 才能正确加载。

### 4. 桌面构建配置

文件：`desktop/electron-builder.yml`

- `files` 移除 `server.bundle.js`。
- `extraResources` 保留 `from: ../client/dist → to: client`，供 `loadFile` 在打包态读取。

文件：`desktop/package.json`

- 构建脚本去除 `build:server` 依赖链：`build` / `build:win` / `build:mac` / `build:linux` 不再先 `npm run build:server`。
- 删除 `"build:server": "node scripts/build-server.js"`。

## 使用流程（改造后）

- **启动服务器**：`start-server.bat 3001`（或默认 3001）。
- **远程用户**：浏览器打开 `http://<NAT域名>` → 自动进大厅。
- **本地用户**：浏览器 `http://127.0.0.1:3001` → 自动进大厅；或打开桌面客户端 → 连接界面输入 `192.168.1.100:3001`（本地）或 NAT 域名（远程）→ 进大厅。
- **旧产物**：`desktop/dist` 中已打出的安装包不再使用。

## 取舍与说明

- 桌面端的"复制房间链接"基于 `window.location.origin`，`file://` 下失效；但对局分享主要经由浏览器（远程/本地浏览器均可），桌面端不作为分享主路径，可接受。
- 桌面端保留连接界面 + 历史记录，输入地址灵活，本地（LAN IP）与远程（NAT 域名）都能连。
- `desktop/preload.js` 中的 `isDesktop` 与窗口控制 IPC 保留；改造后 `App.tsx` 不再依赖 `isDesktop` 做自动连接，但不移除该字段以保持向后兼容（窗口控制等 UI 接口仍可用）。

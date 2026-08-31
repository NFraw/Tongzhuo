# 客户端/服务端分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让桌面客户端不再内嵌并自动拉起后端服务器，改为打开即加载瘦客户端界面、由用户连接一台独立运行的服务器；同时 web 前端在"由服务器托管"时自动连接自身 origin。

**Architecture:** 一台独立服务器（`start-server.bat` → `@huiming/core-server`）同时托管 web 前端 + socket.io。桌面 Electron 应用去掉 `server.bundle.js` 内嵌服务的启动与 `pickFreePort()`/`waitUntilUp()` 逻辑，改用 `loadFile()` 加载 `client/dist`。`client/src/App.tsx` 的自动连接规则从"`isDesktop` 就自动连 origin"改为"origin 以 http 开头才自动连"。

**Tech Stack:** Electron（桌面壳）、Vite/React（客户端）、Express + socket.io（独立服务器）、TypeScript。

---

**说明：** 本项目只在 `packages/core/server` 配置了 vitest 单测；本计划不修改核心服务器逻辑，因此主要验收手段是**构建 + 静态检查 + 手动运行验证**，而非新增单元测试。任务均以小步、可独立验证、频繁提交的方式排列。

---

### Task 1: vite 构建产物改为相对资源路径（base: './'）

**Files:**
- Modify: `client/vite.config.ts:1-16`

- [ ] **Step 1: 修改 vite 配置，启用相对 base**

`client/vite.config.ts` 改为：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 2: 重新构建并确认资源路径为相对路径**

Run: `cd client && npx vite build`
Expected: 构建成功，无报错。

Run: `cd client && node -e "const s=require('fs').readFileSync('dist/index.html','utf8'); console.log(s); if(/src=\"\/assets\//.test(s)||/href=\"\/assets\//.test(s)){console.error('FAIL: absolute asset path');process.exit(1)} console.log('PASS: relative asset path')"`

Expected: 输出 `PASS: relative asset path`，`src`/`href` 以 `./assets/` 开头（例如 `src="./assets/index-xxx.js"`）。

- [ ] **Step 3: 提交**

```bash
git add client/vite.config.ts client/dist
git commit -m "build: use relative base for client assets"

Co-Authored-By: mimo-v2.5 <XiaomiMiMo@claude-code-best.win>
```

---

### Task 2: web 前端自动连接规则改为 http origin

**Files:**
- Modify: `client/src/App.tsx:101-113`

- [ ] **Step 1: 替换自动连接的判断条件**

`client/src/App.tsx` 中原先的 `didAutoConnectRef` 段（约第 105–113 行）：

```ts
const didAutoConnectRef = useRef(false)
useEffect(() => {
  if (!didAutoConnectRef.current && phase === 'connect' && !connected && window.electronAPI?.isDesktop) {
    didAutoConnectRef.current = true
    if (window.location.origin) {
      connect(window.location.origin)
    }
  }
}, [phase, connected, connect])
```

改为：

```ts
const didAutoConnectRef = useRef(false)
useEffect(() => {
  const origin = window.location.origin
  // 由 http(s) 页面托管（生产由游戏服务器托管，dev 走 Vite 代理）时自动连接；
  // 桌面端 file:// 的 origin 不含 http，则停留连接界面由用户输入服务器地址。
  if (!didAutoConnectRef.current && phase === 'connect' && !connected && origin.startsWith('http')) {
    didAutoConnectRef.current = true
    connect(origin)
  }
}, [phase, connected, connect])
```

- [ ] **Step 2: 通过类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无 TS 报错。

- [ ] **Step 3: 提交**

```bash
git add client/src/App.tsx
git commit -m "feat: auto-connect web client to its http origin

Co-Authored-By: mimo-v2.5 <XiaomiMiMo@claude-code-best.win>"
```

---

### Task 3: 桌面主进程去内嵌，改用 loadFile

**Files:**
- Modify (重写): `desktop/main.js`

- [ ] **Step 1: 重写 `desktop/main.js`**

整文件替换为：

```js
const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')

// Disable hardware acceleration issues on some GPUs
app.disableHardwareAcceleration()

const isDev = process.env.NODE_ENV === 'development'
let mainWindow = null

/**
 * Create main window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '晦明 - 卡牌游戏平台',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  // Load the built client. The client is a thin frontend that connects to a
  // standalone game server (started separately via start-server.bat); it no
  // longer spawns an embedded backend.
  const clientHtml = app.isPackaged
    ? path.join(process.resourcesPath, 'client', 'index.html')
    : path.join(__dirname, '..', 'client', 'dist', 'index.html')

  mainWindow.loadFile(clientHtml)

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * Register IPC handlers
 */
function registerIpc() {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false
  })
}

// App lifecycle
app.whenReady().then(() => {
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// Graceful shutdown
process.on('SIGINT', () => {
  app.quit()
})

process.on('SIGTERM', () => {
  app.quit()
})
```

- [ ] **Step 2: 语法检查 + 确认不再引用内嵌服务器标识符**

Run: `node --check desktop/main.js && grep -nE "server.bundle|startServer|pickFreePort|waitUntilUp|serverHandle|loadURL|require\('net'\)|require\('http'\)" desktop/main.js`
Expected: `node --check` 无输出报错；第二个命令**无匹配输出**（保留 `grep` 无结果即可，无需 exit 码）。

Run: `grep -n "loadFile" desktop/main.js`
Expected: 命中 `loadFile`（客户端以文件方式加载）。

- [ ] **Step 3: 提交**

```bash
git add desktop/main.js
git commit -m "refactor: desktop no longer embeds/starts a backend server

Co-Authored-By: mimo-v2.5 <XiaomiMiMo@claude-code-best.win>"
```

---

### Task 4: 删除内嵌服务器相关文件

**Files:**
- Delete: `desktop/server-entry.ts`
- Delete: `desktop/scripts/build-server.js`
- Delete: `desktop/server.bundle.js`

- [ ] **Step 1: 删除三个文件**

```bash
git rm desktop/server-entry.ts desktop/scripts/build-server.js desktop/server.bundle.js
```

- [ ] **Step 2: 确认已删除**

Run: `ls desktop/server-entry.ts desktop/scripts/build-server.js desktop/server.bundle.js 2>&1`
Expected: 三个文件均报 `No such file or directory`。

- [ ] **Step 3: 提交**

```bash
git commit -m "chore: remove embedded server bundle from desktop

Co-Authored-By: mimo-v2.5 <XiaomiMiMo@claude-code-best.win>"
```

---

### Task 5: electron-builder 去掉 server.bundle.js

**Files:**
- Modify: `desktop/electron-builder.yml:5-12`

- [ ] **Step 1: 更新 `files` 列表**

`desktop/electron-builder.yml` 改为：

```yaml
appId: com.huiming.desktop
productName: 晦明
directories:
  output: dist
files:
  - main.js
  - preload.js
  - package.json
extraResources:
  - from: ../client/dist
    to: client
win:
  target:
    - portable
    - nsis
mac:
  target:
    - dmg
linux:
  target:
    - AppImage
```

（`files` 中移除 `server.bundle.js`，其余保持不变。）

- [ ] **Step 2: 确认配置合法（读取并校验无 server.bundle.js）**

Run: `grep -n "server.bundle" desktop/electron-builder.yml`
Expected: 无匹配输出。

- [ ] **Step 3: 提交**

```bash
git add desktop/electron-builder.yml
git commit -m "chore: drop embedded server bundle from electron-builder

Co-Authored-By: mimo-v2.5 <XiaomiMiMo@claude-code-best.win>"
```

---

### Task 6: desktop/package.json 去除 build:server

**Files:**
- Modify: `desktop/package.json:5-14`

- [ ] **Step 1: 移除 `build:server` 脚本及其在 build 链中的依赖**

`desktop/package.json` 的 `scripts` 改为：

```json
  "scripts": {
    "start": "electron .",
    "dev": "cross-env NODE_ENV=development electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  },
```

- [ ] **Step 2: 确认 JSON 合法且无 build:server**

Run: `cd desktop && node -e "const p=require('./package.json'); if(p.scripts['build:server'])process.exit(1); if(!p.scripts['build']||!p.scripts['build']===true)console.log('check build script'); console.log(JSON.stringify(p.scripts,null,2))"`
Expected: 输出中**不含** `build:server`。

- [ ] **Step 3: 提交**

```bash
git add desktop/package.json
git commit -m "chore: drop build:server from desktop scripts

Co-Authored-By: mimo-v2.5 <XiaomiMiMo@claude-code-best.win>"
```

---

### Task 7: 整体验证

**Files:**
- 不新增/修改代码，仅运行检查。

- [ ] **Step 1: 重建客户端并确认相对资源路径（覆盖 Task 1/2）**

Run: `cd client && npx vite build`
Expected: 成功，`client/dist/index.html` 中 `src`/`href` 以 `./assets/` 开头。

- [ ] **Step 2: 启动独立服务器并验证能托管前端 + socket.io**

Run（后台）: `cd server && PORT=3011 npx tsx src/index.ts &`
Run: `sleep 3 && curl -s http://127.0.0.1:3011/ | grep -c "root"`
Expected: 输出 `1`（能返回 index.html）。
Run: `curl -s http://127.0.0.1:3011/socket.io/?EIO=4\&transport=polling | head -c 40`
Expected: 以 `0{` 或 `{"sid"` 开头的握手响应（socket.io 正常）。
完成后清理：`kill %1 2>/dev/null`（或用 `stop-server.bat`）。

- [ ] **Step 3: 运行核心服务器既有测试，确认未被破坏**

Run: `npm -w @huiming/core-server run test`
Expected: 全部通过（本计划不改动核心服务器逻辑）。

- [ ] **Step 4: 手动验证桌面端**

Run: `npm run desktop`（在项目根目录，需已 `npm install`）
Expected: 桌面窗口打开，显示"连接服务器"界面（phase='connect'，由于 origin 为 `file://` 不自动连接）。在地址栏输入 `127.0.0.1:3011`（或已启动的 `start-server.bat` 端口）→ 点击连接 → 进入大厅。
- 若此步无法自动化，记入验证记录，交由用户按上述步骤手动确认。

---

## Self-Review 记录

- **Spec 覆盖**：设计文档 §改动项 1（vite base）、§改动项 2（App.tsx 自动连接）、§改动项 3（main.js 去内嵌 + loadFile）、删除 server-entry/build-server/server.bundle（Task 4）、electron-builder（Task 5）、desktop package.json（Task 6）均有对应任务。§使用流程与 §取舍在 Task 7 的手动验证中体现。
- **占位符**：无 TBD/TODO，所有代码步骤含完整内容。
- **类型/命名一致性**：`loadFile`、`clientHtml`、`app.isPackaged`、`process.resourcesPath` 用法一致；App.tsx 中 `origin.startsWith('http')` 与 Task 2 代码一致。

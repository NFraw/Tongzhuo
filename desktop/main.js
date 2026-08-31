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

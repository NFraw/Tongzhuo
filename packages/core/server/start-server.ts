// packages/core/server/start-server.ts
import express from 'express'
import { createServer, Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { RoomManager } from './room-manager'
import { PluginLoader } from './plugin-loader'
import { setupSocketFramework } from './socket-framework'
import { getDb } from './db'
import { UserStore } from './user-store'
import { ServerConfig } from './server-config'
import { AuthErrors, AuthValidation } from '@tongzhuo/core-shared'
import type { GameServerPlugin } from '@tongzhuo/core-shared'

export interface ServerOptions {
  port?: number
  host?: string
  plugins?: GameServerPlugin[]
  staticPath?: string
  dataDir?: string
}

export interface ServerHandle {
  port: number
  close: () => Promise<void>
  io: Server
  roomManager: RoomManager
  pluginLoader: PluginLoader
}

// Simple in-memory rate limiter for auth endpoints
class RateLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>()

  check(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now()
    const entry = this.attempts.get(key)

    if (!entry || now > entry.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (entry.count >= maxAttempts) {
      return false
    }

    entry.count++
    return true
  }
}

export async function startServer(options: ServerOptions = {}): Promise<ServerHandle> {
  const {
    port = 3000,
    host = '0.0.0.0',
    plugins = [],
    staticPath,
    dataDir,
  } = options

  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  })

  // --- Security middleware ---
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    next()
  })

  // Body parser for JSON (auth endpoints)
  // Note: We only apply this to /api routes to avoid parsing on static file routes
  const apiRouter = express.Router()
  apiRouter.use(express.json({ limit: '10kb' }))

  // --- Initialize auth infrastructure ---
  const db = getDb(dataDir)
  const serverConfig = new ServerConfig(dataDir)
  const userStore = new UserStore(db, serverConfig.getServerSecret())
  const authRateLimiter = new RateLimiter()

  // --- Auth REST endpoints ---

  // Server info (no auth needed)
  apiRouter.get('/server/info', (_req, res) => {
    res.json({
      requirePassword: serverConfig.requirePassword(),
    })
  })

  // Register
  apiRouter.post('/auth/register', (req, res) => {
    const ip = req.ip || 'unknown'
    if (!authRateLimiter.check(ip, 5, 60000)) {
      res.status(429).json({ error: 'RATE_LIMITED' })
      return
    }

    const { username, password, serverPassword, displayName } = req.body || {}

    // Check server password if required
    if (serverConfig.requirePassword()) {
      if (!serverPassword || !serverConfig.verifyServerPassword(serverPassword)) {
        res.status(403).json({ error: AuthErrors.SERVER_PASSWORD_INCORRECT })
        return
      }
    }

    const result = userStore.createUser(username, password, displayName)
    if (!result.success) {
      res.status(400).json({ error: result.error })
      return
    }

    res.json({ token: result.token, user: result.user })
  })

  // Login
  apiRouter.post('/auth/login', (req, res) => {
    const ip = req.ip || 'unknown'
    if (!authRateLimiter.check(ip, 5, 60000)) {
      res.status(429).json({ error: 'RATE_LIMITED' })
      return
    }

    const { username, password, serverPassword } = req.body || {}

    // Check server password if required
    if (serverConfig.requirePassword()) {
      if (!serverPassword || !serverConfig.verifyServerPassword(serverPassword)) {
        res.status(403).json({ error: AuthErrors.SERVER_PASSWORD_INCORRECT })
        return
      }
    }

    const result = userStore.verifyPassword(username, password)
    if (!result.valid) {
      res.status(401).json({ error: result.error })
      return
    }

    const token = userStore.generateToken(username)
    res.json({ token, user: result.user })
  })

  // Token refresh
  apiRouter.post('/auth/refresh', (req, res) => {
    const { token } = req.body || {}
    if (!token) {
      res.status(400).json({ error: AuthErrors.TOKEN_INVALID })
      return
    }

    const result = userStore.refreshToken(token)
    if (!result.success) {
      res.status(401).json({ error: result.error })
      return
    }

    res.json({ newToken: result.newToken })
  })

  // Change password (requires auth)
  apiRouter.post('/auth/change-password', (req, res) => {
    const { token, oldPassword, newPassword } = req.body || {}
    if (!token) {
      res.status(401).json({ error: AuthErrors.TOKEN_INVALID })
      return
    }

    const auth = userStore.verifyToken(token)
    if (!auth.valid || !auth.username) {
      res.status(401).json({ error: auth.error })
      return
    }

    const result = userStore.changePassword(auth.username, oldPassword, newPassword)
    if (!result.success) {
      res.status(400).json({ error: result.error })
      return
    }

    res.json({ success: true })
  })

  // Get profile (requires auth)
  apiRouter.get('/profile', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string
    if (!token) {
      res.status(401).json({ error: AuthErrors.TOKEN_INVALID })
      return
    }

    const auth = userStore.verifyToken(token)
    if (!auth.valid || !auth.username) {
      res.status(401).json({ error: auth.error })
      return
    }

    const user = userStore.getUser(auth.username)
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND' })
      return
    }

    res.json(user)
  })

  // Update profile (requires auth)
  apiRouter.put('/profile/update', (req, res) => {
    const { token, displayName, avatarId } = req.body || {}
    if (!token) {
      res.status(401).json({ error: AuthErrors.TOKEN_INVALID })
      return
    }

    const auth = userStore.verifyToken(token)
    if (!auth.valid || !auth.username) {
      res.status(401).json({ error: auth.error })
      return
    }

    const result = userStore.updateProfile(auth.username, displayName, avatarId)
    if (!result.success) {
      res.status(400).json({ error: result.error })
      return
    }

    res.json(result.user)
  })

  // Game settlement (internal only — requires X-Server-Secret header)
  apiRouter.post('/game/settle', (req, res) => {
    const secret = req.headers['x-server-secret']
    if (!secret || secret !== serverConfig.getServerSecret()) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return
    }

    const { userId, coinChange, reason } = req.body || {}
    if (typeof userId !== 'number' || typeof coinChange !== 'number' || typeof reason !== 'string') {
      res.status(400).json({ error: 'INVALID_PARAMS' })
      return
    }

    const result = userStore.addCoins(userId, coinChange, reason)
    if (!result.success) {
      res.status(400).json({ error: result.error })
      return
    }

    res.json({ newBalance: result.newBalance })
  })

  // Mount API router
  app.use('/api', apiRouter)

  // Serve static files if path provided
  if (staticPath) {
    app.use(express.static(staticPath))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'))
    })
  }

  // Setup game platform
  const roomManager = new RoomManager()
  const pluginLoader = new PluginLoader()

  // Register game plugins
  for (const plugin of plugins) {
    pluginLoader.register(plugin)
  }

  // Setup socket framework
  setupSocketFramework(io, roomManager, pluginLoader, userStore, serverConfig)

  // Start listening
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, host, () => {
      console.log(`Server running on http://${host}:${port}`)
      console.log(`Registered games: ${pluginLoader.listPlugins().join(', ')}`)
      console.log(`Auth: ${userStore.hasUsers() ? 'enforced' : 'no users registered (open access)'}`)
      resolve()
    })
    httpServer.on('error', reject)
  })

  const close = async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  return { port, close, io, roomManager, pluginLoader }
}

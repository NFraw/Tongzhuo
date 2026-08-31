// packages/core/server/start-server.ts
import express from 'express'
import { createServer, Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { RoomManager } from './room-manager'
import { PluginLoader } from './plugin-loader'
import { setupSocketFramework } from './socket-framework'
import type { GameServerPlugin } from '@huiming/core-shared'

export interface ServerOptions {
  port?: number
  host?: string
  plugins?: GameServerPlugin[]
  staticPath?: string
}

export interface ServerHandle {
  port: number
  close: () => Promise<void>
  io: Server
  roomManager: RoomManager
  pluginLoader: PluginLoader
}

export async function startServer(options: ServerOptions = {}): Promise<ServerHandle> {
  const {
    port = 3000,
    host = '0.0.0.0',
    plugins = [],
    staticPath,
  } = options

  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  })

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
  setupSocketFramework(io, roomManager, pluginLoader)

  // Start listening
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, host, () => {
      console.log(`Server running on http://${host}:${port}`)
      console.log(`Registered games: ${pluginLoader.listPlugins().join(', ')}`)
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

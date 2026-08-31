import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { RoomManager, PluginLoader, setupSocketFramework } from '@huiming/core-server'
import { huimingServerPlugin } from 'huiming/plugin'

const PORT = Number(process.env.PORT) || 3000

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

// Serve static files from client build
app.use(express.static(path.join(__dirname, '../public')))

// Fallback to index.html for SPA
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// Setup game platform
const roomManager = new RoomManager()
const pluginLoader = new PluginLoader()

// Register game plugins
pluginLoader.register(huimingServerPlugin)

// Setup socket framework
setupSocketFramework(io, roomManager, pluginLoader)

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Registered games: ${pluginLoader.listPlugins().join(', ')}`)
})

// packages/core/server/socket-framework.ts
import type { Server, Socket } from 'socket.io'
import { RoomManager } from './room-manager'
import { PluginLoader } from './plugin-loader'

export function setupSocketFramework(
  io: Server,
  roomManager: RoomManager,
  pluginLoader: PluginLoader
): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`)

    // List available games
    socket.emit('games:list', pluginLoader.listPlugins())

    // Create room
    socket.on('room:create', ({ gameId }: { gameId: string }) => {
      const plugin = pluginLoader.getPlugin(gameId)
      if (!plugin) {
        socket.emit('room:error', { reason: '游戏不存在' })
        return
      }
      const room = roomManager.createRoom(socket.id, gameId, plugin.maxPlayers)
      socket.join(room.id)
      socket.emit('room:created', { roomId: room.id })
    })

    // Join room
    socket.on('room:join', ({ roomId }: { roomId: string }) => {
      const result = roomManager.joinRoom(roomId, socket.id)
      if (!result.success) {
        socket.emit(result.reason === 'full' ? 'room:full' : 'room:notFound')
        return
      }

      socket.join(roomId)
      const room = roomManager.getRoom(roomId)!
      const plugin = pluginLoader.getPlugin(room.gameId)!

      socket.emit('room:joined', { opponentId: room.players.find(id => id !== socket.id)! })

      // Room full, init game
      if (room.players.length === room.maxPlayers) {
        room.phase = 'playing'
        room.state = plugin.createInitialState(room.players)
        broadcastState(io, room, plugin)
      }
    })

    // Game action forwarded to plugin
    socket.on('game:action', ({ event, payload }: { event: string; payload: any }) => {
      const room = roomManager.findRoomByPlayer(socket.id)
      if (!room || !room.state || room.phase !== 'playing') return

      const plugin = pluginLoader.getPlugin(room.gameId)
      if (!plugin) return

      const result = plugin.handleEvent(room.state, socket.id, event, payload)
      if (result.error) {
        socket.emit('game:error', { reason: result.error })
        return
      }

      room.state = result.state

      // Broadcast events
      for (const msg of result.broadcast) {
        io.to(room.id).emit(msg.event, msg.data)
      }

      // Broadcast state
      broadcastState(io, room, plugin)

      // Check game end
      const winnerId = plugin.checkGameEnd(room.state)
      if (winnerId) {
        room.phase = 'ended'
        io.to(room.id).emit('game:over', { winnerId })
      }
    })

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`)
      const room = roomManager.findRoomByPlayer(socket.id)
      if (!room) return

      const opponent = room.players.find(id => id !== socket.id)
      if (opponent) {
        io.to(opponent).emit('game:opponentDisconnected', { playerId: socket.id })
      }

      roomManager.removePlayer(socket.id)
    })
  })
}

function broadcastState(io: Server, room: any, plugin: any): void {
  for (const playerId of room.players) {
    const clientState = plugin.getClientState(room.state, playerId)
    io.to(playerId).emit('game:stateUpdate', { state: clientState })
  }
}

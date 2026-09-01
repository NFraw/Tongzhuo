// packages/core/server/socket-framework.ts
import type { Server, Socket } from 'socket.io'
import { RoomManager } from './room-manager'
import { PluginLoader } from './plugin-loader'
import { logger } from './logger'
import { UserStore } from './user-store'
import { ServerConfig } from './server-config'
import type { RoomPlayer, RoomSummary } from '@huiming/core-shared'
import { AuthErrors, PROTOCOL_VERSION, isCompatible } from '@huiming/core-shared'

// Rate limiting for game actions
const ACTION_RATE_LIMIT_MS = 100 // Minimum 100ms between actions

// Disconnect timeout tracking
const DISCONNECT_TIMEOUT_MS = 45000 // 45 seconds timeout for reconnection

export function setupSocketFramework(
  io: Server,
  roomManager: RoomManager,
  pluginLoader: PluginLoader,
  userStore?: UserStore,
  serverConfig?: ServerConfig
): void {
  // Instance-scoped state: each setupSocketFramework call gets its own maps
  const actionTimestamps = new Map<string, number>()
  const disconnectTimers = new Map<string, NodeJS.Timeout>()
  const playAgainRequests = new Map<string, Set<string>>() // roomId -> Set of playerIds
  const roomVersions = new Map<string, number>() // roomId -> version

  // --- Auth middleware (io.use) ---
  if (userStore && serverConfig) {
    io.use((socket, next) => {
      const auth = socket.handshake.auth as any

      // Step 1: Check server password if required
      if (serverConfig.requirePassword()) {
        const serverPassword = auth?.serverPassword
        if (!serverPassword) {
          return next(new Error(AuthErrors.SERVER_PASSWORD_REQUIRED))
        }
        if (!serverConfig.verifyServerPassword(serverPassword)) {
          return next(new Error(AuthErrors.SERVER_PASSWORD_INCORRECT))
        }
      }

      // Step 2: Check client version compatibility
      const clientVersion = auth?.clientVersion
      if (clientVersion && !isCompatible(clientVersion, PROTOCOL_VERSION)) {
        logger.warn(`Client version ${clientVersion} incompatible with server ${PROTOCOL_VERSION}`)
        return next(new Error(`${AuthErrors.VERSION_INCOMPATIBLE}:${PROTOCOL_VERSION}`))
      }

      // Step 3: Verify user token
      const token = auth?.token
      if (token) {
        const result = userStore.verifyToken(token)
        if (!result.valid) {
          return next(new Error(result.error || AuthErrors.TOKEN_INVALID))
        }
        // Attach username to socket data
        socket.data.username = result.username
      } else if (userStore.hasUsers()) {
        // No token provided, but users exist — auth is required
        // Allow connection but mark as unauthenticated
        // (the player:hello handler will use a temporary identity)
        socket.data.username = null
      }

      next()
    })
  }

  function checkRateLimit(playerId: string): boolean {
    const now = Date.now()
    const lastAction = actionTimestamps.get(playerId) || 0
    if (now - lastAction < ACTION_RATE_LIMIT_MS) {
      return false
    }
    actionTimestamps.set(playerId, now)
    return true
  }

  function broadcastState(io: Server, room: any, plugin: any, roomManager: RoomManager): void {
    // Increment version
    const currentVersion = roomVersions.get(room.id) || 0
    const newVersion = currentVersion + 1
    roomVersions.set(room.id, newVersion)

    const sent: string[] = []
    for (const player of room.players) {
      const clientState = plugin.getClientState(room.state, player.id)
      const socketId = roomManager.getSocketId(player.id)
      if (socketId) {
        io.to(socketId).emit('game:stateUpdate', { state: clientState, version: newVersion, gameId: room.gameId })
        sent.push(player.id)
      } else {
        logger.warn('state.broadcast.no_socket', { roomId: room.id, playerId: player.id })
      }
    }
    logger.info('state.broadcast', { roomId: room.id, version: newVersion, players: sent.length, playerIds: sent.join(',') })
  }

  io.on('connection', (socket: Socket) => {
    logger.info('socket.connected', { socketId: socket.id })

    // Player handshake
    socket.on('player:hello', ({ playerId, name }: { playerId: string; name: string }) => {
      // If authenticated via token, use that username as the stable identity
      const authenticatedUsername = socket.data.username as string | null | undefined
      const effectivePlayerId = authenticatedUsername || playerId

      // Validate input
      if (!effectivePlayerId || typeof effectivePlayerId !== 'string' || effectivePlayerId.length > 64) {
        socket.emit('room:error', { reason: '无效的玩家ID' })
        return
      }
      if (!name || typeof name !== 'string' || name.length > 32) {
        socket.emit('room:error', { reason: '无效的昵称' })
        return
      }

      logger.info('player.hello', { playerId: effectivePlayerId, socketId: socket.id, name, authenticated: !!authenticatedUsername })

      // Store player name
      roomManager.setPlayerName(effectivePlayerId, name)

      // Update socket mapping
      roomManager.updateSocket(effectivePlayerId, socket.id)

      // Clear disconnect timer if exists
      const existingTimer = disconnectTimers.get(effectivePlayerId)
      if (existingTimer) {
        clearTimeout(existingTimer)
        disconnectTimers.delete(effectivePlayerId)
      }

      // Get user profile data if authenticated
      let userProfile = null
      if (authenticatedUsername && userStore) {
        userProfile = userStore.getUser(authenticatedUsername)
      }

      // Send welcome with game list
      socket.emit('player:welcome', {
        playerId: effectivePlayerId,
        games: pluginLoader.listPlugins(),
        userProfile,
        serverVersion: PROTOCOL_VERSION,
      })

      // Send room list
      socket.emit('rooms:list', roomManager.getRoomSummaries())

      // Check if player was in a room (reconnection)
      const room = roomManager.findRoomByPlayer(effectivePlayerId)
      if (room) {
        // Rejoin socket room
        socket.join(room.id)
        const plugin = pluginLoader.getPlugin(room.gameId)

        if (plugin && room.state) {
          // If game was paused, resume
          if (room.phase === 'paused') {
            logger.info('room.phase_change', { roomId: room.id, playerId: effectivePlayerId }, 'paused→playing (reconnect resume)')
            room.phase = 'playing'
            const otherPlayers = room.players.filter(p => p.id !== effectivePlayerId)
            for (const other of otherPlayers) {
              const otherSocketId = roomManager.getSocketId(other.id)
              if (otherSocketId) {
                io.to(otherSocketId).emit('game:resumed')
              }
            }
          }

          // Send current state
          const clientState = plugin.getClientState(room.state, effectivePlayerId)
          socket.emit('game:stateUpdate', { state: clientState, gameId: room.gameId })
        } else if (room.phase === 'waiting') {
          // Waiting room: send room detail
          const roomDetail = roomManager.getRoomDetailForPlayer(room.id, effectivePlayerId)
          socket.emit('room:updated', roomDetail)
        }
      }
    })

    // Create room
    socket.on('room:create', ({ gameId, maxPlayers }: { gameId: string; maxPlayers?: number }) => {
      // Validate gameId
      if (!gameId || typeof gameId !== 'string') {
        socket.emit('room:error', { reason: '无效的游戏ID' })
        return
      }

      const plugin = pluginLoader.getPlugin(gameId)
      if (!plugin) {
        socket.emit('room:error', { reason: '游戏不存在' })
        return
      }

      // Validate maxPlayers
      if (maxPlayers !== undefined) {
        if (typeof maxPlayers !== 'number' || maxPlayers < plugin.minPlayers || maxPlayers > plugin.maxPlayers) {
          socket.emit('room:error', { reason: `人数范围: ${plugin.minPlayers}-${plugin.maxPlayers}` })
          return
        }
      }

      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) {
        socket.emit('room:error', { reason: '未完成握手', code: 'NEED_HELLO', socketId: socket.id })
        return
      }

      // Check if player is already in a room
      const existingRoom = roomManager.findRoomByPlayer(playerId)
      if (existingRoom) {
        socket.emit('room:error', { reason: '你已在其他房间中' })
        return
      }

      const player: RoomPlayer = {
        id: playerId,
        name: roomManager.getPlayerName(playerId),
        socketId: socket.id,
        connected: true,
        ready: false,
      }

      const room = roomManager.createRoom(player, gameId, maxPlayers || plugin.maxPlayers)
      logger.info('room.create', { roomId: room.id, playerId, gameId, phase: room.phase })
      socket.join(room.id)
      const roomDetail = roomManager.getRoomDetailForPlayer(room.id, playerId)
      socket.emit('room:created', { roomId: room.id, ...roomDetail })

      broadcastRoomList(io, roomManager)
    })

    // Join room
    socket.on('room:join', ({ roomId }: { roomId: string }) => {
      logger.debug('room.join.request', { socketId: socket.id, roomId })
      if (!roomId || typeof roomId !== 'string') {
        socket.emit('room:error', { reason: '无效的房间ID' })
        return
      }

      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) {
        socket.emit('room:error', { reason: '未完成握手', code: 'NEED_HELLO', socketId: socket.id })
        return
      }

      const existingRoom = roomManager.findRoomByPlayer(playerId)
      if (existingRoom) {
        socket.emit('room:error', { reason: '你已在其他房间中' })
        return
      }

      const targetRoom = roomManager.getRoom(roomId)
      if (!targetRoom) {
        socket.emit('room:notFound')
        return
      }
      if (targetRoom.phase !== 'waiting') {
        socket.emit('room:error', { reason: '游戏已开始' })
        return
      }
      if (targetRoom.players.length >= targetRoom.maxPlayers) {
        socket.emit('room:full')
        return
      }

      const player: RoomPlayer = {
        id: playerId,
        name: roomManager.getPlayerName(playerId),
        socketId: socket.id,
        connected: true,
        ready: false,
      }

      const result = roomManager.joinRoom(roomId, player)
      if (!result.success) {
        if (result.reason === 'full') socket.emit('room:full')
        else if (result.reason === 'notFound') socket.emit('room:notFound')
        else socket.emit('room:error', { reason: result.reason })
        return
      }

      socket.join(roomId)
      const room = roomManager.getRoom(roomId)!
      logger.info('room.joined', { roomId, playerId, players: room.players.length, phase: room.phase })
      const plugin = pluginLoader.getPlugin(room.gameId)!

      const roomDetail = roomManager.getRoomDetailForPlayer(room.id, playerId)
      socket.emit('room:joined', {
        players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
        gameId: room.gameId,
        ...roomDetail,
      })

      broadcastRoomList(io, roomManager)
      broadcastRoomUpdated(io, room.id, roomManager)
    })

    // Room ready toggle
    socket.on('room:ready', () => {
      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) return

      const room = roomManager.findRoomByPlayer(playerId)
      if (!room) return

      if (room.phase !== 'waiting') {
        socket.emit('room:error', { reason: '游戏已开始' })
        return
      }

      const player = room.players.find(p => p.id === playerId)
      if (!player) return
      const newReady = !player.ready
      roomManager.setPlayerReady(playerId, newReady)

      broadcastRoomUpdated(io, room.id, roomManager)
    })

    // Room start (host only)
    socket.on('room:start', () => {
      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) return
      logger.debug('room.start.request', { playerId, socketId: socket.id })

      const room = roomManager.findRoomByPlayer(playerId)
      if (!room) return

      if (!roomManager.getRoom(room.id)) {
        logger.warn('room.start.stale_ref', { roomId: room.id, playerId })
        socket.emit('room:error', { reason: '房间已失效，请重新创建' })
        return
      }

      if (room.hostId !== playerId) {
        socket.emit('room:error', { reason: '只有房主可以开始游戏' })
        return
      }

      if (room.phase !== 'waiting') {
        logger.warn('room.start.blocked', { roomId: room.id, playerId }, `phase=${room.phase} players=${room.players.length}`)
        socket.emit('room:error', { reason: '游戏已开始' })
        return
      }

      if (!roomManager.isAllReady(room.id)) {
        socket.emit('room:error', { reason: '所有玩家需要准备就绪' })
        return
      }

      const plugin = pluginLoader.getPlugin(room.gameId)
      if (!plugin) {
        socket.emit('room:error', { reason: '游戏不存在' })
        return
      }

      if (room.players.length < plugin.minPlayers) {
        socket.emit('room:error', { reason: `至少需要 ${plugin.minPlayers} 名玩家` })
        return
      }

      logger.info('room.phase_change', { roomId: room.id, playerId }, 'waiting→playing (room:start)')
      room.phase = 'playing'
      room.state = plugin.createInitialState(room.players.map(p => p.id))
      broadcastState(io, room, plugin, roomManager)
      broadcastRoomList(io, roomManager)
    })

    // Game action forwarded to plugin
    socket.on('game:action', ({ event, payload }: { event: string; payload: any }) => {
      if (!event || typeof event !== 'string') {
        socket.emit('game:error', { reason: '无效的事件名' })
        return
      }

      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) return

      if (!checkRateLimit(playerId)) {
        socket.emit('game:error', { reason: '操作过于频繁' })
        return
      }

      const room = roomManager.findRoomByPlayer(playerId)
      if (!room) {
        socket.emit('game:error', { reason: '你不在房间中' })
        return
      }
      if (!room.state) {
        socket.emit('game:error', { reason: '游戏未开始' })
        return
      }
      if (room.phase !== 'playing') {
        socket.emit('game:error', { reason: '游戏未在进行中' })
        return
      }

      const plugin = pluginLoader.getPlugin(room.gameId)
      if (!plugin) return

      const result = plugin.handleEvent(room.state, playerId, event, payload)
      if (result.error) {
        socket.emit('game:error', { reason: result.error })
        return
      }

      room.state = result.state

      // Broadcast events with target control
      if (result.broadcast) {
        for (const msg of result.broadcast) {
          const target = msg.target || 'all'
          if (target === 'all') {
            io.to(room.id).emit(msg.event, msg.data)
          } else if (target === 'self') {
            socket.emit(msg.event, msg.data)
          } else if (target === 'others') {
            socket.to(room.id).emit(msg.event, msg.data)
          }
        }
      }

      broadcastState(io, room, plugin, roomManager)

      // Check game end
      const shouldCheckEnd = result.checkEndNow !== false
      if (shouldCheckEnd) {
        const winnerId = plugin.checkGameEnd(room.state)
        if (winnerId) {
          logger.info('room.phase_change', { roomId: room.id }, `playing→ended (winner=${winnerId})`)
          room.phase = 'ended'
          logger.info('game.over', { roomId: room.id, playerId: winnerId }, 'winner declared')
          io.to(room.id).emit('game:over', { winnerId })
          broadcastRoomList(io, roomManager)
        }
      }
    })

    // Leave room
    socket.on('room:leave', () => {
      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) return

      const room = roomManager.findRoomByPlayer(playerId)
      if (!room) return

      const leavingIsHost = room.hostId === playerId
      const wasPlaying = room.phase !== 'waiting'

      logger.info('room.leave', { roomId: room.id, playerId, phase: room.phase, isHost: leavingIsHost, players: room.players.length })

      socket.leave(room.id)
      roomManager.removePlayer(playerId)

      if (room.players.length === 0) {
        logger.info('room.deleted', { roomId: room.id }, 'empty after leave')
        playAgainRequests.delete(room.id)
        broadcastRoomList(io, roomManager)
        return
      }

      if (leavingIsHost || wasPlaying) {
        logger.info('room.dissolve', { roomId: room.id, playerId, remainingPlayers: room.players.length })
        for (const p of room.players) {
          const oppSocketId = roomManager.getSocketId(p.id)
          if (oppSocketId) {
            io.to(oppSocketId).emit('room:playerLeft', { playerId, isHost: leavingIsHost, dissolved: true })
          }
          roomManager.removePlayer(p.id)
        }
        playAgainRequests.delete(room.id)
      } else {
        for (const p of room.players) {
          const oppSocketId = roomManager.getSocketId(p.id)
          if (oppSocketId) {
            io.to(oppSocketId).emit('room:playerLeft', { playerId, isHost: false, dissolved: false })
          }
        }
        broadcastRoomUpdated(io, room.id, roomManager)
      }

      broadcastRoomList(io, roomManager)
    })

    // Play again request
    socket.on('room:again', () => {
      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) return

      const room = roomManager.findRoomByPlayer(playerId)
      if (!room) return

      if (room.phase !== 'ended') {
        socket.emit('room:error', { reason: '游戏未结束' })
        return
      }

      let requests = playAgainRequests.get(room.id)
      if (!requests) {
        requests = new Set()
        playAgainRequests.set(room.id, requests)
      }
      requests.add(playerId)

      const allAgreed = room.players.every(p => requests.has(p.id))
      if (allAgreed) {
        playAgainRequests.delete(room.id)
        io.to(room.id).emit('room:againAccepted')

        const plugin = pluginLoader.getPlugin(room.gameId)
        if (plugin) {
          logger.info('room.phase_change', { roomId: room.id }, 'ended→playing (room:again)')
          room.phase = 'playing'
          logger.info('room.again', { roomId: room.id }, 'new game started, phase→playing')
          room.state = plugin.createInitialState(room.players.map(p => p.id))
          broadcastState(io, room, plugin, roomManager)
        } else {
          room.phase = 'waiting'
          room.state = null
        }

        broadcastRoomList(io, roomManager)
      }
    })

    // Request room list refresh
    socket.on('rooms:refresh', () => {
      socket.emit('rooms:list', roomManager.getRoomSummaries())
    })

    // Request room state update
    socket.on('room:update', () => {
      const playerId = roomManager.getPlayerId(socket.id)
      if (!playerId) return

      const room = roomManager.findRoomByPlayer(playerId)
      if (!room) return

      const roomDetail = roomManager.getRoomDetailForPlayer(room.id, playerId)
      socket.emit('room:updated', roomDetail)
    })

    // Disconnect
    socket.on('disconnect', () => {
      const playerId = roomManager.getPlayerId(socket.id)
      logger.info('socket.disconnected', { socketId: socket.id, playerId: playerId ?? undefined })
      if (!playerId) return

      const room = roomManager.findRoomByPlayer(playerId)
      if (!room) return

      roomManager.disconnectPlayer(playerId)

      const otherPlayers = room.players.filter(p => p.id !== playerId)
      for (const other of otherPlayers) {
        const otherSocketId = roomManager.getSocketId(other.id)
        if (otherSocketId) {
          io.to(otherSocketId).emit('game:opponentDisconnected', { playerId })
        }
      }

      if (room.phase === 'playing') {
        logger.info('room.phase_change', { roomId: room.id, playerId }, 'playing→paused (disconnect)')
        room.phase = 'paused'
        for (const other of otherPlayers) {
          const otherSocketId = roomManager.getSocketId(other.id)
          if (otherSocketId) {
            io.to(otherSocketId).emit('game:paused', { reason: '对手断线' })
          }
        }

        const timer = setTimeout(() => {
          const currentRoom = roomManager.findRoomByPlayer(playerId)
          if (currentRoom && currentRoom.phase === 'paused') {
            currentRoom.phase = 'ended'
            for (const other of otherPlayers) {
              const otherSocketId = roomManager.getSocketId(other.id)
              if (otherSocketId) {
                io.to(otherSocketId).emit('game:forfeited', { winnerId: other.id })
              }
            }
            broadcastRoomList(io, roomManager)
          }
          disconnectTimers.delete(playerId)
        }, DISCONNECT_TIMEOUT_MS)

        disconnectTimers.set(playerId, timer)
      }

      broadcastRoomList(io, roomManager)
    })
  })
}

function broadcastRoomList(io: Server, roomManager: RoomManager): void {
  io.emit('rooms:list', roomManager.getRoomSummaries())
}

function broadcastRoomUpdated(io: Server, roomId: string, roomManager: RoomManager): void {
  const room = roomManager.getRoom(roomId)
  if (!room) return

  for (const player of room.players) {
    const socketId = roomManager.getSocketId(player.id)
    if (socketId) {
      const roomDetail = roomManager.getRoomDetailForPlayer(roomId, player.id)
      io.to(socketId).emit('room:updated', roomDetail)
    }
  }
}

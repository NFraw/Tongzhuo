import { useState, useEffect, useCallback, useRef } from 'react'
import { useSocket } from '@huiming/core-client/hooks/useSocket'
import { useGamePlugin, registerClientPluginLoader } from '@huiming/core-client/hooks/useGamePlugin'
import type { ClientState, RoomSummary } from '@huiming/core-shared'

// Register plugin loaders for lazy loading
registerClientPluginLoader('huiming', () =>
  import('huiming/ui/client-plugin').then(m => m.huimingClientPlugin)
)

function getStoredPlayerId(): string {
  let id = localStorage.getItem('huiming-player-id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('huiming-player-id', id) }
  return id
}
function getStoredPlayerName(): string {
  return localStorage.getItem('huiming-player-name') || 'Player'
}

type AppPhase = 'connect' | 'lobby' | 'room' | 'playing' | 'paused' | 'ended'

/** All room-related state, always updated as a single unit from server events. */
interface RoomView {
  roomId: string
  gameId: string
  isHost: boolean
  players: { id: string; name: string; connected: boolean; ready: boolean }[]
}

const EMPTY_ROOM: RoomView = { roomId: '', gameId: '', isHost: false, players: [] }

export function App() {
  const { emit, on, playerId, connected, serverUrl, connectError, connect, disconnect, serverHistory } = useSocket()
  const [phase, setPhase] = useState<AppPhase>('connect')
  const [room, setRoom] = useState<RoomView>(EMPTY_ROOM)
  const [games, setGames] = useState<string[]>([])
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [gameState, setGameState] = useState<ClientState | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [serverInput, setServerInput] = useState('')
  const [selectedGameId, setSelectedGameId] = useState<string>('huiming')
  const stateVersionRef = useRef(0)
  const pendingRetryRef = useRef<{ event: string; payload: any } | null>(null)
  const gamePlugin = useGamePlugin(room.gameId)

  // Listen for events
  useEffect(() => {
    if (!connected) return

    const cleanups = [
      on('player:welcome', ({ playerId: pid, games: gameList }: { playerId: string; games: string[] }) => {
        setGames(gameList)
        setPhase('lobby')
        // If there's a pending action from a NEED_HELLO retry, execute it now.
        const pending = pendingRetryRef.current
        if (pending) {
          pendingRetryRef.current = null
          setTimeout(() => emit(pending.event, pending.payload), 100)
        }
      }),
      on('rooms:list', (roomList: RoomSummary[]) => {
        setRooms(roomList)
      }),
      on('room:created', (data: { roomId: string; gameId: string; hostId: string; playerList: { id: string; name: string; connected: boolean; ready: boolean }[]; isHost: boolean }) => {
        pendingRetryRef.current = null
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        setPhase('room')
      }),
      on('room:joined', (data: { gameId: string; playerList: { id: string; name: string; connected: boolean; ready: boolean }[]; isHost: boolean; roomId: string }) => {
        pendingRetryRef.current = null
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        setPhase('room')
      }),
      on('room:updated', (data: { roomId: string; gameId: string; playerList: { id: string; name: string; connected: boolean; ready: boolean }[]; isHost: boolean }) => {
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        // On reconnect back to a waiting room, route back to the room page.
        if (phase === 'connect' || phase === 'lobby') {
          setPhase('room')
        }
      }),
      on('game:stateUpdate', ({ state, version, gameId }: { state: ClientState; version?: number; gameId?: string }) => {
        // Ignore older versions
        if (version !== undefined && version < stateVersionRef.current) {
          return
        }
        setGameState(state)
        if (version !== undefined) {
          stateVersionRef.current = version
        }
        // On a reconnect (or join-link) the client may not have set the gameId
        // yet, so derive it from the update to load the right plugin.
        if (gameId) {
          setRoom(prev => ({ ...prev, gameId }))
        }
        if (phase !== 'paused') {
          setPhase('playing')
        }
      }),
      on('game:error', ({ reason }: { reason: string }) => {
        setError(reason)
        setTimeout(() => setError(null), 3000)
      }),
      on('game:opponentDisconnected', () => {
        setError('对手已断开连接，等待重连…')
        setTimeout(() => setError(null), 5000)
      }),
      on('room:error', ({ reason, code }: { reason: string; code?: string }) => {
        if (code === 'NEED_HELLO') {
          // Socket mapping lost (e.g. tunnel reconnect). Re-handshake and
          // queue the last action to retry after welcome arrives.
          const pending = pendingRetryRef.current
          if (pending) {
            emit('player:hello', { playerId: getStoredPlayerId(), name: getStoredPlayerName() })
            // pending is kept; player:welcome handler will retry it.
          } else {
            setError('连接已重置，请重新操作')
            setTimeout(() => setError(null), 3000)
          }
          return
        }
        setError(reason)
        setTimeout(() => setError(null), 3000)
      }),
      on('room:full', () => {
        setError('房间已满')
        setTimeout(() => setError(null), 3000)
      }),
      on('room:notFound', () => {
        setError('房间不存在')
        setTimeout(() => setError(null), 3000)
      }),
      on('game:over', ({ winnerId: wid }: { winnerId: string }) => {
        setWinnerId(wid)
        setPhase('ended')
      }),
      on('game:paused', ({ reason }: { reason: string }) => {
        setPhase('paused')
      }),
      on('game:resumed', () => {
        setPhase('playing')
      }),
      on('game:forfeited', ({ winnerId: wid }: { winnerId: string }) => {
        setWinnerId(wid)
        setPhase('ended')
      }),
      on('room:playerLeft', ({ playerId: pid, isHost: leftWasHost, dissolved }: { playerId: string; isHost: boolean; dissolved?: boolean }) => {
        if (dissolved) {
          setError(leftWasHost ? '房主已离开，房间已解散' : '对手已离开，房间已解散')
          setTimeout(() => setError(null), 3000)
          setPhase('lobby')
          setRoom(EMPTY_ROOM)
          setGameState(null)
        } else if (leftWasHost) {
          setError('房主已离开，你已成为新房主')
          setTimeout(() => setError(null), 3000)
        } else {
          setError('对手已离开房间')
          setTimeout(() => setError(null), 3000)
        }
      }),
    ]
    return () => cleanups.forEach(fn => fn())
  }, [on, phase, connected])

  // When the page is served over http(s) (production: hosted by the game
  // server; dev: Vite proxies /socket.io to the dev server), auto-connect to
  // that origin. When loaded via file:// (desktop client) the origin is not
  // the game server, so stay on the connect screen and let the user type it.
  // Only do this once on first boot — otherwise re-running when phase returns
  // to 'connect' would instantly reconnect, making "断开连接" impossible.
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

  // Auto-join if URL has roomId
  useEffect(() => {
    if (connected && phase === 'lobby') {
      const params = new URLSearchParams(window.location.search)
      const joinRoomId = params.get('join')
      if (joinRoomId) {
        emit('room:join', { roomId: joinRoomId })
        setRoom(prev => ({ ...prev, roomId: joinRoomId }))
      }
    }
  }, [connected, phase, emit])

  const handleConnect = useCallback((url: string) => {
    if (!url) return
    // Protocol normalization + http/https fallback happens inside useSocket.connect.
    connect(url)
  }, [connect])

  const handleDisconnect = useCallback(() => {
    disconnect()
    setPhase('connect')
    setRoom(EMPTY_ROOM)
    setGameState(null)
    setWinnerId(null)
  }, [disconnect])

  const handleCreateRoom = useCallback(() => {
    const payload = { gameId: selectedGameId }
    pendingRetryRef.current = { event: 'room:create', payload }
    emit('room:create', payload)
    setRoom(prev => ({ ...prev, gameId: selectedGameId }))
  }, [emit, selectedGameId])

  const handleJoinRoom = useCallback((rid: string, gameId?: string) => {
    const payload = { roomId: rid }
    pendingRetryRef.current = { event: 'room:join', payload }
    emit('room:join', payload)
    if (gameId) {
      setRoom(prev => ({ ...prev, roomId: rid, gameId }))
    }
  }, [emit])

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}?join=${room.roomId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [room.roomId])

  const handleAction = useCallback((event: string, payload: any) => {
    emit('game:action', { event, payload })
  }, [emit])

  const handleLeaveRoom = useCallback(() => {
    emit('room:leave')
    setPhase('lobby')
    setRoom(EMPTY_ROOM)
    setGameState(null)
    setWinnerId(null)
  }, [emit])

  const handlePlayAgain = useCallback(() => {
    emit('room:again')
  }, [emit])

  const handleRefreshRooms = useCallback(() => {
    emit('rooms:refresh')
  }, [emit])

  const handleToggleReady = useCallback(() => {
    emit('room:ready')
  }, [emit])

  const handleStartGame = useCallback(() => {
    emit('room:start')
  }, [emit])

  // Connect phase
  if (phase === 'connect') {
    return (
      <div className="lobby">
        <h1>卡牌平台</h1>
        <p className="lobby-subtitle">可插拔的联机卡牌游戏平台</p>
        <div className="connect-panel">
          <h2>连接服务器</h2>
          {connectError && <div className="error-message">连接失败: {connectError}</div>}
          <div className="connect-input-row">
            <input
              type="text"
              placeholder="输入服务器地址 (如 192.168.1.100:3000)"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect(serverInput)}
            />
            <button onClick={() => handleConnect(serverInput)}>连接</button>
          </div>
          {serverHistory.length > 0 && (
            <div className="server-history">
              <p>历史记录:</p>
              <ul>
                {serverHistory.map((url, i) => (
                  <li key={i}>
                    <button onClick={() => {
                      setServerInput(url)
                      handleConnect(url)
                    }}>
                      {url}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Lobby phase
  if (phase === 'lobby') {
    return (
      <div className="lobby">
        <h1>卡牌平台</h1>
        <p className="lobby-subtitle">已连接: {serverUrl}</p>
        {error && <div className="error-message">{error}</div>}
        <div className="lobby-actions">
          <div className="game-selector">
            <label>选择游戏:</label>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
            >
              {games.map((game) => (
                <option key={game} value={game}>{game}</option>
              ))}
            </select>
          </div>
          <button className="lobby-btn primary" onClick={handleCreateRoom}>
            创建房间
          </button>
          <button className="lobby-btn" onClick={handleDisconnect}>
            断开连接
          </button>
        </div>
        <div className="room-list">
          <div className="room-list-header">
            <h2>房间列表</h2>
            <button onClick={handleRefreshRooms}>刷新</button>
          </div>
          {rooms.length === 0 ? (
            <p className="no-rooms">暂无房间</p>
          ) : (
            <ul>
              {rooms.map((room) => (
                <li key={room.roomId} className="room-item">
                  <span className="room-game">{room.gameName}</span>
                  <span className="room-players">{room.players}/{room.maxPlayers}</span>
                  <span className="room-phase">{room.phase}</span>
                  {room.phase === 'waiting' && room.players < room.maxPlayers && (
                    <button onClick={() => handleJoinRoom(room.roomId, room.gameId)}>加入</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // Room phase
  if (phase === 'room') {
    const allReady = room.players.length > 0 && room.players.every(p => p.ready)
    return (
      <div className="room-page">
        <h2>房间</h2>
        <p className="room-game-id">游戏: {room.gameId}</p>
        {error && <div className="error-message">{error}</div>}
        <div className="room-link-box">
          <input
            readOnly
            value={`${window.location.origin}?join=${room.roomId}`}
          />
          <button onClick={handleCopyLink}>
            {copied ? '已复制' : '复制链接'}
          </button>
        </div>
        <div className="room-player-list">
          <h3>玩家列表</h3>
          <ul>
            {room.players.map((p) => (
              <li key={p.id} className={`room-player-item ${p.connected ? '' : 'disconnected'}`}>
                <span className="player-name">
                  {p.name}
                  {p.id === playerId && ' (你)'}
                  {room.isHost && p.id === playerId && ' 👑'}
                </span>
                <span className="player-status">
                  {p.ready ? '✅ 准备就绪' : '⏳ 未准备'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="room-actions">
          <button className="ready-btn" onClick={handleToggleReady}>
            {room.players.find(p => p.id === playerId)?.ready ? '取消准备' : '准备'}
          </button>
          {room.isHost && (
            <button
              className="start-btn"
              onClick={handleStartGame}
              disabled={!allReady || room.players.length < 2}
            >
              开始游戏
            </button>
          )}
          <button className="lobby-btn" onClick={handleLeaveRoom}>
            退出房间
          </button>
        </div>
      </div>
    )
  }

  // Paused phase
  if (phase === 'paused') {
    return (
      <div className="lobby">
        <h2>游戏暂停</h2>
        <p>对手断线，等待重连...</p>
        <span className="back-link" onClick={handleLeaveRoom}>
          返回大厅
        </span>
      </div>
    )
  }

  // Ended phase
  if (phase === 'ended') {
    const isWinner = winnerId === playerId
    return (
      <div className="lobby">
        <h2>游戏结束</h2>
        <p>{isWinner ? '你赢了！' : '你输了'}</p>
        <div className="lobby-actions">
          <button className="lobby-btn primary" onClick={handlePlayAgain}>
            再来一局
          </button>
          <button className="lobby-btn" onClick={handleLeaveRoom}>
            返回大厅
          </button>
        </div>
      </div>
    )
  }

  // Playing phase
  if (!gameState || !gamePlugin) {
    return <div className="lobby"><p>加载中...</p></div>
  }

  const GameComponent = gamePlugin.GameComponent
  return (
    <div className="game-room">
      {error && <div className="error-message">{error}</div>}
      <div className="game-room-top-bar">
        <button className="game-leave-btn" onClick={handleLeaveRoom}>
          退出房间
        </button>
      </div>
      <GameComponent
        state={gameState}
        playerId={playerId}
        onAction={handleAction}
      />
    </div>
  )
}

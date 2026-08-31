import { useState, useEffect, useCallback, useRef } from 'react'
import { useSocket } from '@huiming/core-client/hooks/useSocket'
import { useGamePlugin, registerClientPluginLoader } from '@huiming/core-client/hooks/useGamePlugin'
import type { ClientState, RoomSummary } from '@huiming/core-shared'

// Register plugin loaders for lazy loading
registerClientPluginLoader('huiming', () =>
  import('huiming/ui/client-plugin').then(m => m.huimingClientPlugin)
)

type AppPhase = 'connect' | 'lobby' | 'waiting' | 'playing' | 'paused' | 'ended'

export function App() {
  const { emit, on, playerId, connected, serverUrl, connect, disconnect, serverHistory } = useSocket()
  const [phase, setPhase] = useState<AppPhase>('connect')
  const [roomId, setRoomId] = useState<string>('')
  const [games, setGames] = useState<string[]>([])
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [gameState, setGameState] = useState<ClientState | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [serverInput, setServerInput] = useState('')
  const [currentGameId, setCurrentGameId] = useState<string | null>(null)
  const stateVersionRef = useRef(0)
  const gamePlugin = useGamePlugin(currentGameId || '')

  // Listen for events
  useEffect(() => {
    if (!connected) return

    const cleanups = [
      on('player:welcome', ({ playerId: pid, games: gameList }: { playerId: string; games: string[] }) => {
        setGames(gameList)
        setPhase('lobby')
      }),
      on('rooms:list', (roomList: RoomSummary[]) => {
        setRooms(roomList)
      }),
      on('room:created', ({ roomId: rid }: { roomId: string }) => {
        setRoomId(rid)
        setPhase('waiting')
      }),
      on('room:joined', () => {
        setPhase('playing')
      }),
      on('game:stateUpdate', ({ state, version }: { state: ClientState; version?: number }) => {
        // Ignore older versions
        if (version !== undefined && version < stateVersionRef.current) {
          return
        }
        setGameState(state)
        if (version !== undefined) {
          stateVersionRef.current = version
        }
        if (phase !== 'paused') {
          setPhase('playing')
        }
      }),
      on('game:error', ({ reason }: { reason: string }) => {
        setError(reason)
        setTimeout(() => setError(null), 3000)
      }),
      on('room:error', ({ reason }: { reason: string }) => {
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
      on('room:playerLeft', ({ playerId: pid }: { playerId: string }) => {
        setError('对手已离开房间')
        setTimeout(() => setError(null), 3000)
        setPhase('lobby')
        setRoomId('')
        setGameState(null)
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
        setRoomId(joinRoomId)
      }
    }
  }, [connected, phase, emit])

  const handleConnect = useCallback((url: string) => {
    if (!url) return
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url
    }
    connect(url)
  }, [connect])

  const handleDisconnect = useCallback(() => {
    disconnect()
    setPhase('connect')
    setRoomId('')
    setGameState(null)
    setWinnerId(null)
  }, [disconnect])

  const handleCreateRoom = useCallback(() => {
    emit('room:create', { gameId: 'huiming' })
    setCurrentGameId('huiming')
  }, [emit])

  const handleJoinRoom = useCallback((rid: string, gameId?: string) => {
    emit('room:join', { roomId: rid })
    setRoomId(rid)
    if (gameId) {
      setCurrentGameId(gameId)
    }
  }, [emit])

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}?join=${roomId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [roomId])

  const handleAction = useCallback((event: string, payload: any) => {
    emit('game:action', { event, payload })
  }, [emit])

  const handleLeaveRoom = useCallback(() => {
    emit('room:leave')
    setPhase('lobby')
    setRoomId('')
    setGameState(null)
    setWinnerId(null)
  }, [emit])

  const handlePlayAgain = useCallback(() => {
    emit('room:again')
  }, [emit])

  const handleRefreshRooms = useCallback(() => {
    emit('rooms:refresh')
  }, [emit])

  // Connect phase
  if (phase === 'connect') {
    return (
      <div className="lobby">
        <h1>卡牌平台</h1>
        <p className="lobby-subtitle">可插拔的联机卡牌游戏平台</p>
        <div className="connect-panel">
          <h2>连接服务器</h2>
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
          <button className="lobby-btn primary" onClick={handleCreateRoom}>
            创建房间
          </button>
          <button className="lobby-btn" onClick={handleDisconnect}>
            断开连接
          </button>
          {games.length > 0 && (
            <p className="lobby-game-list">可用游戏: {games.join(', ')}</p>
          )}
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

  // Waiting phase
  if (phase === 'waiting') {
    return (
      <div className="waiting-room">
        <h2>等待对手加入</h2>
        {error && <div className="error-message">{error}</div>}
        <div className="room-link-box">
          <input
            readOnly
            value={`${window.location.origin}?join=${roomId}`}
          />
          <button onClick={handleCopyLink}>
            {copied ? '已复制' : '复制链接'}
          </button>
        </div>
        <p className="waiting-dots">等待中...</p>
        <span className="back-link" onClick={handleLeaveRoom}>
          返回大厅
        </span>
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
      <GameComponent
        state={gameState}
        playerId={playerId}
        onAction={handleAction}
      />
    </div>
  )
}

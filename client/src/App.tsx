import { useState, useEffect, useCallback, useRef } from 'react'
import { useSocket } from '@huiming/core-client/hooks/useSocket'
import { useGamePlugin, registerClientPluginLoader } from '@huiming/core-client/hooks/useGamePlugin'
import { useAudio } from '@huiming/core-client/hooks'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthScreen } from './components/AuthScreen'
import { SettingsPage } from './components/SettingsPage'
import type { ClientState, RoomSummary } from '@huiming/core-shared'

// Register plugin loaders for lazy loading
registerClientPluginLoader('huiming', () =>
  import('huiming/ui/client-plugin').then(m => m.huimingClientPlugin)
)
registerClientPluginLoader('landlord', () =>
  import('landlord/ui/client-plugin').then(m => m.landlordClientPlugin)
)
registerClientPluginLoader('nimmt', () =>
  import('nimmt/ui/client-plugin').then(m => m.nimmtClientPlugin)
)

function getStoredPlayerId(): string {
  let id = localStorage.getItem('huiming-player-id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('huiming-player-id', id) }
  return id
}
function getStoredPlayerName(): string {
  return localStorage.getItem('huiming-player-name') || 'Player'
}

type AppPhase = 'connect' | 'auth' | 'lobby' | 'room' | 'playing' | 'paused' | 'ended' | 'settings'

/** All room-related state, always updated as a single unit from server events. */
interface RoomView {
  roomId: string
  gameId: string
  isHost: boolean
  players: { id: string; name: string; connected: boolean; ready: boolean }[]
}

const EMPTY_ROOM: RoomView = { roomId: '', gameId: '', isHost: false, players: [] }

/**
 * Waiting-room screen. Plays the welcome theme while players wait, looping until
 * the host starts the game (at which point this screen unmounts and the game
 * view takes over the soundtrack).
 */
function RoomScreen({
  room, error, playerId, allReady, copied,
  onCopyLink, onToggleReady, onStartGame, onLeaveRoom,
}: {
  room: RoomView
  error: string | null
  playerId: string
  allReady: boolean
  copied: boolean
  onCopyLink: () => void
  onToggleReady: () => void
  onStartGame: () => void
  onLeaveRoom: () => void
}) {
  useAudio('welcome')
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
        <button onClick={onCopyLink}>
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
        <button className="ready-btn" onClick={onToggleReady}>
          {room.players.find(p => p.id === playerId)?.ready ? '取消准备' : '准备'}
        </button>
        {room.isHost && (
          <button
            className="start-btn"
            onClick={onStartGame}
            disabled={!allReady || room.players.length < 2}
          >
            开始游戏
          </button>
        )}
        <button className="lobby-btn" onClick={onLeaveRoom}>
          退出房间
        </button>
      </div>
    </div>
  )
}

/**
 * Settlement screen. Resolves the winner correctly: role-based games (landlord)
 * compare the winning *role* against the player's own role, while it-based
 * games (huiming) compare winnerId against the player id.
 */
function EndedScreen({
  winnerId, playerId, gameState, onPlayAgain, onLeaveRoom,
}: {
  winnerId: string | null
  playerId: string
  gameState: ClientState | null
  onPlayAgain: () => void
  onLeaveRoom: () => void
}) {
  const [waiting, setWaiting] = useState(false)
  const myRole = (gameState as any)?.myRole
  const roleWinner = myRole !== undefined ? (gameState as any)?.winner : undefined
  const hasWinner = winnerId != null || roleWinner != null
  const isWinner = roleWinner !== undefined
    ? roleWinner === myRole
    : winnerId === playerId
  useAudio(!hasWinner ? 'normal' : (isWinner ? 'win' : 'lose'))

  const detail = roleWinner != null
    ? `${roleWinner === 'landlord' ? '地主' : '农民'}获胜牌局`
    : null

  const handlePlayAgain = () => {
    setWaiting(true)
    onPlayAgain()
  }

  return (
    <div className="lobby">
      <h2>游戏结束</h2>
      <p>{!hasWinner ? '游戏结束' : (isWinner ? '你赢了！' : '你输了')}</p>
      {detail && <p className="lobby-subtitle">{detail}</p>}
      <div className="lobby-actions">
        <button
          className="lobby-btn primary"
          onClick={handlePlayAgain}
          disabled={waiting}
        >
          {waiting ? '等待其他玩家...' : '再来一局'}
        </button>
        <button className="lobby-btn" onClick={onLeaveRoom}>
          返回大厅
        </button>
      </div>
    </div>
  )
}

function PausedScreen({ onLeaveRoom }: { onLeaveRoom: () => void }) {
  return (
    <div className="lobby">
      <h2>游戏暂停</h2>
      <p>对手断线，等待重连...</p>
      <span className="back-link" onClick={onLeaveRoom}>
        返回大厅
      </span>
    </div>
  )
}

/** Avatar SVG for lobby display */
const AVATAR_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e84393', '#636e72', '#2d3436',
]

function LobbyAvatar({ id, size = 32 }: { id: number; size?: number }) {
  const color = AVATAR_COLORS[id] || AVATAR_COLORS[0]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill={color} />
      <circle cx="24" cy="18" r="8" fill="white" opacity="0.9" />
      <ellipse cx="24" cy="38" rx="14" ry="10" fill="white" opacity="0.9" />
    </svg>
  )
}

/** Inner app component that uses auth context */
function AppInner() {
  const { emit, on, playerId, connected, serverUrl, connectError, authError, serverPasswordRequired, connectedToken, connect, disconnect, serverHistory } = useSocket()
  const auth = useAuth()
  const [phase, setPhase] = useState<AppPhase>('connect')

  // Sync socket's serverUrl into AuthContext so logout/updateProfile/refreshToken work
  useEffect(() => {
    auth.setServerUrl(serverUrl)
  }, [serverUrl, auth.setServerUrl])

  // Auto-login path: the socket connected with a saved token (server verified it
  // and player:welcome brought back the profile), but the auth context only got
  // the user via updateProfile — never the token, since auth.login was bypassed.
  // Settings/profile APIs require auth.token, so sync it once connected.
  useEffect(() => {
    if (connected && connectedToken && auth.user && !auth.token) {
      auth.setToken(connectedToken)
    }
  }, [connected, connectedToken, auth.user, auth.token, auth.setToken])
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
      on('player:welcome', ({ playerId: pid, games: gameList, userProfile }: { playerId: string; games: string[]; userProfile?: any }) => {
        setGames(gameList)
        if (userProfile) {
          auth.updateProfile(userProfile)
          // Only change phase if coming from connect/auth (not when already in lobby/room/settings)
          setPhase(prev => prev === 'connect' || prev === 'auth' ? 'lobby' : prev)
        } else {
          // Not authenticated — must login/register before entering
          setPhase('auth')
        }
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
        console.log('[room:created]', { roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList.length })
        pendingRetryRef.current = null
        stateVersionRef.current = 0
        setGameState(null)
        setWinnerId(null)
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        setPhase('room')
      }),
      on('room:joined', (data: { gameId: string; playerList: { id: string; name: string; connected: boolean; ready: boolean }[]; isHost: boolean; roomId: string }) => {
        pendingRetryRef.current = null
        stateVersionRef.current = 0
        setGameState(null)
        setWinnerId(null)
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        setPhase('room')
      }),
      on('room:updated', (data: { roomId: string; gameId: string; playerList: { id: string; name: string; connected: boolean; ready: boolean }[]; isHost: boolean }) => {
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        if (phase === 'connect' || phase === 'lobby' || phase === 'auth') {
          stateVersionRef.current = 0
          setGameState(null)
          setPhase('room')
        }
      }),
      on('room:againAccepted', () => {
        stateVersionRef.current = 0
        setGameState(null)
        setWinnerId(null)
      }),
      on('game:stateUpdate', ({ state, version, gameId }: { state: ClientState; version?: number; gameId?: string }) => {
        if (version !== undefined && version < stateVersionRef.current) {
          return
        }
        setGameState(state)
        if (version !== undefined) {
          stateVersionRef.current = version
        }
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
          const pending = pendingRetryRef.current
          if (pending) {
            emit('player:hello', { playerId: getStoredPlayerId(), name: getStoredPlayerName() })
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
  }, [on, phase, connected, auth])

  // Auto-connect on first boot
  const didAutoConnectRef = useRef(false)
  useEffect(() => {
    const origin = window.location.origin
    if (!didAutoConnectRef.current && phase === 'connect' && !connected && origin.startsWith('http')) {
      didAutoConnectRef.current = true
      // Check if we have saved credentials for this origin
      const savedToken = auth.getSavedCredential(origin)?.token
      connect(origin, savedToken ? { token: savedToken } : undefined)
    }
  }, [phase, connected, connect, auth])

  // Handle auth errors — transition to auth phase
  useEffect(() => {
    if (authError && phase !== 'auth') {
      setPhase('auth')
    }
  }, [authError, phase])

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

  const handleConnect = useCallback((url: string, serverPassword?: string) => {
    if (!url) return
    // Check for saved token
    const savedToken = auth.getSavedCredential(url)?.token
    connect(url, { token: savedToken || undefined, serverPassword })
  }, [connect, auth])

  const handleAuthSuccess = useCallback((token: string, username: string, user: any) => {
    auth.login(token, username, user)
    auth.saveCredential(serverUrl || '', username, token, user.displayName)
    // Reconnect with token
    if (serverUrl) {
      connect(serverUrl, { token })
    }
  }, [auth, serverUrl, connect])

  const handleDisconnect = useCallback(() => {
    disconnect()
    setPhase('connect')
    setRoom(EMPTY_ROOM)
    setGameState(null)
    setWinnerId(null)
  }, [disconnect])

  const handleLogout = useCallback(() => {
    auth.logout()
    disconnect()
    setPhase('connect')
    setRoom(EMPTY_ROOM)
    setGameState(null)
    setWinnerId(null)
  }, [auth, disconnect])

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

  // Auth phase
  if (phase === 'auth' && serverUrl) {
    return (
      <AuthScreen
        serverUrl={serverUrl}
        onAuthSuccess={handleAuthSuccess}
        onBack={() => {
          disconnect()
          setPhase('connect')
        }}
      />
    )
  }

  // Settings phase. Rendered unconditionally so it can never fall through to
  // the playing-phase loading fallback; if the session was lost while the
  // settings page was open (token cleared, disconnected, etc.) show a recovery
  // screen instead.
  if (phase === 'settings') {
    if (auth.user && auth.token && serverUrl) {
      return (
        <SettingsPage
          serverUrl={serverUrl}
          token={auth.token}
          user={auth.user}
          onBack={() => setPhase('lobby')}
          onProfileUpdate={auth.updateProfile}
          onLogout={handleLogout}
        />
      )
    }
    console.warn('[settings] blocked — session lost', {
      phase,
      hasUser: !!auth.user,
      hasToken: !!auth.token,
      socketUrl: serverUrl,
      authUrl: auth.serverUrl,
    })
    return (
      <div className="lobby">
        <h2>登录状态已失效</h2>
        <p>会话已断开，请重新连接。</p>
        <div className="lobby-actions">
          <button className="lobby-btn primary" onClick={() => setPhase(serverUrl ? 'lobby' : 'connect')}>
            返回
          </button>
        </div>
      </div>
    )
  }

  // Connect phase
  if (phase === 'connect') {
    return (
      <div className="lobby">
        <h1>欢乐卡牌</h1>
        <p className="lobby-subtitle">联机卡牌游戏平台</p>
        <div className="connect-panel">
          <h2>连接服务器</h2>
          {connectError && <div className="error-message">连接失败: {connectError}</div>}
          {authError && <div className="error-message">{authError}</div>}
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
          {serverPasswordRequired && (
            <div className="connect-input-row">
              <input
                type="password"
                placeholder="输入服务器密码"
                id="server-password-input"
              />
              <button onClick={() => {
                const pwInput = document.getElementById('server-password-input') as HTMLInputElement
                handleConnect(serverInput, pwInput?.value)
              }}>
                连接
              </button>
            </div>
          )}
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
        <div className="lobby-header">
          <h1>欢乐卡牌</h1>
          {auth.user && (
            <div className="lobby-user-bar">
              <LobbyAvatar id={auth.user.avatarId} size={28} />
              <span className="lobby-username">{auth.user.displayName}</span>
              <span className="lobby-coins">🪙 {auth.user.coins}</span>
              <button className="lobby-settings-btn" onClick={() => setPhase('settings')}>
                设置
              </button>
              <button className="lobby-settings-btn" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          )}
        </div>
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
      <RoomScreen
        room={room}
        error={error}
        playerId={playerId}
        allReady={allReady}
        copied={copied}
        onCopyLink={handleCopyLink}
        onToggleReady={handleToggleReady}
        onStartGame={handleStartGame}
        onLeaveRoom={handleLeaveRoom}
      />
    )
  }

  // Paused phase
  if (phase === 'paused') {
    return <PausedScreen onLeaveRoom={handleLeaveRoom} />
  }

  // Ended phase
  if (phase === 'ended') {
    return (
      <EndedScreen
        winnerId={winnerId}
        playerId={playerId}
        gameState={gameState}
        onPlayAgain={handlePlayAgain}
        onLeaveRoom={handleLeaveRoom}
      />
    )
  }

  // Playing phase — the only phase that may show the loading fallback.
  if (phase === 'playing') {
    if (!gameState || !gamePlugin) {
      return <div className="lobby"><p>加载中...</p></div>
    }

    const GameComponent = gamePlugin.GameComponent
    return (
      <div className="game-room" data-game={room.gameId}>
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

  // Unknown phase — never fall through to the loading screen.
  return null
}

/** Root component wraps with AuthProvider */
export function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

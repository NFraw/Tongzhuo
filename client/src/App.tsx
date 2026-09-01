/**
 * App.tsx — 客户端根组件
 *
 * 管理整个客户端的应用状态和页面路由。
 * 类比 Java：相当于一个 MainController + Router。
 *
 * 应用阶段（AppPhase）：
 *   connect  → 连接服务器界面
 *   auth     → 登录/注册界面
 *   lobby    → 大厅（房间列表、创建房间）
 *   room     → 等待房间（玩家列表、准备、开始）
 *   playing  → 游戏中（加载游戏插件组件）
 *   paused   → 暂停（对手断线）
 *   ended    → 结算（胜利/失败、再来一局）
 *   settings → 设置（修改资料、退出登录）
 *
 * 架构设计：
 *   - AppInner 是真正的业务组件，使用 useSocket/useAuth 等 Hook
 *   - App 是根组件，包裹 AuthProvider（提供登录状态上下文）
 *   - 游戏插件通过 registerClientPluginLoader() 懒加载
 *
 * 【如果你想添加新游戏】：
 *   1. 在 registerClientPluginLoader() 中注册新的插件加载器
 *   2. 在 server/src/index.ts 中注册对应的服务器插件
 *   3. 实现 GameClientPlugin 接口（GameComponent + 可选 renderer）
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSocket } from '@huiming/core-client/hooks/useSocket'
import { useGamePlugin, registerClientPluginLoader } from '@huiming/core-client/hooks/useGamePlugin'
import { useAudio } from '@huiming/core-client/hooks'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthScreen } from './components/AuthScreen'
import { SettingsPage } from './components/SettingsPage'
import type { ClientState, RoomSummary } from '@huiming/core-shared'

// 注册游戏插件懒加载器（import() 动态导入，首屏不加载游戏代码）
registerClientPluginLoader('huiming', () =>
  import('huiming/ui/client-plugin').then(m => m.huimingClientPlugin)
)
registerClientPluginLoader('landlord', () =>
  import('landlord/ui/client-plugin').then(m => m.landlordClientPlugin)
)
registerClientPluginLoader('nimmt', () =>
  import('nimmt/ui/client-plugin').then(m => m.nimmtClientPlugin)
)

/** 从 localStorage 获取 playerId（不存在则生成） */
function getStoredPlayerId(): string {
  let id = localStorage.getItem('huiming-player-id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('huiming-player-id', id) }
  return id
}

/** 从 localStorage 获取玩家昵称 */
function getStoredPlayerName(): string {
  return localStorage.getItem('huiming-player-name') || 'Player'
}

/** 应用阶段类型 */
type AppPhase = 'connect' | 'auth' | 'lobby' | 'room' | 'playing' | 'paused' | 'ended' | 'settings'

/**
 * 房间视图状态。
 * 所有房间相关状态作为一个整体更新，避免状态不一致。
 */
interface RoomView {
  roomId: string
  gameId: string
  isHost: boolean
  players: { id: string; name: string; connected: boolean; ready: boolean }[]
}

/** 空房间初始值 */
const EMPTY_ROOM: RoomView = { roomId: '', gameId: '', isHost: false, players: [] }

/**
 * 等待房间界面。
 * 播放大厅 BGM，直到房主开始游戏（此组件卸载，游戏视图接管音频）。
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
  const { setBgmScene } = useAudio()
  useEffect(() => {
    setBgmScene('lobby')
  }, [setBgmScene])
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
 * 结算界面。
 * 正确处理两种胜利判定：
 *   - 角色制游戏（斗地主）：比较获胜"角色"与玩家自己的角色
 *   - ID 制游戏（晦明）：比较 winnerId 与玩家自己的 ID
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
  const { setBgmScene } = useAudio()
  useEffect(() => {
    setBgmScene(null)  // 游戏结束，停止 BGM
  }, [setBgmScene])

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

/** 暂停界面（对手断线等待重连） */
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

/** 头像颜色列表 */
const AVATAR_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e84393', '#636e72', '#2d3436',
]

/** 大厅头像 SVG 组件 */
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

/**
 * 内部应用组件（使用 useSocket/useAuth 等 Hook）。
 *
 * 事件监听架构：
 *   - 使用 useEffect 注册所有 Socket.IO 事件监听
 *   - 每个事件更新对应的 React state
 *   - state 变化驱动 UI 重新渲染
 *   - 组件卸载时清理所有监听器
 */
function AppInner() {
  const { emit, on, playerId, connected, serverUrl, connectError, authError, serverPasswordRequired, connectedToken, connect, disconnect, serverHistory } = useSocket()
  const auth = useAuth()
  const [phase, setPhase] = useState<AppPhase>('connect')

  // 同步 socket 的 serverUrl 到 AuthContext（logout/updateProfile/refreshToken 需要）
  useEffect(() => {
    auth.setServerUrl(serverUrl)
  }, [serverUrl, auth.setServerUrl])

  // 自动登录路径：socket 用保存的 token 连接成功后，同步 token 到 AuthContext
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

  // ─── 事件监听 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return

    const cleanups = [
      // 握手成功：收到服务器欢迎消息
      on('player:welcome', ({ playerId: pid, games: gameList, userProfile }: { playerId: string; games: string[]; userProfile?: any }) => {
        setGames(gameList)
        if (userProfile) {
          auth.updateProfile(userProfile)
          setPhase(prev => prev === 'connect' || prev === 'auth' ? 'lobby' : prev)
        } else {
          setPhase('auth')
        }
        // 如果有待重试的操作（NEED_HELLO），现在执行
        const pending = pendingRetryRef.current
        if (pending) {
          pendingRetryRef.current = null
          setTimeout(() => emit(pending.event, pending.payload), 100)
        }
      }),
      on('rooms:list', (roomList: RoomSummary[]) => {
        setRooms(roomList)
      }),
      // 房间创建成功
      on('room:created', (data: { roomId: string; gameId: string; hostId: string; playerList: { id: string; name: string; connected: boolean; ready: boolean }[]; isHost: boolean }) => {
        console.log('[room:created]', { roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList.length })
        pendingRetryRef.current = null
        stateVersionRef.current = 0
        setGameState(null)
        setWinnerId(null)
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        setPhase('room')
      }),
      // 加入房间成功
      on('room:joined', (data: { gameId: string; playerList: { id: string; name: string; connected: boolean; ready: boolean }[]; isHost: boolean; roomId: string }) => {
        pendingRetryRef.current = null
        stateVersionRef.current = 0
        setGameState(null)
        setWinnerId(null)
        setRoom({ roomId: data.roomId, gameId: data.gameId, isHost: data.isHost, players: data.playerList })
        setPhase('room')
      }),
      // 房间状态更新（有人加入/离开/准备）
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
      // 游戏状态更新（核心：每收到一次就刷新整个游戏 UI）
      on('game:stateUpdate', ({ state, version, gameId }: { state: ClientState; version?: number; gameId?: string }) => {
        if (version !== undefined && version < stateVersionRef.current) {
          return  // 忽略过时的状态
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
      // 游戏错误（临时提示）
      on('game:error', ({ reason }: { reason: string }) => {
        setError(reason)
        setTimeout(() => setError(null), 3000)
      }),
      on('game:opponentDisconnected', () => {
        setError('对手已断开连接，等待重连…')
        setTimeout(() => setError(null), 5000)
      }),
      // 房间错误（NEED_HELLO 时自动重试）
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
      // 游戏结束
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
      // 有人离开房间
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

  // ─── 自动连接 ─────────────────────────────────────────────────────────
  const didAutoConnectRef = useRef(false)
  useEffect(() => {
    const origin = window.location.origin
    if (!didAutoConnectRef.current && phase === 'connect' && !connected && origin.startsWith('http')) {
      didAutoConnectRef.current = true
      const savedToken = auth.getSavedCredential(origin)?.token
      connect(origin, savedToken ? { token: savedToken } : undefined)
    }
  }, [phase, connected, connect, auth])

  // Token 错误时切换到登录界面
  useEffect(() => {
    if (authError && phase !== 'auth') {
      setPhase('auth')
    }
  }, [authError, phase])

  // URL 有 ?join=roomId 时自动加入房间
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

  // ─── 事件处理函数 ─────────────────────────────────────────────────────
  const handleConnect = useCallback((url: string, serverPassword?: string) => {
    if (!url) return
    const savedToken = auth.getSavedCredential(url)?.token
    connect(url, { token: savedToken || undefined, serverPassword })
  }, [connect, auth])

  const handleAuthSuccess = useCallback((token: string, username: string, user: any) => {
    auth.login(token, username, user)
    auth.saveCredential(serverUrl || '', username, token, user.displayName)
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

  /** 发送游戏动作到服务器 */
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

  // ─── 页面路由 ─────────────────────────────────────────────────────────

  // 登录/注册页面
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

  // 设置页面（无条件渲染，避免会话丢失时卡在加载中）
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

  // 连接页面
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

  // 大厅页面
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

  // 等待房间页面
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

  // 暂停页面
  if (phase === 'paused') {
    return <PausedScreen onLeaveRoom={handleLeaveRoom} />
  }

  // 结算页面
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

  // 游戏中页面（唯一可能显示"加载中"的阶段）
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
          playerNames={Object.fromEntries(room.players.map(p => [p.id, p.name]))}
        />
      </div>
    )
  }

  // 未知阶段（防御性代码，不应到达）
  return null
}

/** 根组件：包裹 AuthProvider（提供登录状态上下文） */
export function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useSocket } from '@huiming/core-client/hooks/useSocket'
import { registerClientPlugin } from '@huiming/core-client/hooks/useGamePlugin'
import { huimingClientPlugin } from 'huiming/ui/client-plugin'
import type { ClientState } from '@huiming/core-shared'

// Register plugins on load
registerClientPlugin(huimingClientPlugin)

type AppPhase = 'lobby' | 'waiting' | 'playing'

export function App() {
  const { emit, on, socketId } = useSocket()
  const [phase, setPhase] = useState<AppPhase>('lobby')
  const [roomId, setRoomId] = useState<string>('')
  const [games, setGames] = useState<string[]>([])
  const [gameState, setGameState] = useState<ClientState | null>(null)
  const [copied, setCopied] = useState(false)

  // Listen for events
  useEffect(() => {
    const cleanups = [
      on('games:list', (data: string[]) => setGames(data)),
      on('room:created', ({ roomId }: { roomId: string }) => {
        setRoomId(roomId)
        setPhase('waiting')
      }),
      on('room:joined', () => setPhase('playing')),
      on('game:stateUpdate', ({ state }: { state: ClientState }) => {
        setGameState(state)
        setPhase('playing')
      }),
      on('game:error', ({ reason }: { reason: string }) => {
        console.error('Game error:', reason)
      }),
      on('room:error', ({ reason }: { reason: string }) => {
        console.error('Room error:', reason)
      }),
      on('room:full', () => console.error('Room is full')),
      on('room:notFound', () => console.error('Room not found')),
    ]
    return () => cleanups.forEach(fn => fn())
  }, [on])

  // Auto-join if URL has roomId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const joinRoomId = params.get('join')
    if (joinRoomId) {
      emit('room:join', { roomId: joinRoomId })
      setRoomId(joinRoomId)
    }
  }, [emit])

  const handleCreateRoom = useCallback(() => {
    emit('room:create', { gameId: 'huiming' })
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

  const handleBackToLobby = useCallback(() => {
    setPhase('lobby')
    setRoomId('')
    setGameState(null)
  }, [])

  if (phase === 'lobby') {
    return (
      <div className="lobby">
        <h1>卡牌平台</h1>
        <p className="lobby-subtitle">可插拔的联机卡牌游戏平台</p>
        <div className="lobby-actions">
          <button className="lobby-btn primary" onClick={handleCreateRoom}>
            创建房间
          </button>
          {games.length > 0 && (
            <p className="lobby-game-list">可用游戏: {games.join(', ')}</p>
          )}
        </div>
      </div>
    )
  }

  if (phase === 'waiting') {
    return (
      <div className="waiting-room">
        <h2>等待对手加入</h2>
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
        <span className="back-link" onClick={handleBackToLobby}>
          返回大厅
        </span>
      </div>
    )
  }

  // Playing phase
  if (!gameState) {
    return <div className="lobby"><p>加载中...</p></div>
  }

  const GameComponent = huimingClientPlugin.GameComponent
  return (
    <div className="game-room">
      <GameComponent
        state={gameState}
        playerId={socketId}
        onAction={handleAction}
      />
    </div>
  )
}

import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const PLAYER_ID_KEY = 'huiming-player-id'
const PLAYER_NAME_KEY = 'huiming-player-name'
const SERVER_HISTORY_KEY = 'huiming-server-history'

function getOrCreatePlayerId(): string {
  let playerId = localStorage.getItem(PLAYER_ID_KEY)
  if (!playerId) {
    playerId = crypto.randomUUID()
    localStorage.setItem(PLAYER_ID_KEY, playerId)
  }
  return playerId
}

function getPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) || 'Player'
}

function getServerHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SERVER_HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

function saveServerHistory(url: string): void {
  const history = getServerHistory()
  const filtered = history.filter(u => u !== url)
  filtered.unshift(url)
  localStorage.setItem(SERVER_HISTORY_KEY, JSON.stringify(filtered.slice(0, 10)))
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [socketId, setSocketId] = useState<string>('')
  const [playerId, setPlayerId] = useState<string>('')
  const [connected, setConnected] = useState(false)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

  const connect = useCallback((url: string) => {
    // Disconnect existing socket
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setConnectError(null)

    // When the user types a bare host (LAN IP or tunnel domain) without a
    // protocol, try http:// first, then fall back to https://. NAT tunnels
    // (cpolar/ngrok) are usually HTTPS-only, so prepending http:// alone fails.
    const hasProtocol = /^https?:\/\//.test(url)
    const candidates = hasProtocol ? [url] : [`http://${url}`, `https://${url}`]

    const tryCandidate = (index: number) => {
      if (index >= candidates.length) {
        setConnected(false)
        return
      }

      const target = candidates[index]
      const socket = io(target, {
        // Start with HTTP long-polling (works through almost any NAT tunnel /
        // reverse proxy), then upgrade to WebSocket if the tunnel supports it.
        transports: ['polling', 'websocket'],
      })
      socketRef.current = socket
      setServerUrl(target)
      saveServerHistory(target)

      socket.on('connect', () => {
        setSocketId(socket.id || '')
        setConnected(true)

        // Send handshake
        const pid = getOrCreatePlayerId()
        const name = getPlayerName()
        socket.emit('player:hello', { playerId: pid, name })
        setPlayerId(pid)
      })

      socket.on('disconnect', () => {
        setConnected(false)
      })

      socket.on('connect_error', (err) => {
        // We guessed the protocol (no explicit scheme): retry with https.
        if (!hasProtocol && index === 0) {
          socket.disconnect()
          socketRef.current = null
          tryCandidate(index + 1)
          return
        }
        console.error('Connection error:', err)
        setConnected(false)
        setConnectError(err.message || String(err))
      })
    }

    tryCandidate(0)
  }, [])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setConnected(false)
    setSocketId('')
    setServerUrl(null)
  }, [])

  const emit = useCallback((event: string, payload?: any) => {
    socketRef.current?.emit(event, payload)
  }, [])

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler)
    return () => { socketRef.current?.off(event, handler) }
  }, [])

  return {
    emit,
    on,
    socket: socketRef,
    socketId,
    playerId,
    connected,
    serverUrl,
    connectError,
    connect,
    disconnect,
    serverHistory: getServerHistory(),
  }
}

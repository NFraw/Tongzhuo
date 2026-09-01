import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const PLAYER_ID_KEY = 'huiming-player-id'
const PLAYER_NAME_KEY = 'huiming-player-name'
const SERVER_HISTORY_KEY = 'huiming-server-history'
const CREDS_KEY = 'huiming-creds'

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

function getSavedToken(serverUrl: string): string | null {
  try {
    const creds = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}')
    return creds[serverUrl]?.token || null
  } catch {
    return null
  }
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [socketId, setSocketId] = useState<string>('')
  const [playerId, setPlayerId] = useState<string>('')
  const [connected, setConnected] = useState(false)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [serverPasswordRequired, setServerPasswordRequired] = useState(false)
  const [connectedToken, setConnectedToken] = useState<string | null>(null)

  const connect = useCallback((url: string, options?: { token?: string; serverPassword?: string }) => {
    // Disconnect existing socket
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setConnectError(null)
    setAuthError(null)
    setServerPasswordRequired(false)

    // When the user types a bare host without a protocol, try http:// first,
    // then fall back to https://.
    const hasProtocol = /^https?:\/\//.test(url)
    const candidates = hasProtocol ? [url] : [`http://${url}`, `https://${url}`]

    const tryCandidate = (index: number) => {
      if (index >= candidates.length) {
        setConnected(false)
        return
      }

      const target = candidates[index]

      // Build auth payload
      const auth: Record<string, string> = {}
      const token = options?.token || getSavedToken(target)
      setConnectedToken(token || null)
      if (token) auth.token = token
      if (options?.serverPassword) auth.serverPassword = options.serverPassword

      const socket = io(target, {
        transports: ['polling', 'websocket'],
        auth,
      })
      socketRef.current = socket
      setServerUrl(target)
      saveServerHistory(target)

      socket.on('connect', () => {
        setSocketId(socket.id || '')
        setConnected(true)
        setAuthError(null)
        setServerPasswordRequired(false)

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

        const message = err.message || String(err)

        // Auth-related errors
        if (message === 'SERVER_PASSWORD_REQUIRED' || message === 'SERVER_PASSWORD_INCORRECT') {
          setServerPasswordRequired(true)
          setAuthError(message === 'SERVER_PASSWORD_REQUIRED' ? '需要输入服务器密码' : '服务器密码错误')
          setConnected(false)
          return
        }

        if (message === 'AUTH_TOKEN_INVALID' || message === 'AUTH_TOKEN_EXPIRED') {
          setAuthError('登录已过期，请重新登录')
          setConnected(false)
          return
        }

        console.error('Connection error:', err)
        setConnected(false)
        setConnectError(message || '连接失败')
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
    setAuthError(null)
    setServerPasswordRequired(false)
    setConnectedToken(null)
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
    authError,
    serverPasswordRequired,
    connectedToken,
    connect,
    disconnect,
    serverHistory: getServerHistory(),
  }
}

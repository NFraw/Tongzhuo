import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseSocketOptions {
  serverUrl?: string
}

export function useSocket({ serverUrl }: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null)
  const [socketId, setSocketId] = useState<string>('')

  useEffect(() => {
    const url = serverUrl || new URLSearchParams(window.location.search).get('server') || window.location.origin
    const socket = io(url, { transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('connect', () => setSocketId(socket.id || ''))
    return () => { socket.disconnect() }
  }, [serverUrl])

  const emit = useCallback((event: string, payload?: any) => {
    socketRef.current?.emit(event, payload)
  }, [])

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler)
    return () => { socketRef.current?.off(event, handler) }
  }, [])

  return { emit, on, socket: socketRef, socketId }
}

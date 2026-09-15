/**
 * useSocket.ts — Socket.IO 连接管理 Hook
 *
 * 管理客户端与游戏服务器的 WebSocket 连接。
 * 这是整个客户端的"网络层"——所有与服务器的通信都通过这里。
 *
 * 职责：
 *   1. 连接/断开服务器
 *   2. 握手（player:hello）— 发送 playerId 和昵称
 *   3. 认证（token、服务器密码、版本检查）
 *   4. 提供 emit/on 接口给业务层使用
 *
 * localStorage 持久化：
 *   - huiming-player-id    — 玩家唯一 ID（UUID，首次生成后不变）
 *   - huiming-player-name  — 昵称
 *   - huiming-server-history — 最近连接的服务器列表
 *   - huiming-creds        — 登录 token（按服务器 URL 分 key）
 *
 * 类比 Java：相当于一个 SocketService，管理 WebSocket 连接生命周期。
 *
 * 【如果你想修改连接逻辑】：
 *   - connect() 中修改连接参数和认证流程
 *   - on('connect') 中修改握手逻辑
 *   - on('connect_error') 中修改错误处理
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { PROTOCOL_VERSION } from '@tongzhuo/core-shared'

const PLAYER_ID_KEY = 'huiming-player-id'
const PLAYER_NAME_KEY = 'huiming-player-name'
const SERVER_HISTORY_KEY = 'huiming-server-history'
const CREDS_KEY = 'huiming-creds'

/** 获取或创建玩家唯一 ID（UUID），首次生成后持久化到 localStorage */
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

/** 保存服务器连接历史（最近 10 个，最近的排最前） */
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

  /**
   * 连接到游戏服务器。
   *
   * @param url    - 服务器地址。可以带协议（http:// 或 https://），也可以不带。
   *                 不带协议时自动先尝试 http://，失败再尝试 https://。
   * @param options.token          - 登录 token（来自 AuthContext），用于自动认证。
   * @param options.serverPassword - 服务器密码（如果服务器要求）。
   *
   * 认证流程：
   *   1. 客户端通过 Socket.IO 的 `auth` 字段发送 token、serverPassword、clientVersion
   *   2. 服务器中间件验证：密码 → 版本 → token（详见 socket-framework.ts）
   *   3. 验证失败时服务器通过 connect_error 拒绝连接
   *   4. 验证成功后客户端发送 player:hello 完成握手
   *
   * 调用处：
   *   - App.tsx → handleConnect()（用户手动输入地址连接）
   *   - App.tsx → useEffect 自动连接（首次加载时连接当前 origin）
   *   - App.tsx → handleAuthSuccess()（登录成功后用 token 重连）
   */
  const connect = useCallback((url: string, options?: { token?: string; serverPassword?: string }) => {
    // 断开已有的连接（如果正在连接其他服务器）
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setConnectError(null)
    setAuthError(null)
    setServerPasswordRequired(false)

    // 当用户输入的地址没有协议前缀时，自动猜测：
    // 先尝试 http://（局域网常见），失败再尝试 https://
    const hasProtocol = /^https?:\/\//.test(url)
    const candidates = hasProtocol ? [url] : [`http://${url}`, `https://${url}`]

    /**
     * 尝试连接第 index 个候选地址。
     * 递归调用：如果第一个（http://）失败且没有显式协议，自动尝试第二个（https://）。
     */
    const tryCandidate = (index: number) => {
      if (index >= candidates.length) {
        setConnected(false)
        return
      }

      const target = candidates[index]

      // 构建认证 payload — Socket.IO 的 auth 字段会在握手时发送给服务器
      const auth: Record<string, string> = {}
      const token = options?.token || getSavedToken(target)
      setConnectedToken(token || null)
      if (token) auth.token = token
      if (options?.serverPassword) auth.serverPassword = options.serverPassword
      auth.clientVersion = PROTOCOL_VERSION  // 版本号，服务器检查兼容性

      // 创建 Socket.IO 连接
      // transports: 先用 polling（HTTP 轮询）建立连接，再升级到 websocket
      // 这样可以穿透大多数防火墙和代理
      const socket = io(target, {
        transports: ['polling', 'websocket'],
        auth,
      })
      socketRef.current = socket
      setServerUrl(target)
      saveServerHistory(target)  // 记录到连接历史

      // ─── 连接成功 ───
      socket.on('connect', () => {
        setSocketId(socket.id || '')
        setConnected(true)
        setAuthError(null)
        setServerPasswordRequired(false)

        // 握手：告诉服务器我是谁（playerId + 昵称）
        // playerId 是存在 localStorage 的 UUID，用于断线重连时识别身份
        const pid = getOrCreatePlayerId()
        const name = getPlayerName()
        socket.emit('player:hello', { playerId: pid, name })
        setPlayerId(pid)
      })

      // ─── 断开连接 ───
      socket.on('disconnect', () => {
        setConnected(false)
      })

      // ─── 连接错误 ───
      socket.on('connect_error', (err) => {
        // 协议回退：如果第一个候选（http://）失败，自动尝试 https://
        if (!hasProtocol && index === 0) {
          socket.disconnect()
          socketRef.current = null
          tryCandidate(index + 1)
          return
        }

        const message = err.message || String(err)

        // 服务器密码相关错误 — 显示密码输入框
        if (message === 'SERVER_PASSWORD_REQUIRED' || message === 'SERVER_PASSWORD_INCORRECT') {
          setServerPasswordRequired(true)
          setAuthError(message === 'SERVER_PASSWORD_REQUIRED' ? '需要输入服务器密码' : '服务器密码错误')
          setConnected(false)
          return
        }

        // Token 相关错误 — 需要重新登录
        if (message === 'AUTH_TOKEN_INVALID' || message === 'AUTH_TOKEN_EXPIRED') {
          setAuthError('登录已过期，请重新登录')
          setConnected(false)
          return
        }

        // 版本不兼容 — 需要更新客户端
        if (message.startsWith('VERSION_INCOMPATIBLE')) {
          const serverVer = message.split(':')[1] || '未知'
          setAuthError(`客户端版本不兼容（客户端 ${PROTOCOL_VERSION}，服务器需要 ${serverVer}）。请更新客户端。`)
          setConnected(false)
          return
        }

        // 其他连接错误（网络不通、服务器未启动等）
        console.error('Connection error:', err)
        setConnected(false)
        setConnectError(message || '连接失败')
      })
    }

    tryCandidate(0)  // 从第一个候选地址开始尝试
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

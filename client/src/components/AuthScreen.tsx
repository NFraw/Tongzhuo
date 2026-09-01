import { useState, useEffect, useCallback } from 'react'

interface AuthScreenProps {
  serverUrl: string
  onAuthSuccess: (token: string, username: string, user: UserProfile) => void
  onBack: () => void
}

interface UserProfile {
  id: number
  username: string
  displayName: string
  avatarId: number
  coins: number
}

function getApiBase(serverUrl: string): string {
  // serverUrl is like "http://192.168.1.100:3000" or "https://xxx.ngrok.io"
  return serverUrl.replace(/\/$/, '') + '/api'
}

export function AuthScreen({ serverUrl, onAuthSuccess, onBack }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [serverPassword, setServerPassword] = useState('')
  const [requireServerPassword, setRequireServerPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingServer, setCheckingServer] = useState(true)

  // Check server info on mount
  useEffect(() => {
    const apiBase = getApiBase(serverUrl)
    fetch(`${apiBase}/server/info`)
      .then(r => r.json())
      .then(data => {
        setRequireServerPassword(data.requirePassword)
        setCheckingServer(false)
      })
      .catch(() => {
        setCheckingServer(false)
      })
  }, [serverUrl])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const apiBase = getApiBase(serverUrl)
    const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
    const body: any = { username, password }

    if (requireServerPassword && serverPassword) {
      body.serverPassword = serverPassword
    }
    if (mode === 'register' && displayName) {
      body.displayName = displayName
    }

    try {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMap: Record<string, string> = {
          'AUTH_INVALID_CREDENTIALS': '用户名或密码错误',
          'AUTH_USER_EXISTS': '用户名已存在',
          'AUTH_INVALID_USERNAME': '用户名格式无效（2-20位字母数字下划线）',
          'AUTH_INVALID_PASSWORD': '密码长度需为6-64位',
          'PROFILE_INVALID_NAME': '昵称格式无效',
          'SERVER_PASSWORD_INCORRECT': '服务器密码错误',
          'SERVER_PASSWORD_REQUIRED': '需要输入服务器密码',
          'RATE_LIMITED': '请求过于频繁，请稍后再试',
        }
        setError(errorMap[data.error] || data.error || '请求失败')
        setLoading(false)
        return
      }

      onAuthSuccess(data.token, data.user.username, data.user)
    } catch (err) {
      setError('网络错误，请检查服务器地址')
      setLoading(false)
    }
  }, [mode, username, password, displayName, serverPassword, requireServerPassword, serverUrl, onAuthSuccess])

  if (checkingServer) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="auth-loading">正在连接服务器...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h2>{mode === 'login' ? '登录' : '注册'}</h2>
        <p className="auth-server-url">{serverUrl}</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="2-20位字母数字下划线"
              maxLength={20}
              autoFocus
              required
            />
          </div>

          <div className="auth-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="6-64位"
              maxLength={64}
              required
            />
          </div>

          {mode === 'register' && (
            <div className="auth-field">
              <label>昵称 <span className="auth-optional">（可选，默认为用户名）</span></label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="1-16位"
                maxLength={16}
              />
            </div>
          )}

          {requireServerPassword && (
            <div className="auth-field">
              <label>服务器密码</label>
              <input
                type="password"
                value={serverPassword}
                onChange={e => setServerPassword(e.target.value)}
                placeholder="请输入服务器密码"
                maxLength={64}
                required
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
          </button>
        </form>

        <div className="auth-footer">
          <button
            className="auth-toggle"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          >
            {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
          </button>
          <button className="auth-back" onClick={onBack}>
            返回
          </button>
        </div>
      </div>
    </div>
  )
}

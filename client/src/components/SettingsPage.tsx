import { useState, useCallback, useRef } from 'react'

interface UserProfile {
  id: number
  username: string
  displayName: string
  avatarId: number
  coins: number
}

interface SettingsPageProps {
  serverUrl: string
  token: string
  user: UserProfile
  onBack: () => void
  onProfileUpdate: (user: UserProfile) => void
  onLogout: () => void
}

const AVATAR_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e84393', '#636e72', '#2d3436',
]

function AvatarIcon({ id, size = 48 }: { id: number; size?: number }) {
  const color = AVATAR_COLORS[id] || AVATAR_COLORS[0]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill={color} />
      <circle cx="24" cy="18" r="8" fill="white" opacity="0.9" />
      <ellipse cx="24" cy="38" rx="14" ry="10" fill="white" opacity="0.9" />
    </svg>
  )
}

function getApiBase(serverUrl: string): string {
  return serverUrl.replace(/\/$/, '') + '/api'
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function SettingsPage({ serverUrl, token, user, onBack, onProfileUpdate, onLogout }: SettingsPageProps) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [avatarId, setAvatarId] = useState(user.avatarId)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')

  const apiBase = getApiBase(serverUrl)

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setError(null)
    setTimeout(() => setSuccess(null), 3000)
  }

  const showError = (msg: string) => {
    setError(msg)
    setSuccess(null)
  }

  const handleSaveProfile = useCallback(async () => {
    setProfileLoading(true)
    try {
      const res = await fetchWithTimeout(`${apiBase}/profile/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, displayName, avatarId }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errorMap: Record<string, string> = {
          'PROFILE_INVALID_NAME': '昵称格式无效（1-16位）',
          'AUTH_TOKEN_INVALID': '登录已过期，请重新登录',
          'AUTH_TOKEN_EXPIRED': '登录已过期，请重新登录',
        }
        showError(errorMap[data.error] || data.error || '保存失败')
      } else {
        onProfileUpdate(data)
        showSuccess('个人资料已更新')
      }
    } catch (e: any) {
      showError(e.name === 'AbortError' ? '请求超时' : '网络错误')
    } finally {
      setProfileLoading(false)
    }
  }, [apiBase, token, displayName, avatarId, onProfileUpdate])

  const handleChangePassword = useCallback(async () => {
    if (newPassword !== confirmPassword) {
      showError('两次输入的密码不一致')
      return
    }
    setPasswordLoading(true)
    try {
      const res = await fetchWithTimeout(`${apiBase}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, oldPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errorMap: Record<string, string> = {
          'AUTH_INVALID_CREDENTIALS': '原密码错误',
          'AUTH_INVALID_PASSWORD': '新密码格式无效（6-64位）',
          'AUTH_TOKEN_INVALID': '登录已过期，请重新登录',
          'AUTH_TOKEN_EXPIRED': '登录已过期，请重新登录',
        }
        showError(errorMap[data.error] || data.error || '修改失败')
      } else {
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        showSuccess('密码已修改')
      }
    } catch (e: any) {
      showError(e.name === 'AbortError' ? '请求超时' : '网络错误')
    } finally {
      setPasswordLoading(false)
    }
  }, [apiBase, token, oldPassword, newPassword, confirmPassword])

  return (
    <div className="settings-screen">
      <div className="settings-card">
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onBack}>×</button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            个人资料
          </button>
          <button
            className={`settings-tab ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => setActiveTab('password')}
          >
            修改密码
          </button>
        </div>

        {error && <div className="settings-error">{error}</div>}
        {success && <div className="settings-success">{success}</div>}

        {activeTab === 'profile' && (
          <div className="settings-section">
            <div className="settings-field">
              <label>用户名</label>
              <div className="settings-readonly">{user.username}</div>
            </div>

            <div className="settings-field">
              <label>金币</label>
              <div className="settings-coins">
                <span className="coin-icon">🪙</span>
                <span>{user.coins}</span>
              </div>
            </div>

            <div className="settings-field">
              <label>昵称</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={16}
                placeholder="1-16位"
              />
            </div>

            <div className="settings-field">
              <label>头像</label>
              <div className="avatar-grid">
                {AVATAR_COLORS.map((_, i) => (
                  <button
                    key={i}
                    className={`avatar-option ${avatarId === i ? 'selected' : ''}`}
                    onClick={() => setAvatarId(i)}
                  >
                    <AvatarIcon id={i} size={40} />
                  </button>
                ))}
              </div>
            </div>

            <button
              className="settings-save"
              onClick={handleSaveProfile}
              disabled={profileLoading}
            >
              {profileLoading ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {activeTab === 'password' && (
          <div className="settings-section">
            <div className="settings-field">
              <label>原密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                maxLength={64}
              />
            </div>

            <div className="settings-field">
              <label>新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="6-64位"
                maxLength={64}
              />
            </div>

            <div className="settings-field">
              <label>确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                maxLength={64}
              />
            </div>

            <button
              className="settings-save"
              onClick={handleChangePassword}
              disabled={passwordLoading || !oldPassword || !newPassword || !confirmPassword}
            >
              {passwordLoading ? '修改中...' : '修改密码'}
            </button>
          </div>
        )}

        <div className="settings-footer">
          <button className="settings-logout" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  )
}

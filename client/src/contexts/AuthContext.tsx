import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

const CREDS_KEY = 'huiming-creds'

interface UserProfile {
  id: number
  username: string
  displayName: string
  avatarId: number
  coins: number
}

interface SavedCredential {
  username: string
  token: string
  displayName: string
}

interface AuthState {
  user: UserProfile | null
  token: string | null
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  login: (token: string, username: string, user: UserProfile) => void
  logout: () => void
  setToken: (token: string | null) => void
  updateProfile: (user: UserProfile) => void
  refreshToken: () => Promise<void>
  getSavedCredential: (serverUrl: string) => SavedCredential | null
  saveCredential: (serverUrl: string, username: string, token: string, displayName: string) => void
  clearCredential: (serverUrl: string) => void
  serverUrl: string | null
  setServerUrl: (url: string | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadCreds(): Record<string, SavedCredential> {
  try {
    return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCreds(creds: Record<string, SavedCredential>): void {
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-refresh token every 90 minutes
  useEffect(() => {
    if (!token || !serverUrl) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      return
    }

    refreshTimerRef.current = setInterval(async () => {
      try {
        const apiBase = serverUrl.replace(/\/$/, '') + '/api'
        const res = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (res.ok) {
          const data = await res.json()
          setToken(data.newToken)
          // Update saved credential
          const creds = loadCreds()
          const key = serverUrl
          if (creds[key]) {
            creds[key].token = data.newToken
            saveCreds(creds)
          }
        }
      } catch {
        // Silent fail — will retry next interval
      }
    }, 90 * 60 * 1000) // 90 minutes

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [token, serverUrl])

  const login = useCallback((newToken: string, username: string, newUser: UserProfile) => {
    setToken(newToken)
    setUser(newUser)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    // Clear credential for current server
    if (serverUrl) {
      const creds = loadCreds()
      delete creds[serverUrl]
      saveCreds(creds)
    }
  }, [serverUrl])

  const updateProfile = useCallback((newUser: UserProfile) => {
    setUser(newUser)
    // Update display name in saved credential
    if (serverUrl) {
      const creds = loadCreds()
      if (creds[serverUrl]) {
        creds[serverUrl].displayName = newUser.displayName
        saveCreds(creds)
      }
    }
  }, [serverUrl])

  const refreshToken = useCallback(async () => {
    if (!token || !serverUrl) return
    try {
      const apiBase = serverUrl.replace(/\/$/, '') + '/api'
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        const data = await res.json()
        setToken(data.newToken)
        const creds = loadCreds()
        if (creds[serverUrl]) {
          creds[serverUrl].token = data.newToken
          saveCreds(creds)
        }
      }
    } catch {
      // Silent fail
    }
  }, [token, serverUrl])

  const getSavedCredential = useCallback((url: string): SavedCredential | null => {
    const creds = loadCreds()
    return creds[url] || null
  }, [])

  const saveCredential = useCallback((url: string, username: string, newToken: string, displayName: string) => {
    const creds = loadCreds()
    creds[url] = { username, token: newToken, displayName }
    saveCreds(creds)
  }, [])

  const clearCredential = useCallback((url: string) => {
    const creds = loadCreds()
    delete creds[url]
    saveCreds(creds)
  }, [])

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    // The raw state setter is stable and accepts string | null
    setToken,
    updateProfile,
    refreshToken,
    getSavedCredential,
    saveCredential,
    clearCredential,
    serverUrl,
    setServerUrl,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

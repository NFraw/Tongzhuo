// packages/core/server/user-store.ts
import crypto from 'crypto'
import type Database from 'better-sqlite3'
import type { UserRecord, CoinTransaction } from '@huiming/core-shared'
import { AuthErrors, AuthValidation } from '@huiming/core-shared'

const TOKEN_EXPIRY_MS = 2 * 60 * 60 * 1000 // 2 hours
const SCRYPT_KEYLEN = 64
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export class UserStore {
  private db: Database.Database
  private serverSecret: string

  constructor(db: Database.Database, serverSecret: string) {
    this.db = db
    this.serverSecret = serverSecret
  }

  // --- Validation ---

  private validateUsername(username: string): string | null {
    if (!username || !AuthValidation.username.pattern.test(username)) {
      return AuthErrors.INVALID_USERNAME
    }
    return null
  }

  private validatePassword(password: string): string | null {
    if (!password || password.length < AuthValidation.password.minLength || password.length > AuthValidation.password.maxLength) {
      return AuthErrors.INVALID_PASSWORD
    }
    return null
  }

  private validateDisplayName(name: string): string | null {
    if (!name || name.trim().length < AuthValidation.displayName.minLength || name.length > AuthValidation.displayName.maxLength) {
      return AuthErrors.PROFILE_INVALID_NAME
    }
    return null
  }

  // --- Password hashing ---

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex')
  }

  private generateSalt(): string {
    return crypto.randomBytes(16).toString('hex')
  }

  // --- Token ---

  generateToken(username: string): string {
    const issuedAt = Date.now()
    const expiresAt = issuedAt + TOKEN_EXPIRY_MS
    const payload = `${username}:${issuedAt}:${expiresAt}`
    const hmac = crypto.createHmac('sha256', this.serverSecret).update(payload).digest('hex')
    return `${username}.${issuedAt}.${expiresAt}.${hmac}`
  }

  verifyToken(token: string): { valid: boolean; username?: string; error?: string } {
    const parts = token.split('.')
    if (parts.length !== 4) {
      return { valid: false, error: AuthErrors.TOKEN_INVALID }
    }

    const [username, issuedAtStr, expiresAtStr, hmac] = parts
    const issuedAt = parseInt(issuedAtStr, 10)
    const expiresAt = parseInt(expiresAtStr, 10)

    if (isNaN(issuedAt) || isNaN(expiresAt)) {
      return { valid: false, error: AuthErrors.TOKEN_INVALID }
    }

    // Check expiry
    if (Date.now() > expiresAt) {
      return { valid: false, error: AuthErrors.TOKEN_EXPIRED }
    }

    // Verify HMAC
    const payload = `${username}:${issuedAt}:${expiresAt}`
    const expectedHmac = crypto.createHmac('sha256', this.serverSecret).update(payload).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
      return { valid: false, error: AuthErrors.TOKEN_INVALID }
    }

    return { valid: true, username }
  }

  refreshToken(token: string): { success: boolean; newToken?: string; error?: string } {
    const result = this.verifyToken(token)
    if (!result.valid || !result.username) {
      return { success: false, error: result.error }
    }
    return { success: true, newToken: this.generateToken(result.username) }
  }

  // --- User CRUD ---

  getUser(username: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT id, username, display_name, avatar_id, coins, created_at FROM users WHERE username = ?').get(username) as any
    if (!row) return undefined
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarId: row.avatar_id,
      coins: row.coins,
      createdAt: row.created_at,
    }
  }

  getUserById(id: number): UserRecord | undefined {
    const row = this.db.prepare('SELECT id, username, display_name, avatar_id, coins, created_at FROM users WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarId: row.avatar_id,
      coins: row.coins,
      createdAt: row.created_at,
    }
  }

  createUser(username: string, password: string, displayName?: string): { success: boolean; user?: UserRecord; token?: string; error?: string } {
    const usernameErr = this.validateUsername(username)
    if (usernameErr) return { success: false, error: usernameErr }

    const passwordErr = this.validatePassword(password)
    if (passwordErr) return { success: false, error: passwordErr }

    // Unicode NFC normalization for display name
    const name = displayName ? displayName.normalize('NFC').trim() : username
    const nameErr = this.validateDisplayName(name)
    if (nameErr) return { success: false, error: nameErr }

    // Check if username exists
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) return { success: false, error: AuthErrors.USER_EXISTS }

    const salt = this.generateSalt()
    const passwordHash = this.hashPassword(password, salt)
    const now = Date.now()

    const result = this.db.prepare(
      'INSERT INTO users (username, password_hash, salt, display_name, avatar_id, coins, created_at) VALUES (?, ?, ?, ?, 0, 1000, ?)'
    ).run(username, passwordHash, salt, name, now)

    const user: UserRecord = {
      id: Number(result.lastInsertRowid),
      username,
      displayName: name,
      avatarId: 0,
      coins: 1000,
      createdAt: now,
    }

    const token = this.generateToken(username)
    return { success: true, user, token }
  }

  verifyPassword(username: string, password: string): { valid: boolean; user?: UserRecord; error?: string } {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
    if (!row) return { valid: false, error: AuthErrors.INVALID_CREDENTIALS }

    const hash = this.hashPassword(password, row.salt)
    if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(row.password_hash, 'hex'))) {
      return { valid: false, error: AuthErrors.INVALID_CREDENTIALS }
    }

    return {
      valid: true,
      user: {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarId: row.avatar_id,
        coins: row.coins,
        createdAt: row.created_at,
      },
    }
  }

  changePassword(username: string, oldPassword: string, newPassword: string): { success: boolean; error?: string } {
    const verifyResult = this.verifyPassword(username, oldPassword)
    if (!verifyResult.valid) return { success: false, error: verifyResult.error }

    const passwordErr = this.validatePassword(newPassword)
    if (passwordErr) return { success: false, error: passwordErr }

    const salt = this.generateSalt()
    const passwordHash = this.hashPassword(newPassword, salt)
    this.db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?').run(passwordHash, salt, username)

    return { success: true }
  }

  updateProfile(username: string, displayName?: string, avatarId?: number): { success: boolean; user?: UserRecord; error?: string } {
    const user = this.getUser(username)
    if (!user) return { success: false, error: AuthErrors.INVALID_CREDENTIALS }

    if (displayName !== undefined) {
      const name = displayName.normalize('NFC').trim()
      const nameErr = this.validateDisplayName(name)
      if (nameErr) return { success: false, error: nameErr }
      this.db.prepare('UPDATE users SET display_name = ? WHERE username = ?').run(name, username)
    }

    if (avatarId !== undefined) {
      if (avatarId < AuthValidation.avatarId.min || avatarId > AuthValidation.avatarId.max) {
        return { success: false, error: 'INVALID_AVATAR' }
      }
      this.db.prepare('UPDATE users SET avatar_id = ? WHERE username = ?').run(avatarId, username)
    }

    return { success: true, user: this.getUser(username) }
  }

  // --- Coins ---

  addCoins(userId: number, amount: number, reason: string): { success: boolean; newBalance?: number; error?: string } {
    const user = this.getUserById(userId)
    if (!user) return { success: false, error: 'USER_NOT_FOUND' }

    const newBalance = user.coins + amount
    if (newBalance < 0) return { success: false, error: AuthErrors.COINS_INSUFFICIENT }

    // Atomic transaction
    const txn = this.db.transaction(() => {
      this.db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(newBalance, userId)
      this.db.prepare('INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?, ?, ?, ?)').run(userId, amount, reason, Date.now())
    })
    txn()

    return { success: true, newBalance }
  }

  getTransactions(userId: number, limit = 50): CoinTransaction[] {
    return this.db.prepare('SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as CoinTransaction[]
  }

  hasUsers(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any
    return row.count > 0
  }
}

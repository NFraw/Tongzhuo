/**
 * user-store.ts — 用户数据存储层
 *
 * 管理用户注册、登录、Token、金币等所有用户相关数据。
 * 类比 Java：相当于一个 UserService + UserRepository。
 *
 * 安全设计：
 *   - 密码使用 scrypt 哈希（比 bcrypt 更安全，抗 GPU 破解）
 *   - Token 使用 HMAC-SHA256 签名（防伪造）
 *   - 密码比较使用 timingSafeEqual（防时序攻击）
 *   - 显示名使用 Unicode NFC 标准化（防 homograph 攻击）
 *
 * 【如果你想修改用户系统】：
 *   - 修改验证规则：AuthValidation（shared/auth-config.ts）
 *   - 修改 Token 有效期：TOKEN_EXPIRY_MS
 *   - 修改初始金币：createUser() 中的 1000
 *   - 修改密码哈希参数：SCRYPT_OPTIONS
 */
import crypto from 'crypto'
import type Database from 'better-sqlite3'
import type { UserRecord, CoinTransaction } from '@huiming/core-shared'
import { AuthErrors, AuthValidation } from '@huiming/core-shared'

/** Token 有效期：2 小时 */
const TOKEN_EXPIRY_MS = 2 * 60 * 60 * 1000
/** scrypt 哈希输出长度（字节） */
const SCRYPT_KEYLEN = 64
/** scrypt 参数（N=CPU 开销，r=内存开销，并行度 p=1） */
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/**
 * 用户数据存储类。
 * 封装所有用户相关的数据库操作。
 */
export class UserStore {
  private db: Database.Database
  /** 服务器密钥（用于 HMAC 签名 Token） */
  private serverSecret: string

  constructor(db: Database.Database, serverSecret: string) {
    this.db = db
    this.serverSecret = serverSecret
  }

  // ─── 输入验证 ─────────────────────────────────────────────────────────

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

  // ─── 密码哈希 ─────────────────────────────────────────────────────────

  /**
   * 使用 scrypt 对密码进行哈希。
   * scrypt 是密码哈希函数（不是加密），特点是抗 GPU/ASIC 破解。
   * 类比 Java：相当于 MessageDigest.getInstance("SHA-256")，但更安全。
   */
  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex')
  }

  /** 生成 16 字节随机盐 */
  private generateSalt(): string {
    return crypto.randomBytes(16).toString('hex')
  }

  // ─── Token 管理 ───────────────────────────────────────────────────────

  /**
   * 生成登录 Token。
   *
   * 格式：username.issuedAt.expiresAt.hmac
   *   - username: 用户名
   *   - issuedAt: 签发时间（毫秒时间戳）
   *   - expiresAt: 过期时间
   *   - hmac: HMAC-SHA256 签名（防伪造）
   *
   * 类比 Java：相当于 JWT（JSON Web Token），但更简单。
   */
  generateToken(username: string): string {
    const issuedAt = Date.now()
    const expiresAt = issuedAt + TOKEN_EXPIRY_MS
    const payload = `${username}:${issuedAt}:${expiresAt}`
    const hmac = crypto.createHmac('sha256', this.serverSecret).update(payload).digest('hex')
    return `${username}.${issuedAt}.${expiresAt}.${hmac}`
  }

  /**
   * 验证 Token。
   *
   * 检查：
   *   1. 格式正确（4 段）
   *   2. 未过期
   *   3. HMAC 签名有效（防篡改）
   */
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

    // 检查过期
    if (Date.now() > expiresAt) {
      return { valid: false, error: AuthErrors.TOKEN_EXPIRED }
    }

    // 验证 HMAC 签名
    const payload = `${username}:${issuedAt}:${expiresAt}`
    const expectedHmac = crypto.createHmac('sha256', this.serverSecret).update(payload).digest('hex')
    // timingSafeEqual 防止时序攻击（比较时间恒定，不泄露差异位信息）
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
      return { valid: false, error: AuthErrors.TOKEN_INVALID }
    }

    return { valid: true, username }
  }

  /**
   * 刷新 Token：验证旧 Token 有效后签发新 Token。
   * 用于客户端自动续期。
   */
  refreshToken(token: string): { success: boolean; newToken?: string; error?: string } {
    const result = this.verifyToken(token)
    if (!result.valid || !result.username) {
      return { success: false, error: result.error }
    }
    return { success: true, newToken: this.generateToken(result.username) }
  }

  // ─── 用户 CRUD ─────────────────────────────────────────────────────────

  /**
   * 根据用户名获取用户（不含密码哈希和盐）。
   */
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

  /** 根据 ID 获取用户 */
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

  /**
   * 注册新用户。
   *
   * 流程：
   *   1. 验证用户名格式
   *   2. 验证密码格式
   *   3. 标准化显示名（Unicode NFC）
   *   4. 检查用户名是否已存在
   *   5. 生成盐 + 哈希密码
   *   6. 插入数据库
   *   7. 生成 Token
   */
  createUser(username: string, password: string, displayName?: string): { success: boolean; user?: UserRecord; token?: string; error?: string } {
    const usernameErr = this.validateUsername(username)
    if (usernameErr) return { success: false, error: usernameErr }

    const passwordErr = this.validatePassword(password)
    if (passwordErr) return { success: false, error: passwordErr }

    // Unicode NFC 标准化（防 homograph 攻击：看起来一样的字符可能有不同编码）
    const name = displayName ? displayName.normalize('NFC').trim() : username
    const nameErr = this.validateDisplayName(name)
    if (nameErr) return { success: false, error: nameErr }

    // 检查用户名是否已存在
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

  /**
   * 验证密码。
   * 使用 timingSafeEqual 比较哈希值，防止时序攻击。
   */
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

  /** 修改密码（需要验证旧密码） */
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

  /** 更新用户资料（显示名、头像） */
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

  // ─── 金币系统 ─────────────────────────────────────────────────────────

  /**
   * 增减金币（原子事务）。
   *
   * @param userId - 用户 ID
   * @param amount - 变动金额（正=增加，负=减少）
   * @param reason - 变动原因（如 'game_win', 'game_lose'）
   * @returns 新余额
   *
   * 使用数据库事务保证原子性：余额更新和交易记录要么同时成功，要么同时失败。
   */
  addCoins(userId: number, amount: number, reason: string): { success: boolean; newBalance?: number; error?: string } {
    const user = this.getUserById(userId)
    if (!user) return { success: false, error: 'USER_NOT_FOUND' }

    const newBalance = user.coins + amount
    if (newBalance < 0) return { success: false, error: AuthErrors.COINS_INSUFFICIENT }

    // 原子事务
    const txn = this.db.transaction(() => {
      this.db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(newBalance, userId)
      this.db.prepare('INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?, ?, ?, ?)').run(userId, amount, reason, Date.now())
    })
    txn()

    return { success: true, newBalance }
  }

  /** 获取交易记录（最近 N 条） */
  getTransactions(userId: number, limit = 50): CoinTransaction[] {
    return this.db.prepare('SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as CoinTransaction[]
  }

  /** 检查是否有任何用户（首次启动判断） */
  hasUsers(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any
    return row.count > 0
  }
}

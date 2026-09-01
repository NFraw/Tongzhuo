/**
 * server-config.ts — 服务器配置管理
 *
 * 管理服务器密钥和服务器密码。
 * 配置文件存储在 server/data/server-config.json。
 *
 * 安全设计：
 *   - serverSecret：首次启动时自动生成的 32 字节随机密钥
 *     用于 HMAC 签名 Token 和加密服务器密码
 *   - 服务器密码：使用 AES-256-GCM 加密存储（对称加密 + 认证标签）
 *
 * AES-256-GCM 解释（类比 C++）：
 *   - AES-256：对称加密算法，密钥 32 字节
 *   - GCM：Galois/Counter Mode，同时提供加密和认证
 *   - IV（初始化向量）：16 字节随机值，确保相同明文加密出不同密文
 *   - Auth Tag：16 字节认证标签，检测密文是否被篡改
 *
 * 【如果你想修改配置】：
 *   - 修改加密算法：ALGORITHM 常量
 *   - 修改密钥长度：serverSecret 生成时的 randomBytes(32)
 *   - 添加新配置项：ConfigData 接口 + getter/setter
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

/** 加密算法 */
const ALGORITHM = 'aes-256-gcm'
/** IV 长度（字节） */
const IV_LENGTH = 16
/** Auth Tag 长度（字节） */
const TAG_LENGTH = 16

/**
 * 配置数据结构。
 * 序列化为 JSON 存储在 server-config.json。
 */
interface ConfigData {
  /** 服务器密钥（hex 编码） */
  serverSecret: string
  /** 加密后的服务器密码（hex 编码） */
  serverPasswordEncrypted: string | null
  /** 加密时使用的 IV（hex 编码） */
  serverPasswordIv: string | null
  /** 认证标签（hex 编码） */
  serverPasswordTag: string | null
}

export class ServerConfig {
  private configPath: string
  private data: ConfigData

  constructor(dataDir?: string) {
    const dir = dataDir || path.join(process.cwd(), 'data')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    this.configPath = path.join(dir, 'server-config.json')
    this.data = this.loadConfig()
  }

  /**
   * 加载配置文件。不存在或损坏时自动生成新配置。
   */
  private loadConfig(): ConfigData {
    if (fs.existsSync(this.configPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      } catch {
        // 配置文件损坏，重新生成
      }
    }

    // 生成新配置
    const config: ConfigData = {
      serverSecret: crypto.randomBytes(32).toString('hex'),
      serverPasswordEncrypted: null,
      serverPasswordIv: null,
      serverPasswordTag: null,
    }
    this.saveConfig(config)
    return config
  }

  /**
   * 保存配置文件（原子写入）。
   * 先写临时文件，再 rename，避免写入中断导致文件损坏。
   */
  private saveConfig(config: ConfigData): void {
    const tmpPath = this.configPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2))
    fs.renameSync(tmpPath, this.configPath)
  }

  /** 获取服务器密钥 */
  getServerSecret(): string {
    return this.data.serverSecret
  }

  /** 是否要求服务器密码 */
  requirePassword(): boolean {
    return this.data.serverPasswordEncrypted !== null
  }

  /**
   * 解密并获取服务器密码。
   *
   * 流程：
   *   1. 从 serverSecret 截取前 32 字节作为 AES 密钥
   *   2. 使用 IV 和 Auth Tag 解密
   *   3. 验证 Auth Tag（检测篡改）
   */
  getServerPassword(): string | null {
    if (!this.data.serverPasswordEncrypted || !this.data.serverPasswordIv || !this.data.serverPasswordTag) {
      return null
    }

    try {
      const key = Buffer.from(this.data.serverSecret, 'hex').slice(0, 32)
      const iv = Buffer.from(this.data.serverPasswordIv, 'hex')
      const tag = Buffer.from(this.data.serverPasswordTag, 'hex')
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)
      let decrypted = decipher.update(this.data.serverPasswordEncrypted, 'hex', 'utf-8')
      decrypted += decipher.final('utf-8')
      return decrypted
    } catch {
      return null
    }
  }

  /**
   * 设置服务器密码（加密存储）。
   *
   * @param password - 新密码，null 表示清除密码
   *
   * 加密流程：
   *   1. 生成随机 IV
   *   2. 使用 AES-256-GCM 加密密码
   *   3. 获取 Auth Tag
   *   4. 将加密后的密文、IV、Auth Tag 存入配置
   */
  setServerPassword(password: string | null): void {
    if (password === null) {
      this.data.serverPasswordEncrypted = null
      this.data.serverPasswordIv = null
      this.data.serverPasswordTag = null
    } else {
      const key = Buffer.from(this.data.serverSecret, 'hex').slice(0, 32)
      const iv = crypto.randomBytes(IV_LENGTH)
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
      let encrypted = cipher.update(password, 'utf-8', 'hex')
      encrypted += cipher.final('hex')
      this.data.serverPasswordEncrypted = encrypted
      this.data.serverPasswordIv = iv.toString('hex')
      this.data.serverPasswordTag = cipher.getAuthTag().toString('hex')
    }

    this.saveConfig(this.data)
  }

  /**
   * 验证服务器密码。
   * 使用 timingSafeEqual 防止时序攻击。
   * 未设置密码时任何密码都通过。
   */
  verifyServerPassword(password: string): boolean {
    const stored = this.getServerPassword()
    if (!stored) return true // 未设置密码
    return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(stored))
  }
}

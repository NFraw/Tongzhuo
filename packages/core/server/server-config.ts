// packages/core/server/server-config.ts
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

interface ConfigData {
  serverSecret: string
  serverPasswordEncrypted: string | null
  serverPasswordIv: string | null
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

  private loadConfig(): ConfigData {
    if (fs.existsSync(this.configPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      } catch {
        // Corrupted config, regenerate
      }
    }

    // Generate new config
    const config: ConfigData = {
      serverSecret: crypto.randomBytes(32).toString('hex'),
      serverPasswordEncrypted: null,
      serverPasswordIv: null,
      serverPasswordTag: null,
    }
    this.saveConfig(config)
    return config
  }

  private saveConfig(config: ConfigData): void {
    const tmpPath = this.configPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2))
    fs.renameSync(tmpPath, this.configPath)
  }

  getServerSecret(): string {
    return this.data.serverSecret
  }

  requirePassword(): boolean {
    return this.data.serverPasswordEncrypted !== null
  }

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

  verifyServerPassword(password: string): boolean {
    const stored = this.getServerPassword()
    if (!stored) return true // No password set, any password is fine
    return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(stored))
  }
}

/**
 * db.ts — SQLite 数据库管理
 *
 * 使用 better-sqlite3 管理本地 SQLite 数据库。
 * 类比 Java：相当于一个 DatabaseManager，管理数据库连接和表结构。
 *
 * 数据库文件位置：server/data/huiming.db
 *
 * 表结构：
 *   - users：用户表（id, username, password_hash, salt, display_name, avatar_id, coins, created_at）
 *   - coin_transactions：金币交易记录（id, user_id, amount, reason, created_at）
 *
 * 【如果你想修改数据库】：
 *   - 添加新表：在 getDb() 的 db.exec() 中添加 CREATE TABLE
 *   - 添加新列：使用 ALTER TABLE（注意已有数据的兼容性）
 *   - 修改 WAL 模式：getDb() 中的 db.pragma()
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

/** 数据库单例（进程内唯一） */
let db: Database.Database | null = null

/**
 * 获取数据库实例（懒加载 + 单例）。
 *
 * @param dataDir - 数据目录路径（默认 server/data/）
 * @returns Database 实例
 *
 * 调用处：
 *   - server/src/index.ts → 启动时调用 getDb()
 *   - UserStore 构造函数 → 传入 db 实例
 */
export function getDb(dataDir?: string): Database.Database {
  if (db) return db

  const dir = dataDir || path.join(process.cwd(), 'data')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const dbPath = path.join(dir, 'huiming.db')
  db = new Database(dbPath)

  // WAL 模式：写入和读取可以并发，提升多线程性能
  // 类比 MySQL 的 InnoDB，WAL = Write-Ahead Logging
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 建表（IF NOT EXISTS 保证幂等性）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_id INTEGER DEFAULT 0,
      coins INTEGER DEFAULT 1000,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coin_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `)

  return db
}

/**
 * 关闭数据库连接。
 * 服务器关闭时调用，确保数据写入磁盘。
 *
 * 调用处：server/src/index.ts → process.on('SIGINT')
 */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

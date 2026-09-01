/**
 * logger.ts — 结构化日志
 *
 * 输出 JSON 格式的日志，便于生产环境的日志收集和分析。
 * 类比 Java：相当于一个 SLF4J Logger 配置。
 *
 * 日志级别：debug < info < warn < error
 * 默认级别：info（可通过环境变量 LOG_LEVEL 或 setLogLevel() 修改）
 *
 * 输出格式（JSON Lines，每行一个 JSON 对象）：
 *   {"time":"2025-01-01T00:00:00.000Z","level":" INFO","event":"room:created","roomId":"abc123","msg":"..."}
 *
 * 【如果你想修改日志】：
 *   - 修改最低级别：setLogLevel() 或环境变量 LOG_LEVEL
 *   - 添加新字段：LogContext 接口 + emit() 中的合并逻辑
 *   - 输出到文件：修改 emit() 中的 console.log → fs.appendFileSync
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 日志级别优先级（数字越大越优先） */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/** 日志级别显示标签（对齐宽度） */
const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: ' INFO',
  warn: ' WARN',
  error: 'ERROR',
}

/** 当前最低日志级别（模块级变量） */
let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

/** 动态修改日志级别 */
export function setLogLevel(level: LogLevel) {
  minLevel = level
}

/** 判断是否应该输出该级别的日志 */
function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel]
}

/** 格式化时间为 ISO 8601 */
function formatTime(): string {
  return new Date().toISOString()
}

/**
 * 日志上下文（可选的结构化字段）。
 * 通用字段 roomId/playerId/socketId 有专门处理，
 * 其他字段会被合并到日志 JSON 中。
 */
interface LogContext {
  roomId?: string
  playerId?: string
  socketId?: string
  [key: string]: unknown
}

/**
 * 输出一条日志。
 *
 * @param level   - 日志级别
 * @param event   - 事件名（如 'room:created'、'game:action'）
 * @param ctx     - 可选的上下文字段
 * @param message - 可选的人类可读消息
 */
function emit(level: LogLevel, event: string, ctx: LogContext = {}, message?: string) {
  if (!shouldLog(level)) return

  const entry: Record<string, unknown> = {
    time: formatTime(),
    level: LEVEL_LABEL[level],
    event,
  }
  if (ctx.roomId) entry.roomId = ctx.roomId
  if (ctx.playerId) entry.playerId = ctx.playerId
  if (ctx.socketId) entry.socketId = ctx.socketId
  // 合并额外字段
  for (const [k, v] of Object.entries(ctx)) {
    if (k !== 'roomId' && k !== 'playerId' && k !== 'socketId' && v !== undefined) {
      entry[k] = v
    }
  }
  if (message) entry.msg = message

  const line = JSON.stringify(entry)
  switch (level) {
    case 'error': console.error(line); break
    case 'warn':  console.warn(line);  break
    default:      console.log(line);   break
  }
}

/**
 * 日志实例。
 *
 * 使用示例：
 *   logger.info('room:created', { roomId: 'abc', playerId: 'user1' })
 *   logger.error('game:crash', { roomId: 'abc' }, 'Unexpected state')
 */
export const logger = {
  debug(event: string, ctx?: LogContext, msg?: string) { emit('debug', event, ctx, msg) },
  info(event: string, ctx?: LogContext, msg?: string)  { emit('info', event, ctx, msg) },
  warn(event: string, ctx?: LogContext, msg?: string)  { emit('warn', event, ctx, msg) },
  error(event: string, ctx?: LogContext, msg?: string) { emit('error', event, ctx, msg) },
}

// packages/core/server/logger.ts
// Structured logger for the game server.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: ' INFO',
  warn: ' WARN',
  error: 'ERROR',
}

/** Minimum log level. Change at runtime via setLogLevel(). */
let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

export function setLogLevel(level: LogLevel) {
  minLevel = level
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel]
}

function formatTime(): string {
  return new Date().toISOString()
}

interface LogContext {
  roomId?: string
  playerId?: string
  socketId?: string
  [key: string]: unknown
}

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
  // Merge any extra context keys
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

export const logger = {
  debug(event: string, ctx?: LogContext, msg?: string) { emit('debug', event, ctx, msg) },
  info(event: string, ctx?: LogContext, msg?: string)  { emit('info', event, ctx, msg) },
  warn(event: string, ctx?: LogContext, msg?: string)  { emit('warn', event, ctx, msg) },
  error(event: string, ctx?: LogContext, msg?: string) { emit('error', event, ctx, msg) },
}

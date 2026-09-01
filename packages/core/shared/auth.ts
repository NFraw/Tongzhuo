// packages/core/shared/auth.ts

/** Stored user record in the database */
export interface UserRecord {
  id: number
  username: string
  displayName: string
  avatarId: number
  coins: number
  createdAt: number
}

/** Auth token payload (decoded from HMAC token) */
export interface AuthToken {
  userId: string       // username
  issuedAt: number
  expiresAt: number
}

/** Socket.IO handshake auth payload */
export interface SocketAuthPayload {
  token?: string
  username?: string
  password?: string
  serverPassword?: string
  clientVersion?: string
}

/** Coin transaction record */
export interface CoinTransaction {
  id: number
  userId: number
  amount: number
  reason: string
  createdAt: number
}

/** Standardized error codes for auth and profile operations */
export const AuthErrors = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  USER_EXISTS: 'AUTH_USER_EXISTS',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  SERVER_PASSWORD_REQUIRED: 'SERVER_PASSWORD_REQUIRED',
  SERVER_PASSWORD_INCORRECT: 'SERVER_PASSWORD_INCORRECT',
  INVALID_USERNAME: 'AUTH_INVALID_USERNAME',
  INVALID_PASSWORD: 'AUTH_INVALID_PASSWORD',
  PROFILE_INVALID_NAME: 'PROFILE_INVALID_NAME',
  COINS_INSUFFICIENT: 'COINS_INSUFFICIENT',
  VERSION_INCOMPATIBLE: 'VERSION_INCOMPATIBLE',
} as const

/** Validation rules */
export const AuthValidation = {
  username: { pattern: /^[a-zA-Z0-9_]{2,20}$/, minLength: 2, maxLength: 20 },
  password: { minLength: 6, maxLength: 64 },
  displayName: { minLength: 1, maxLength: 16 },
  avatarId: { min: 0, max: 9 },
} as const

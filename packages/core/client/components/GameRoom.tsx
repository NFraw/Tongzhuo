import type { ReactNode } from 'react'

interface GameRoomProps {
  connected: boolean
  children: ReactNode
}

export function GameRoom({ connected, children }: GameRoomProps) {
  if (!connected) {
    return (
      <div className="game-room-disconnected">
        <p>连接中...</p>
      </div>
    )
  }
  return <div className="game-room">{children}</div>
}

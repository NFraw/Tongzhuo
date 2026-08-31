interface PlayerInfoProps {
  label: string
  handCount: number
  extraInfo?: { key: string; value: string | number }[]
  isTurn?: boolean
  align?: 'left' | 'right'
}

export function PlayerInfo({ label, handCount, extraInfo, isTurn, align = 'left' }: PlayerInfoProps) {
  return (
    <div className={`player-info player-info-${align}`}>
      <span className={`turn-dot ${isTurn ? 'active' : ''}`} />
      <span>{label}</span>
      <span>手牌 <strong>{handCount}</strong></span>
      {extraInfo?.map(({ key, value }) => (
        <span key={key}>{key} <strong>{value}</strong></span>
      ))}
    </div>
  )
}

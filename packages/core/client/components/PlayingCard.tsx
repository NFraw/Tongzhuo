import type { Card } from '@huiming/core-shared'

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  joker_red: '★', joker_black: '★',
}

const SUIT_COLORS: Record<string, string> = {
  hearts: '#cc4444', diamonds: '#cc4444',
  clubs: '#4488cc', spades: '#4488cc',
  joker_red: '#b8960a', joker_black: '#b8960a',
}

interface PlayingCardProps {
  card?: Card | null
  faceUp?: boolean
  onClick?: () => void
  interactive?: boolean
  highlighted?: boolean
  className?: string
}

export function PlayingCard({
  card, faceUp = true, onClick, interactive, highlighted, className = '',
}: PlayingCardProps) {
  if (!card) {
    return <div className={`playing-card card-empty ${className}`} />
  }

  const symbol = SUIT_SYMBOLS[card.suit] ?? '?'
  const color = SUIT_COLORS[card.suit] ?? '#888'

  return (
    <div
      className={`playing-card ${faceUp ? 'card-face' : 'card-back'} ${interactive ? 'card-interactive' : ''} ${highlighted ? 'card-highlighted' : ''} ${className}`}
      onClick={interactive ? onClick : undefined}
    >
      {faceUp ? (
        <div className="card-content" style={{ color }}>
          <span className="card-suit">{symbol}</span>
          <span className="card-rank">{card.rank}</span>
        </div>
      ) : (
        <div className="card-back-pattern"><span>✦</span></div>
      )}
    </div>
  )
}

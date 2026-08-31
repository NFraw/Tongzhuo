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
  exists?: boolean
  onClick?: () => void
  interactive?: boolean
  highlighted?: boolean
  className?: string
}

export function PlayingCard({
  card, faceUp = true, exists = true, onClick, interactive, highlighted, className = '',
}: PlayingCardProps) {
  // No card in this cell at all
  if (!exists && !card) {
    return (
      <div
        className={`playing-card card-empty ${interactive ? 'card-interactive card-highlighted' : ''} ${className}`}
        onClick={interactive ? onClick : undefined}
      />
    )
  }

  const symbol = card ? (SUIT_SYMBOLS[card.suit] ?? '?') : ''
  const color = card ? (SUIT_COLORS[card.suit] ?? '#888') : '#888'

  return (
    <div
      className={`playing-card ${faceUp && card ? 'card-face' : 'card-back'} ${interactive ? 'card-interactive' : ''} ${highlighted ? 'card-highlighted' : ''} ${className}`}
      onClick={interactive ? onClick : undefined}
    >
      {faceUp && card ? (
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

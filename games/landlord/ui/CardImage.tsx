import type { Card } from '@tongzhuo/core-shared'

const SUIT_COLORS: Record<string, string> = {
  hearts: '#cc2222', diamonds: '#cc2222',
  clubs: '#222', spades: '#222',
  joker_red: '#cc2222', joker_black: '#222',
}

const RANK_LABELS: Record<string, string> = {
  '3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9','10':'10',
  'J':'J','Q':'Q','K':'K','A':'A','2':'2','JOKER':'JOKER',
}

const SUIT_LABELS: Record<string, string> = {
  hearts:'♥', diamonds:'♦', clubs:'♣', spades:'♠',
  joker_red:'★', joker_black:'☆',
}

interface CardImageProps {
  card?: Card | null
  faceUp?: boolean
  selected?: boolean
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
}

export function CardImage({ card, faceUp = true, selected = false, onClick, className = '', style }: CardImageProps) {
  if (!faceUp || !card) {
    // Card back: pure CSS pattern, no images
    return (
      <div
        className={`card-shell card-back ${onClick ? 'card-clickable' : ''} ${className}`}
        onClick={onClick}
        style={style}
      >
        <div className="card-back-pattern">
          <span className="card-back-star">✦</span>
        </div>
      </div>
    )
  }

  const color = SUIT_COLORS[card.suit] ?? '#222'
  const rankLabel = RANK_LABELS[card.rank] ?? card.rank
  const suitLabel = SUIT_LABELS[card.suit] ?? '?'

  return (
    <div
      className={`card-shell card-face ${selected ? 'card-selected' : ''} ${onClick ? 'card-clickable' : ''} ${className}`}
      onClick={onClick}
      style={{ color, ...style }}
    >
      {/* Corner: rank + suit */}
      <div className="card-corner">
        <span className="card-corner-rank">{rankLabel}</span>
        <span className="card-corner-suit">{suitLabel}</span>
      </div>
      {/* Center: large suit symbol */}
      <div className="card-big-suit">{suitLabel}</div>
    </div>
  )
}

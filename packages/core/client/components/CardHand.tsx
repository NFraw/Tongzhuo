import type { Card } from '@huiming/core-shared'
import { PlayingCard } from './PlayingCard'

interface CardHandProps {
  cards: Card[]
  onCardClick?: (card: Card) => void
  selectable?: boolean
  selectedId?: string | null
}

export function CardHand({ cards, onCardClick, selectable, selectedId }: CardHandProps) {
  return (
    <div className="card-hand">
      {cards.map(card => (
        <PlayingCard
          key={card.id}
          card={card}
          faceUp
          interactive={selectable}
          highlighted={card.id === selectedId}
          onClick={() => onCardClick?.(card)}
        />
      ))}
      {cards.length === 0 && <span className="hand-empty">暂无手牌</span>}
    </div>
  )
}

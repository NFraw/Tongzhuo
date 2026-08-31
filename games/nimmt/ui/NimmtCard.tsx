// games/nimmt/ui/NimmtCard.tsx
import type { Card } from '@huiming/core-shared'
import { cattleHeads } from '../engine'

interface NimmtCardProps {
  card: Card
  selected?: boolean
  dimmed?: boolean
  end?: boolean
  clickable?: boolean
  onClick?: () => void
}

export function NimmtCard({ card, selected, dimmed, end, clickable, onClick }: NimmtCardProps) {
  const heads = cattleHeads(card.value)
  return (
    <div
      className={[
        'nimmt-card',
        selected ? 'selected' : '',
        dimmed ? 'dimmed' : '',
        end ? 'row-end' : '',
        clickable ? 'clickable' : '',
      ].filter(Boolean).join(' ')}
      onClick={clickable ? onClick : undefined}
    >
      <div className="nimmt-card-value">{card.value}</div>
      <div className="nimmt-card-heads">
        <span className="nimmt-bull">🐂</span>
        <span>{heads}</span>
      </div>
    </div>
  )
}

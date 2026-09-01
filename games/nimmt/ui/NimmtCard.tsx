// games/nimmt/ui/NimmtCard.tsx — v1.3
import type { Card } from '@huiming/core-shared'
import { cattleHeads } from '../engine'

interface NimmtCardProps {
  card: Card
  selected?: boolean
  dimmed?: boolean
  end?: boolean
  clickable?: boolean
  entering?: boolean
  collecting?: boolean
  onClick?: () => void
}

export function NimmtCard({
  card, selected, dimmed, end, clickable, entering, collecting, onClick,
}: NimmtCardProps) {
  const heads = cattleHeads(card.value)
  const cls = [
    'nimmt-card',
    selected && 'selected',
    dimmed && 'dimmed',
    end && 'row-end',
    clickable && 'clickable',
    entering && 'card-enter',
    collecting && 'bull-collect',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} onClick={clickable ? onClick : undefined}>
      <div className="nimmt-card-value">{card.value}</div>
      <div className="nimmt-card-heads">
        <span className="nimmt-bull">🐂</span>
        <span>{heads}</span>
      </div>
    </div>
  )
}

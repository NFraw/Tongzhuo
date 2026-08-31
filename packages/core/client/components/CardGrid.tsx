import type { Card } from '@huiming/core-shared'
import { PlayingCard } from './PlayingCard'

export interface GridCell {
  card: Card | null
  faceUp: boolean
  exists?: boolean
}

interface CardGridProps {
  grid: GridCell[][]
  cols?: number
  onCellClick?: (row: number, col: number) => void
  isCellInteractive?: (row: number, col: number, cell: GridCell) => boolean
  isCellHighlighted?: (row: number, col: number, cell: GridCell) => boolean
}

export function CardGrid({
  grid, cols, onCellClick, isCellInteractive, isCellHighlighted,
}: CardGridProps) {
  const columnCount = cols ?? (grid[0]?.length ?? 5)
  return (
    <div
      className="card-grid"
      style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => (
          <PlayingCard
            key={`${r}-${c}`}
            card={cell.card}
            faceUp={cell.faceUp}
            exists={cell.exists ?? true}
            interactive={isCellInteractive?.(r, c, cell)}
            highlighted={isCellHighlighted?.(r, c, cell)}
            onClick={() => onCellClick?.(r, c)}
          />
        ))
      )}
    </div>
  )
}

// games/huiming/ui/HuimingBoard.tsx
import { CardGrid, type GridCell } from '@huiming/core-client/components'
import type { HuimingClientState } from '../types'

interface HuimingBoardProps {
  state: HuimingClientState
  onCellClick: (row: number, col: number) => void
  interactive: boolean
  darkPickMode: boolean
}

export function HuimingBoard({ state, onCellClick, interactive, darkPickMode }: HuimingBoardProps) {
  const grid: GridCell[][] = state.board.map(row =>
    row.map(cell => ({ card: cell.card, faceUp: cell.faceUp }))
  )

  return (
    <CardGrid
      grid={grid}
      cols={5}
      onCellClick={onCellClick}
      isCellInteractive={(r, c, cell) => {
        if (!interactive) return false
        if (cell.faceUp && cell.card) return true
        if (!cell.faceUp && cell.card && darkPickMode) return true
        return false
      }}
      isCellHighlighted={(r, c, cell) => {
        return !cell.faceUp && !!cell.card && darkPickMode
      }}
    />
  )
}

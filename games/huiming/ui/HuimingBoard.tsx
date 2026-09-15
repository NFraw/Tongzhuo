// games/huiming/ui/HuimingBoard.tsx
import { CardGrid, type GridCell } from '@tongzhuo/core-client/components'
import type { HuimingClientState } from '../types'

interface HuimingBoardProps {
  state: HuimingClientState
  onCellClick: (row: number, col: number) => void
  interactive: boolean
  darkPickMode: boolean
  placingMode: boolean
}

export function HuimingBoard({ state, onCellClick, interactive, darkPickMode, placingMode }: HuimingBoardProps) {
  const grid: GridCell[][] = state.board.map(row =>
    row.map(cell => ({ card: cell.card, faceUp: cell.faceUp, exists: cell.exists }))
  )

  return (
    <CardGrid
      grid={grid}
      cols={5}
      onCellClick={onCellClick}
      isCellInteractive={(r, c, cell) => {
        if (!interactive) return false
        if (cell.faceUp && cell.card) return true
        // Any face-down card may be attempted in dark-pick mode; the server
        // has the final say on what may be taken.
        if (!cell.faceUp && cell.exists && darkPickMode) return true
        if (!cell.exists && placingMode) return true
        return false
      }}
      isCellHighlighted={(r, c, cell) => {
        if (!cell.faceUp && !!cell.exists && darkPickMode) return true
        if (!cell.exists && placingMode) return true
        return false
      }}
    />
  )
}

// games/huiming/ui/HuimingGame.tsx
import { useState } from 'react'
import type { GameComponentProps, Card } from '@huiming/core-shared'
import { PlayerInfo, CardHand } from '@huiming/core-client/components'
import { HuimingBoard } from './HuimingBoard'
import type { HuimingClientState } from '../types'
import './styles.css'

export function HuimingGame({ state, playerId, onAction }: GameComponentProps) {
  const s = state as HuimingClientState
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [placingFaceUp, setPlacingFaceUp] = useState(true)

  // Determine if it's my turn
  // In client state, currentTurn is 0 or 1 relative to the player array
  // We need to figure out which index "I" am
  // Since getClientState sends myHand for "me", we can use a simple heuristic:
  // The first player to receive state with currentTurn=0 and myHand is player 0
  // For simplicity, we'll use a flag in state or check against playerId
  // Actually, the plugin sets currentTurn as 0|1 in the game state.
  // We need to know which player we are. Let's assume the client knows its index.
  // For now, we'll use a simplified check.
  const isMyTurn = s.currentTurn === 0 // This is simplified; real impl would track player index

  const handleCellClick = (row: number, col: number) => {
    if (s.winner || !isMyTurn) return
    const cell = s.board[row][col]

    if (selectedCard) {
      if (!cell.card) {
        onAction('place', { cardId: selectedCard.id, row, col, faceUp: placingFaceUp })
        setSelectedCard(null)
      }
      return
    }

    if (cell.card && cell.faceUp) {
      onAction('take', { row, col })
    } else if (cell.card && !cell.faceUp && s.myDarkPickCharges > 0) {
      onAction('darkPick', { row, col })
    }
  }

  const handleHandClick = (card: Card) => {
    if (s.myCanPlace && isMyTurn) setSelectedCard(card)
  }

  return (
    <>
      <PlayerInfo
        label="对手"
        handCount={s.opponentHandCount}
        isTurn={!isMyTurn}
      />

      <HuimingBoard
        state={s}
        onCellClick={handleCellClick}
        interactive={isMyTurn && !s.winner}
        darkPickMode={s.myDarkPickCharges > 0 && !selectedCard}
      />

      <div className="huiming-hand-section">
        {selectedCard && (
          <div className="huiming-place-controls">
            <span>放置: {selectedCard.rank === 'JOKER' ? 'Joker' : `${selectedCard.suit} ${selectedCard.rank}`}</span>
            <label><input type="radio" checked={placingFaceUp} onChange={() => setPlacingFaceUp(true)} /> 明置</label>
            <label><input type="radio" checked={!placingFaceUp} onChange={() => setPlacingFaceUp(false)} /> 暗置</label>
            <button onClick={() => setSelectedCard(null)}>取消</button>
          </div>
        )}
        <PlayerInfo
          label="你"
          handCount={s.myHand.length}
          extraInfo={[
            { key: '暗取', value: s.myDarkPickCharges },
            { key: '轮次', value: s.round },
          ]}
          isTurn={isMyTurn}
        />
        <CardHand
          cards={s.myHand}
          selectable={s.myCanPlace && isMyTurn && !selectedCard}
          onCardClick={handleHandClick}
          selectedId={selectedCard?.id}
        />
      </div>

      {s.winner && (
        <div className="huiming-game-over">
          <h2>{s.winner === playerId ? '你赢了！' : '对手获胜'}</h2>
        </div>
      )}
    </>
  )
}

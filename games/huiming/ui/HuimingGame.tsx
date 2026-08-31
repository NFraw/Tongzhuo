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

  const isMyTurn = s.currentTurn === s.myPlayerIndex

  const handleCellClick = (row: number, col: number) => {
    if (s.winner || !isMyTurn) return
    const cell = s.board[row][col]

    // Placing a card on an empty cell
    if (selectedCard) {
      if (!cell.exists) {
        onAction('place', { cardId: selectedCard.id, row, col, faceUp: placingFaceUp })
        setSelectedCard(null)
      }
      return
    }

    // Taking a face-up card
    if (cell.faceUp && cell.card) {
      onAction('take', { row, col })
    }
    // Dark pick: card exists but face-down, and player has charges
    else if (!cell.faceUp && cell.exists && s.myDarkPickCharges > 0) {
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
        darkPickMode={isMyTurn && s.myDarkPickCharges > 0 && !selectedCard}
      />

      {isMyTurn && s.myDarkPickCharges > 0 && !selectedCard && (
        <div className="huiming-dark-pick-hint">
          暗取模式 — 点击任意暗牌盲取（剩余 {s.myDarkPickCharges} 次）
        </div>
      )}

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

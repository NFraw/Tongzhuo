// games/huiming/ui/HuimingGame.tsx
import { useState } from 'react'
import type { GameComponentProps, Card } from '@tongzhuo/core-shared'
import { PlayerInfo, CardHand } from '@tongzhuo/core-client/components'
import { HuimingBoard } from './HuimingBoard'
import type { HuimingClientState } from '../types'
import './styles.css'

export function HuimingGame({ state, playerId, onAction, playerNames = {} }: GameComponentProps) {
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
    // Dark pick: card exists but face-down, and player has charges. Whether it
    // is a Joker is hidden info (the client sees card:null), so the client may
    // attempt any face-down card — the server's canTake is the authority on
    // what may be taken.
    else if (!cell.faceUp && cell.exists && s.myDarkPickCharges > 0) {
      onAction('darkPick', { row, col })
    }
  }

  const handleHandClick = (card: Card) => {
    if (s.myCanPlace && isMyTurn && !s.hasTakenThisTurn) setSelectedCard(card)
  }

  return (
    <>
      <div className="huiming-opponents">
        {s.opponents.map(o => (
          <PlayerInfo
            key={o.id}
            label={playerNames?.[o.id] ?? '对手'}
            handCount={o.handCount}
            isTurn={s.currentTurn === o.index}
          />
        ))}
      </div>

      <HuimingBoard
        state={s}
        onCellClick={handleCellClick}
        interactive={isMyTurn && !s.winner}
        darkPickMode={isMyTurn && s.myDarkPickCharges > 0 && !selectedCard}
        placingMode={!!selectedCard && isMyTurn}
      />

      {isMyTurn && s.myDarkPickCharges > 0 && !selectedCard && (
        <div className="huiming-dark-pick-hint">
          暗取模式 — 点击暗牌盲取（剩余 {s.myDarkPickCharges} 次）
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
          selectable={s.myCanPlace && isMyTurn && !selectedCard && !s.hasTakenThisTurn}
          onCardClick={handleHandClick}
          selectedId={selectedCard?.id}
        />
      </div>

      {s.winner && (
        <div className="huiming-game-over">
          <h2>{s.winner === playerId ? '你赢了！' : `${playerNames?.[s.winner] ?? '对手'} 获胜`}</h2>
        </div>
      )}
    </>
  )
}

// games/nimmt/ui/NimmtGame.tsx
import { useEffect, useMemo, useRef } from 'react'
import type { GameComponentProps, Card } from '@huiming/core-shared'
import { useAudio } from '@huiming/core-client/hooks'
import { NimmtCard } from './NimmtCard'
import type { NimmtClientState } from '../types'
import './styles.css'

const ROW_LABELS = ['第一行', '第二行', '第三行', '第四行']

export function NimmtGame({ state, onAction }: GameComponentProps) {
  const s = state as NimmtClientState
  const isSelecting = s.phase === 'selecting'
  const isEnded = s.phase === 'ended'
  const myPickup = s.pendingPickup && s.pendingPickup.playerIndex === s.myIndex

  const bgmScene = isEnded ? (s.myWinner ? 'win' : 'lose') : 'normal'
  const { playVoice } = useAudio(bgmScene)

  const prevRef = useRef<{ ended: boolean; myWinner: boolean }>({ ended: false, myWinner: false })
  useEffect(() => {
    const p = prevRef.current
    if (!p.ended && s.phase === 'ended') {
      playVoice(s.myWinner ? '我赢了' : '我输了')
    }
    prevRef.current = { ended: s.phase === 'ended', myWinner: s.myWinner }
  }, [s.phase, s.myWinner, playVoice])

  const committedCount = useMemo(() => s.players.filter(p => p.committed).length, [s.players])
  const totalPlayers = s.players.length

  const handleHandClick = (card: Card) => {
    if (!isSelecting || isEnded) return
    onAction('select', { cardId: card.id })
  }

  const handleRowClick = (row: number) => {
    if (!myPickup) return
    onAction('chooseRow', { row })
  }

  const label = (i: number) => (i === s.myIndex ? '你' : `玩家${i + 1}`)

  return (
    <div className="nimmt-game">
      <div className="nimmt-header">
        <span className="nimmt-round">第 {s.round} / 10 轮</span>
        <span className="nimmt-hint">牛头越少越好</span>
      </div>

      {/* Opponents */}
      <div className="nimmt-opponents">
        {s.players.map((p, i) => {
          if (i === s.myIndex) return null
          const isPending = s.pendingPickup?.playerIndex === i
          return (
            <div key={i} className={`nimmt-player ${isPending ? 'acting' : ''}`}>
              <div className="nimmt-player-title">
                {label(i)}
                {isPending && <span className="nimmt-acting-tag">选行中</span>}
              </div>
              <div className="nimmt-player-row">
                <span>牛头: {p.score}</span>
                <span>手牌: {p.handCount}</span>
                {isSelecting && (
                  <span className="nimmt-committed">{p.committed ? '已选牌 ✓' : '选牌中…'}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className={`nimmt-table ${myPickup ? 'pickup-open' : ''}`}>
        <div className="nimmt-table-title">
          {myPickup
            ? `你的牌 ${s.pendingPickup!.card.value} 低于所有行尾，点击一行捡走！`
            : s.pendingPickup
              ? `玩家${s.pendingPickup.playerIndex + 1} 正在选行…`
              : '桌面'}
        </div>
        {s.board.map((cards, row) => (
          <div key={row} className="nimmt-row">
            <div className="nimmt-row-label">{ROW_LABELS[row]}</div>
            <div
              className={`nimmt-row-cards ${myPickup ? 'clickable' : ''}`}
              onClick={() => handleRowClick(row)}
            >
              {cards.map((c, idx) => (
                <NimmtCard
                  key={c.id}
                  card={c}
                  end={idx === cards.length - 1}
                  dimmed={cards.length < 2}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Last round recap */}
      {s.lastResolve && !isEnded && (
        <div className="nimmt-recap">
          {s.lastResolve.map((step, i) => (
            <div key={i} className="nimmt-recap-line">
              {label(step.playerIndex)} 出 {step.card.value}
              {step.pickedUpRow !== null
                ? ` → 捡走${ROW_LABELS[step.pickedUpRow]}（+${step.gainedHeads} 头），${step.card.value} 开新行`
                : ` → 放入${ROW_LABELS[step.placedRow]}`}
            </div>
          ))}
        </div>
      )}

      {/* My hand */}
      <div className="nimmt-my-area">
        <div className="nimmt-my-info">
          <span>你</span>
          <span>牛头: {s.players[s.myIndex]?.score ?? 0}</span>
          <span>手牌: {s.myHand.length}</span>
          {isSelecting && (
            <span className="nimmt-waiting">
              {s.myCommitted
                ? `本轮已出牌: ${s.myCommitted.value}（可改选）`
                : '请选一张牌'}
              {s.myCommitted && ` · 等待其他玩家 ${committedCount}/${totalPlayers}`}
            </span>
          )}
        </div>
        <div className="nimmt-my-hand">
          {s.myHand.length === 0 && <span className="hand-empty">（本轮无剩余手牌）</span>}
          <div className="nimmt-hand-list">
            {s.myHand.map(card => (
              <NimmtCard
                key={card.id}
                card={card}
                clickable={isSelecting}
                selected={s.myCommitted?.id === card.id}
                onClick={() => handleHandClick(card)}
              />
            ))}
          </div>
          {s.myCommitted && (
            <div className="nimmt-committed-slot">
              已选: <NimmtCard card={s.myCommitted} />
            </div>
          )}
        </div>
      </div>

      {/* Game over */}
      {isEnded && (
        <div className="nimmt-game-over">
          <h2>{s.myWinner ? '你赢了！' : '你输了'}</h2>
          <ol className="nimmt-ranking">
            <li>先按牛头数从少到多排列：</li>
            {[...s.players]
              .map((p, i) => ({ p, i }))
              .sort((a, b) => a.p.score - b.p.score)
              .map(({ p, i }) => (
                <li key={i} className={i === s.winnerIndex ? 'winner' : ''}>
                  {label(i)} — {p.score} 头{i === s.winnerIndex ? ' 🏆' : ''}
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  )
}

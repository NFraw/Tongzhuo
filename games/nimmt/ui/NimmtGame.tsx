// games/nimmt/ui/NimmtGame.tsx — v1.3
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { GameComponentProps, Card } from '@huiming/core-shared'
import { useAudio } from '@huiming/core-client/hooks'
import { NimmtCard } from './NimmtCard'
import type { NimmtClientState } from '../types'
import './styles.css'

const ROW_LABELS = ['第一行', '第二行', '第三行', '第四行']

export function NimmtGame({ state, onAction, playerNames = {} }: GameComponentProps) {
  const s = state as NimmtClientState
  const isSelecting = s.phase === 'selecting'
  const isEnded = s.phase === 'ended'
  const myPickup = s.pendingPickup && s.pendingPickup.playerIndex === s.myIndex

  const { playVoice, setBgmScene } = useAudio()

  // BGM scene calculation
  const bgmScene = useMemo(() => {
    if (isEnded) return null  // Game over, stop BGM
    return 'playing'
  }, [isEnded])

  // Set BGM scene
  useEffect(() => {
    setBgmScene(bgmScene)
  }, [bgmScene, setBgmScene])

  // ── Voice on game end ──
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

  // ── Sort hand cards by value (ascending, left to right) ──
  const sortedHand = useMemo(
    () => [...s.myHand].sort((a, b) => a.value - b.value),
    [s.myHand]
  )

  // ── Animation state ──
  const [animatedCards, setAnimatedCards] = useState<Set<string>>(new Set())
  const [bullCollectCards, setBullCollectCards] = useState<Set<string>>(new Set())
  const [glowRows, setGlowRows] = useState<Set<number>>(new Set())
  const [bullParticles, setBullParticles] = useState<{ id: number; x: number; y: number }[]>([])
  const prevBoardRef = useRef<Card[][]>(s.board.map(r => [...r]))
  const particleIdRef = useRef(0)
  const timersRef = useRef<number[]>([])

  // Helper to track timeouts for cleanup
  const trackedSetTimeout = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }, [])

  // Spawn floating bull head emoji particles
  const spawnBullParticles = useCallback((count: number) => {
    const newParticles: { id: number; x: number; y: number }[] = []
    for (let i = 0; i < Math.min(count * 2, 8); i++) {
      newParticles.push({
        id: particleIdRef.current++,
        x: 30 + Math.random() * 60,
        y: 30 + Math.random() * 40,
      })
    }
    setBullParticles(prev => [...prev, ...newParticles])
    trackedSetTimeout(() => {
      setBullParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)))
    }, 1300)
  }, [trackedSetTimeout])

  // Detect board changes during resolving and trigger animations
  useEffect(() => {
    if (s.phase !== 'resolving') {
      prevBoardRef.current = s.board.map(r => [...r])
      return
    }

    const prevBoard = prevBoardRef.current
    const newPlaced = new Set<string>()
    const newCollected = new Set<string>()
    const affectedRows = new Set<number>()

    for (let r = 0; r < s.board.length; r++) {
      const prevIds = new Set(prevBoard[r].map(c => c.id))
      const currIds = new Set(s.board[r].map(c => c.id))

      for (const card of s.board[r]) {
        if (!prevIds.has(card.id)) {
          newPlaced.add(card.id)
          affectedRows.add(r)
        }
      }

      for (const card of prevBoard[r]) {
        if (!currIds.has(card.id)) {
          newCollected.add(card.id)
        }
      }
    }

    if (newPlaced.size > 0) {
      setAnimatedCards(new Set(newPlaced))
      setGlowRows(new Set(affectedRows))
      trackedSetTimeout(() => {
        setAnimatedCards(new Set())
        setGlowRows(new Set())
      }, 700)
    }

    if (newCollected.size > 0) {
      setBullCollectCards(new Set(newCollected))
      spawnBullParticles(newCollected.size)
      trackedSetTimeout(() => setBullCollectCards(new Set()), 800)
    }

    prevBoardRef.current = s.board.map(r => [...r])
  }, [s.board, s.phase, trackedSetTimeout, spawnBullParticles])

  // Cleanup all pending timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(id => clearTimeout(id))
      timersRef.current = []
    }
  }, [])

  const handleHandClick = (card: Card) => {
    if (!isSelecting || isEnded) return
    onAction('select', { cardId: card.id })
  }

  const handleRowClick = (row: number) => {
    if (!myPickup) return
    onAction('chooseRow', { row })
  }

  // Resolve a seat index to a player's nickname (fall back to generic label).
  const nameOf = (i: number) => playerNames?.[s.players[i]?.id] ?? `玩家${i + 1}`
  const label = (i: number) => (i === s.myIndex ? '你' : nameOf(i))

  return (
    <div className="nimmt-game">
      {/* ── Header ── */}
      <div className="nimmt-header">
        <span className="nimmt-round">第 {s.round} / 10 轮</span>
        <span className="nimmt-hint">牛头越少越好 · 收集最少牛头者获胜</span>
      </div>

      {/* ── Left sidebar: opponents ── */}
      <div className="nimmt-sidebar">
        {s.players.map((p, i) => {
          if (i === s.myIndex) return null
          const isPending = s.pendingPickup?.playerIndex === i
          return (
            <div key={i} className={`nimmt-player ${isPending ? 'acting' : ''}`}>
              <div className="nimmt-player-title">
                {label(i)}
                {isPending && <span className="nimmt-acting-tag">选行中</span>}
              </div>
              <div className="nimmt-player-stats">
                <span>🐂 牛头: <strong>{p.score}</strong></span>
                <span>🃏 手牌: <strong>{p.handCount}</strong></span>
                {isSelecting && (
                  <span className="nimmt-committed">
                    {p.committed ? '✓ 已选牌' : '⏳ 选牌中…'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Center: table ── */}
      <div className={`nimmt-table ${myPickup ? 'pickup-open' : ''}`}>
        <div className="nimmt-table-title">
          {myPickup
            ? `你的牌 ${s.pendingPickup!.card.value} 低于所有行尾，点击一行捡走！`
            : s.pendingPickup
              ? `${nameOf(s.pendingPickup.playerIndex)} 正在选行…`
              : '牌桌'}
        </div>
        {s.board.map((cards, row) => (
          <div key={row} className="nimmt-row">
            <div className="nimmt-row-label">{ROW_LABELS[row]}</div>
            <div
              className={`nimmt-row-cards ${myPickup ? 'clickable' : ''} ${glowRows.has(row) ? 'row-glow' : ''}`}
              onClick={() => handleRowClick(row)}
            >
              {cards.map((c, idx) => (
                <NimmtCard
                  key={c.id}
                  card={c}
                  end={idx === cards.length - 1}
                  dimmed={cards.length < 2}
                  entering={animatedCards.has(c.id)}
                  collecting={bullCollectCards.has(c.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Last round recap ── */}
      {s.lastResolve && !isEnded && (
        <div className="nimmt-recap">
          <div style={{ fontWeight: 700, color: '#8a90a0', marginBottom: 4 }}>上轮回顾</div>
          {s.lastResolve.map((step, i) => (
            <div key={i} className="nimmt-recap-line">
              {label(step.playerIndex)} 出 {step.card.value}
              {step.pickedUpRow !== null
                ? ` → 捡走${ROW_LABELS[step.pickedUpRow]}（+${step.gainedHeads} 🐂），${step.card.value} 开新行`
                : ` → 放入${ROW_LABELS[step.placedRow]}`}
            </div>
          ))}
        </div>
      )}

      {/* ── My hand — bottom area ── */}
      <div className="nimmt-my-area">
        <div className="nimmt-my-info">
          <span>👤 你</span>
          <span>🐂 牛头: <strong>{s.players[s.myIndex]?.score ?? 0}</strong></span>
          <span>🃏 手牌: <strong>{s.myHand.length}</strong></span>
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
          {sortedHand.length === 0 && <span className="hand-empty">（本轮无剩余手牌）</span>}
          <div className="nimmt-hand-list">
            {sortedHand.map(card => (
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

      {/* ── Floating bull particles ── */}
      {bullParticles.map(p => (
        <div
          key={p.id}
          className="bull-particle"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          🐂
        </div>
      ))}

      {/* ── Game over ── */}
      {isEnded && (
        <div className="nimmt-game-over">
          <h2>{s.myWinner ? '你赢了！🎉' : '你输了'}</h2>
          <ol className="nimmt-ranking">
            <li style={{ color: '#6a7080', fontSize: 14, listStyle: 'none' }}>
              按牛头数从少到多排列：
            </li>
            {[...s.players]
              .map((p, i) => ({ p, i }))
              .sort((a, b) => a.p.score - b.p.score)
              .map(({ p, i }, rank) => (
                <li key={i} className={i === s.winnerIndex ? 'winner' : ''}>
                  {rank + 1}. {label(i)} — {p.score} 🐂{i === s.winnerIndex ? ' 🏆' : ''}
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  )
}

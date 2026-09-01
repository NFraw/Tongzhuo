import { useState, useCallback, useRef, useEffect } from 'react'
import type { GameComponentProps, Card } from '@huiming/core-shared'
import { useAudio } from '@huiming/core-client/hooks'
import { CardImage } from './CardImage'
import type { LandlordClientState, HandType } from '../types'
import './styles.css'

/** landlordRank → voice file index mapping */
function rankToVoiceIdx(rank: number): number {
  if (rank <= 13) return rank    // 3-K → 3-13
  if (rank === 14) return 1      // A → 1
  if (rank === 15) return 2      // 2 → 2
  if (rank === 16) return 14     // 小王 → 14
  if (rank === 17) return 15     // 大王 → 15
  return 3
}

/** Pick a random variant from a list */
function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Select voice file for a given hand type and main rank */
function pickVoice(type: HandType, mainRank: number): string {
  const v = rankToVoiceIdx(mainRank)
  switch (type) {
    case 'single':        return `dan${v}.ogg`
    case 'pair':          return `dui${v}.ogg`
    case 'triple':        return `tuple${v}.ogg`
    case 'triple_one':    return 'sandaiyi.ogg'
    case 'triple_two':    return 'sandaiyidui.ogg'
    case 'straight':      return 'shunzi.ogg'
    case 'double_straight': return 'liandui.ogg'
    case 'plane':         return 'feiji.ogg'
    case 'plane_single':  return 'feiji.ogg'
    case 'plane_pair':    return 'feiji.ogg'
    case 'four_two':      return 'sidaier.ogg'
    case 'four_two_pair': return 'sidailiangdui.ogg'
    case 'bomb':          return 'zhadan.ogg'
    case 'rocket':        return 'wangzha.ogg'
    default:              return 'dan3.ogg'
  }
}

export function LandlordGame({ state, playerId, onAction }: GameComponentProps) {
  const s = state as LandlordClientState
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  /** Wrapped onAction */
  const doAction = useCallback((event: string, payload: any) => {
    onAction(event, payload)
  }, [onAction])

  const isMyTurn = s.currentTurn === s.myPlayerIndex
  const isBidding = s.currentPhase === 'bidding'
  const isPlaying = s.currentPhase === 'playing'

  // Opponent indices
  const opponentIndices = [0, 1, 2].filter(i => i !== s.myPlayerIndex)

  // Derive the looping BGM scene. Priority: settlement > endgame > opening >
  // normal play. "welcome" accompanies the room/bid setup until the first play;
  // "exciting" engages the moment any player is down to 3 cards and stays until
  // the game ends.
  const handCounts = [s.myHand.length, s.otherHandCounts[0], s.otherHandCounts[1]]
  const endgame = handCounts.some(c => c <= 3)
  const bgmScene = s.winner
    ? (s.winner === s.myRole ? 'win' : 'lose')
    : endgame ? 'exciting'
    : s.currentPhase === 'bidding' ? 'welcome'
    : 'normal'
  const { playVoice } = useAudio(bgmScene)

  // Track prior state to fire voice SFX on transitions.
  // Use passEvent (monotonic counter) instead of passCount (resets after2 passes)
  // to reliably detect each pass action.
  const prevRef = useRef<{
    winner: string | null
    role: string | null
    lastPlay: typeof s.gameInfo.lastPlay
    passEvent: number
  }>({ winner: null, role: null, lastPlay: null, passEvent: 0 })

  useEffect(() => {
    const p = prevRef.current
    const lp = s.gameInfo.lastPlay
    const pe = s.gameInfo.passEvent

    // Winner announcement
    if (p.winner !== s.winner && s.winner) {
      playVoice(s.winner === s.myRole ? 'yingle.mp3' : 'shule.mp3')
    }

    // Deep comparison for lastPlay to avoid missing plays with reused references
    const playChanged = lp && (
      lp.type !== p.lastPlay?.type ||
      lp.mainRank !== p.lastPlay?.mainRank ||
      lp.cards.length !== p.lastPlay?.cards.length ||
      lp.cards.some((c, i) => c.id !== p.lastPlay?.cards[i]?.id)
    )

    if (playChanged) {
      playVoice(pickVoice(lp.type, lp.mainRank))
      // Bomb/rocket: play explosion SFX instead of switching BGM
      if (lp.type === 'bomb' || lp.type === 'rocket') {
        playVoice('special_bomb.ogg')
      }
    }

    // Pass: use passEvent (monotonic) — increments on every pass, never resets
    if (pe > p.passEvent) {
      playVoice(randPick(['buyao1.ogg', 'buyao2.ogg', 'buyao3.ogg']))
    }

    prevRef.current = { winner: s.winner, role: s.myRole, lastPlay: lp, passEvent: pe }
  }, [s.winner, s.myRole, s.gameInfo.lastPlay, s.gameInfo.passEvent, playVoice])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
      } else if (e.key === 'Enter' && isPlaying && isMyTurn) {
        const selectedCards = s.myHand.filter(c => selectedIds.has(c.id))
        if (selectedCards.length > 0) {
          doAction('play', { cards: selectedCards })
          setSelectedIds(new Set())
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedIds, isPlaying, isMyTurn, s.myHand, doAction])

  const toggleCard = useCallback((card: Card) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(card.id)) next.delete(card.id)
      else next.add(card.id)
      return next
    })
  }, [])

  const handlePlay = useCallback(() => {
    const selectedCards = s.myHand.filter(c => selectedIds.has(c.id))
    if (selectedCards.length === 0) {
      setToast('请先选牌')
      setTimeout(() => setToast(null), 2000)
      return
    }
    doAction('play', { cards: selectedCards })
    setSelectedIds(new Set())
  }, [s.myHand, selectedIds, doAction])

  const handlePass = useCallback(() => {
    doAction('pass', {})
    setSelectedIds(new Set())
  }, [doAction])

  const handleBid = useCallback((score: number) => {
    doAction('bid', { score })
  }, [doAction])

  // Drag-select (box selection) handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isPlaying || !isMyTurn) return
    const target = e.target as HTMLElement
    if (target.closest('.card-shell')) return // Don't start drag on cards
    setDragStart({ x: e.clientX, y: e.clientY })
    setDragEnd({ x: e.clientX, y: e.clientY })
  }, [isPlaying, isMyTurn])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragStart) {
      setDragEnd({ x: e.clientX, y: e.clientY })
    }
  }, [dragStart])

  const handleMouseUp = useCallback(() => {
    if (!dragStart || !dragEnd) {
      setDragStart(null)
      setDragEnd(null)
      return
    }

    // Calculate selection box
    const left = Math.min(dragStart.x, dragEnd.x)
    const right = Math.max(dragStart.x, dragEnd.x)
    const top = Math.min(dragStart.y, dragEnd.y)
    const bottom = Math.max(dragStart.y, dragEnd.y)

    // Only process if drag was significant
    if (right - left > 10 || bottom - top > 10) {
      const newSelected = new Set(selectedIds)
      cardRefs.current.forEach((el, cardId) => {
        const rect = el.getBoundingClientRect()
        const cardCenterX = rect.left + rect.width / 2
        const cardTop = rect.top
        const cardBottom = rect.bottom
        if (cardCenterX >= left && cardCenterX <= right && cardBottom >= top && cardTop <= bottom) {
          newSelected.add(cardId)
        }
      })
      setSelectedIds(newSelected)
    }

    setDragStart(null)
    setDragEnd(null)
  }, [dragStart, dragEnd, selectedIds])

  // Register card ref for drag-select
  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  const getRoleTag = (playerIdx: number) => {
    if (s.currentPhase === 'bidding') return null
    if (s.gameInfo.landlord === playerIdx) return '地主'
    return '农民'
  }

  const canPassNow = isPlaying && isMyTurn && s.gameInfo.lastPlay && s.gameInfo.lastPlayer !== s.myPlayerIndex

  // Drag selection box rendering
  const selectionBox = dragStart && dragEnd ? {
    left: Math.min(dragStart.x, dragEnd.x),
    top: Math.min(dragStart.y, dragEnd.y),
    width: Math.abs(dragEnd.x - dragStart.x),
    height: Math.abs(dragEnd.y - dragStart.y),
  } : null

  return (
    <div
      className="landlord-game"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Drag selection box */}
      {selectionBox && (
        <div
          className="landlord-drag-box"
          style={{
            position: 'fixed',
            left: selectionBox.left,
            top: selectionBox.top,
            width: selectionBox.width,
            height: selectionBox.height,
          }}
        />
      )}

      {/* Top area: opponents + bottom cards */}
      <div className="landlord-top-area">
        {/* Opponent 1 */}
        <div className="landlord-opponent">
          <div className="landlord-opponent-info">
            <span className={`turn-dot ${s.currentTurn === opponentIndices[0] ? 'active' : ''}`} />
            <span className="landlord-opponent-name">对手1</span>
            {getRoleTag(opponentIndices[0]) && (
              <span className={`landlord-role-tag ${opponentIndices[0] === s.gameInfo.landlord ? 'landlord' : 'farmer'}`}>
                {getRoleTag(opponentIndices[0])}
              </span>
            )}
            <span className="landlord-hand-count">{s.otherHandCounts[0]}张</span>
          </div>
          <div className="landlord-opponent-cards">
            {Array.from({ length: Math.min(s.otherHandCounts[0], 8) }).map((_, i) => (
              <CardImage key={i} faceUp={false} />
            ))}
          </div>
        </div>

        {/* Bottom cards */}
        {s.bottomCards.length > 0 && (
          <div className="landlord-bottom-cards">
            <span className="landlord-bottom-label">底牌</span>
            <div className="landlord-bottom-card-row">
              {s.bottomCards.map(card => (
                <CardImage key={card.id} card={card} faceUp />
              ))}
            </div>
          </div>
        )}

        {/* Opponent 2 */}
        <div className="landlord-opponent">
          <div className="landlord-opponent-info">
            <span className={`turn-dot ${s.currentTurn === opponentIndices[1] ? 'active' : ''}`} />
            <span className="landlord-opponent-name">对手2</span>
            {getRoleTag(opponentIndices[1]) && (
              <span className={`landlord-role-tag ${opponentIndices[1] === s.gameInfo.landlord ? 'landlord' : 'farmer'}`}>
                {getRoleTag(opponentIndices[1])}
              </span>
            )}
            <span className="landlord-hand-count">{s.otherHandCounts[1]}张</span>
          </div>
          <div className="landlord-opponent-cards">
            {Array.from({ length: Math.min(s.otherHandCounts[1], 8) }).map((_, i) => (
              <CardImage key={i} faceUp={false} />
            ))}
          </div>
        </div>
      </div>

      {/* Center: play area */}
      <div className="landlord-center">
        {/* Multiplier */}
        {s.gameInfo.multiplier > 1 && (
          <div className="landlord-multiplier">{s.gameInfo.multiplier}倍</div>
        )}

        {/* Last play */}
        {s.gameInfo.lastPlay ? (
          <div className="landlord-last-play">
            <div className="landlord-last-play-cards">
              {s.gameInfo.lastPlay.cards.map(card => (
                <CardImage key={card.id} card={card} faceUp />
              ))}
            </div>
          </div>
        ) : isPlaying ? (
          <div className="landlord-free-play-hint">请出牌</div>
        ) : null}

        {/* Bidding UI */}
        {isBidding && s.biddingInfo.myTurnToBid && (
          <div className="landlord-bidding">
            <div className="landlord-bidding-info">
              {s.biddingInfo.round === 2
                ? '底牌已亮出（明叫）'
                : '盲叫阶段'}
              {' · '}
              当前最高: {s.biddingInfo.highestBid > 0 ? `${s.biddingInfo.highestBid}分` : '无人叫分'}
            </div>
            <div className="landlord-bid-buttons">
              <button className="landlord-bid-btn pass" onClick={() => handleBid(0)}>不叫</button>
              {[1, 2, 3].map(score => (
                <button
                  key={score}
                  className={`landlord-bid-btn score ${score <= s.biddingInfo.highestBid ? 'disabled' : ''}`}
                  onClick={() => score > s.biddingInfo.highestBid && handleBid(score)}
                  disabled={score <= s.biddingInfo.highestBid}
                >
                  {score}分
                </button>
              ))}
            </div>
          </div>
        )}

        {isBidding && !s.biddingInfo.myTurnToBid && (
          <div className="landlord-bidding">
            <div className="landlord-bidding-info">
              {s.biddingInfo.round === 2 ? '底牌已亮出（明叫）· ' : ''}
              等待玩家{s.currentTurn + 1}叫分
              {s.biddingInfo.highestBid > 0 ? `（最高 ${s.biddingInfo.highestBid}分）` : ''}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isPlaying && isMyTurn && (
          <div className="landlord-actions">
            <button
              className="landlord-action-btn play"
              onClick={handlePlay}
              disabled={selectedIds.size === 0}
            >
              出牌
            </button>
            <button
              className="landlord-action-btn pass"
              onClick={handlePass}
              disabled={!canPassNow}
            >
              不出
            </button>
          </div>
        )}

        {isPlaying && !isMyTurn && (
          <div className="landlord-turn-hint waiting">等待对手出牌...</div>
        )}
      </div>

      {/* Bottom: my hand */}
      <div className="landlord-my-area">
        <div className="landlord-my-info">
          <span className={`turn-dot ${isMyTurn ? 'active' : ''}`} />
          <span>你</span>
          {s.myRole && (
            <span className={`landlord-role-tag ${s.myRole === 'landlord' ? 'landlord' : 'farmer'}`}>
              {s.myRole === 'landlord' ? '地主' : '农民'}
            </span>
          )}
          <span>{s.myHand.length}张</span>
          {s.gameInfo.baseScore > 0 && <span>底分 {s.gameInfo.baseScore}</span>}
        </div>
        <div className="landlord-my-hand" ref={handRef}>
          {s.myHand.map((card, i) => (
            <div
              key={card.id}
              ref={el => registerCardRef(card.id, el)}
              className={`landlord-hand-card-wrapper ${selectedIds.has(card.id) ? 'selected' : ''}`}
              style={{ zIndex: i }}
            >
              <CardImage
                card={card}
                faceUp
                selected={selectedIds.has(card.id)}
                onClick={() => isPlaying && isMyTurn && toggleCard(card)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Game over overlay */}
      {s.winner && (
        <div className="landlord-game-over">
          <h2>{s.winner === s.myRole ? '你赢了！' : '你输了'}</h2>
          <p>
            {s.winner === 'landlord' ? '地主' : '农民'}获胜
            {s.gameInfo.multiplier > 1 && ` (${s.gameInfo.multiplier}倍)`}
          </p>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="landlord-toast">{toast}</div>
      )}
    </div>
  )
}

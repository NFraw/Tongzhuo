/**
 * LandlordGame.tsx — 斗地主游戏客户端组件
 *
 * 这是斗地主的"主视图"，负责：
 *   1. 渲染游戏 UI（手牌、对手、出牌区、按钮）
 *   2. 处理用户交互（选牌、出牌、叫分）
 *   3. 管理 BGM 和语音音效
 *   4. 连接 PixiJS canvas 渲染器（或 CSS 兜底）
 *
 * 架构：
 *   - canvasOk=true → 使用 PixiJS canvas 渲染（GameCanvas + React HUD overlay）
 *   - canvasOk=false → 降级到纯 CSS 渲染（旧方案）
 *   - WebGL 不可用或 localStorage['huiming-renderer']='css' → 强制 CSS
 *
 * React ↔ PixiJS 通信模型（防死循环）：
 *   点击 Sprite → renderer 内部更新 selected → 上报 onSelectionChange
 *   → React setSelectedIds → useEffect 调 renderer.sync()
 *   → renderer diff 发现 selected 与镜像一致 → 跳过动画
 *
 * 【如果你想修改斗地主 UI】：
 *   - canvas 路径：修改 LandlordRenderer.ts + layout.ts
 *   - CSS 路径：修改本文件的 LandlordGameCSS 组件
 *   - HUD（按钮、提示等）：修改 LandlordHUD 组件
 *   - 语音：修改 pickVoice() 和音效触发逻辑
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { GameComponentProps, Card } from '@tongzhuo/core-shared'
import { GameCanvas } from '@tongzhuo/core-client/renderer'
import { useAudio } from '@tongzhuo/core-client/hooks'
import { CardImage } from './CardImage'
import { createLandlordRenderer } from './renderer'
import type { LandlordClientState, HandType } from '../types'
import './styles.css'

// ─── 语音辅助函数（canvas 和 CSS 路径共用） ─────────────────────────────────

/**
 * 将牌型主点数映射到语音文件编号。
 *
 * 映射规则：
 *   3~K → 3~13
 *   A → 1（语音文件中 A 排第一）
 *   2 → 2
 *   小王 → 14，大王 → 15
 */
function rankToVoiceIdx(rank: number): number {
  if (rank <= 13) return rank
  if (rank === 14) return 1
  if (rank === 15) return 2
  if (rank === 16) return 14
  if (rank === 17) return 15
  return 3
}

/** 从数组中随机选一个元素 */
function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * 根据牌型选择语音文件。
 *
 * 文件位置：client/public/audio/voice/
 *
 * 牌型 → 语音文件映射：
 *   single → dan{v}.ogg（单张）
 *   pair → dui{v}.ogg（对子）
 *   triple → tuple{v}.ogg（三条）
 *   triple_one → sandaiyi.ogg（三带一）
 *   triple_two → sandaiyidui.ogg（三带二）
 *   straight → shunzi.ogg（顺子）
 *   double_straight → liandui.ogg（连对）
 *   plane/plane_single/plane_pair → feiji.ogg（飞机）
 *   four_two → sidaier.ogg（四带二）
 *   four_two_pair → sidailiangdui.ogg（四带两对）
 *   bomb → zhadan.ogg（炸弹）
 *   rocket → wangzha.ogg（王炸）
 */
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

/** 根据座位索引获取玩家昵称 */
function nameFor(s: LandlordClientState, playerNames: Record<string, string>, idx: number): string {
  return playerNames?.[s.playerIds?.[idx]] ?? `玩家${idx + 1}`
}

// ─── 主组件 ────────────────────────────────────────────────────────────────

/**
 * 斗地主游戏组件。
 *
 * 实现了 GameComponentProps 接口：
 *   state       - 服务器同步的游戏状态
 *   playerId    - 当前玩家 ID
 *   onAction    - 发送游戏动作的回调
 *   playerNames - 玩家 ID → 昵称映射
 */
export function LandlordGame({ state, playerId, onAction, playerNames = {} }: GameComponentProps) {
  const s = state as LandlordClientState
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  // canvas 可用性：优先尝试 canvas，失败则降级到 CSS
  const [canvasOk, setCanvasOk] = useState(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('huiming-renderer') === 'css') return false
    return true
  })

  const doAction = useCallback((event: string, payload: any) => {
    onAction(event, payload)
  }, [onAction])

  const isMyTurn = s.currentTurn === s.myPlayerIndex
  const isBidding = s.currentPhase === 'bidding'
  const isPlaying = s.currentPhase === 'playing'
  const opponentIndices = [0, 1, 2].filter(i => i !== s.myPlayerIndex)

  // ─── 音频管理 ──────────────────────────────────────────────────────────

  const { playVoice, setBgmScene } = useAudio()

  // 检测是否进入终局（任一方手牌 ≤ 3 张）
  const endgame = useMemo(
    () => [s.myHand.length, s.otherHandCounts[0], s.otherHandCounts[1]].some(c => c <= 3),
    [s.myHand.length, s.otherHandCounts]
  )

  // BGM 场景计算
  const bgmScene = useMemo(() => {
    if (s.winner) return null          // 游戏结束 → 停止
    if (endgame) return 'exciting'     // 终局 → 紧张 BGM
    if (s.currentPhase === 'bidding') return 'lobby'  // 叫分 → 大厅 BGM
    return 'playing'                   // 对局中 → 对局 BGM
  }, [s.winner, endgame, s.currentPhase])

  useEffect(() => {
    setBgmScene(bgmScene)
  }, [bgmScene, setBgmScene])

  // 兜底：游戏视图卸载时强制停止 BGM
  useEffect(() => {
    return () => setBgmScene(null)
  }, [setBgmScene])

  // ─── 语音触发 ──────────────────────────────────────────────────────────

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

    // 胜利/失败语音
    if (p.winner !== s.winner && s.winner) {
      playVoice(s.winner === s.myRole ? 'yingle.mp3' : 'shule.mp3')
    }

    // 出牌语音（检测出牌内容变化）
    const playChanged = lp && (
      lp.type !== p.lastPlay?.type ||
      lp.mainRank !== p.lastPlay?.mainRank ||
      lp.cards.length !== p.lastPlay?.cards.length ||
      lp.cards.some((c, i) => c.id !== p.lastPlay?.cards[i]?.id)
    )

    if (playChanged) {
      playVoice(pickVoice(lp.type, lp.mainRank))
      // 炸弹/火箭额外播放爆炸音效
      if (lp.type === 'bomb' || lp.type === 'rocket') {
        playVoice('special_bomb.ogg')
      }
    }

    // "不要"语音（pass 事件计数增加）
    if (pe > p.passEvent) {
      playVoice(randPick(['buyao1.ogg', 'buyao2.ogg', 'buyao3.ogg']))
    }

    prevRef.current = { winner: s.winner, role: s.myRole, lastPlay: lp, passEvent: pe }
  }, [s.winner, s.myRole, s.gameInfo.lastPlay, s.gameInfo.passEvent, playVoice])

  // ─── 操作处理 ──────────────────────────────────────────────────────────

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

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set())  // Esc 取消选牌
      } else if (e.key === 'Enter' && isPlaying && isMyTurn) {
        // Enter 出牌
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

  /** 当前是否可以 pass（必须有上一手出牌，且不是自己出的） */
  const canPassNow = !!(isPlaying && isMyTurn && s.gameInfo.lastPlay && s.gameInfo.lastPlayer !== s.myPlayerIndex)

  // ─── 从 canvas 渲染器接收选中变化 ──────────────────────────────────────

  const handleSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedIds(ids)
  }, [])

  // ─── 渲染 ─────────────────────────────────────────────────────────────

  // canvas 路径
  if (canvasOk) {
    return (
      <div className="landlord-game landlord-game--canvas">
        {/* PixiJS canvas（铺满容器） */}
        <GameCanvas
          rendererFactory={createLandlordRenderer}
          state={state}
          selectedIds={selectedIds}
          onAction={doAction}
          onSelectionChange={handleSelectionChange}
          onUnavailable={() => setCanvasOk(false)}
        />

        {/* React HUD 覆盖层（在 canvas 之上） */}
        <LandlordHUD
          s={s}
          selectedIds={selectedIds}
          isMyTurn={isMyTurn}
          isBidding={isBidding}
          isPlaying={isPlaying}
          opponentIndices={opponentIndices}
          canPassNow={canPassNow}
          toast={toast}
          playerNames={playerNames}
          onPlay={handlePlay}
          onPass={handlePass}
          onBid={handleBid}
        />
      </div>
    )
  }

  // CSS 兜底路径
  return (
    <LandlordGameCSS
      s={s}
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      isMyTurn={isMyTurn}
      isBidding={isBidding}
      isPlaying={isPlaying}
      opponentIndices={opponentIndices}
      canPassNow={canPassNow}
      toast={toast}
      setToast={setToast}
      doAction={doAction}
      playerNames={playerNames}
      onPlay={handlePlay}
      onPass={handlePass}
      onBid={handleBid}
    />
  )
}

// ─── HUD 覆盖层（React，叠在 canvas 之上） ───────────────────────────────

interface HUDProps {
  s: LandlordClientState
  selectedIds: Set<string>
  isMyTurn: boolean
  isBidding: boolean
  isPlaying: boolean
  opponentIndices: number[]
  canPassNow: boolean
  toast: string | null
  playerNames?: Record<string, string>
  onPlay: () => void
  onPass: () => void
  onBid: (score: number) => void
}

/**
 * 斗地主 HUD（Heads-Up Display）覆盖层。
 *
 * 包含：
 *   - 顶部：对手信息（昵称、角色、手牌数）
 *   - 中央：叫分按钮 / 出牌按钮 / 倍数显示
 *   - 底部：我的信息
 *   - 胜利/失败覆盖层
 *   - Toast 通知
 *
 * 这些都是 React 元素，叠在 PixiJS canvas 之上。
 * canvas 负责卡牌视觉，HUD 负责文字和按钮。
 */
function LandlordHUD({
  s, selectedIds, isMyTurn, isBidding, isPlaying,
  opponentIndices, canPassNow, toast,
  playerNames = {}, onPlay, onPass, onBid,
}: HUDProps) {
  const nameOf = (i: number) => nameFor(s, playerNames, i)
  const getRoleTag = (playerIdx: number) => {
    if (s.currentPhase === 'bidding') return null
    if (s.gameInfo.landlord === playerIdx) return '地主'
    return '农民'
  }

  return (
    <div className="landlord-hud">
      {/* 顶部：对手信息 */}
      <div className="landlord-hud-top">
        <div className="landlord-hud-opp">
          <span className={`turn-dot ${s.currentTurn === opponentIndices[0] ? 'active' : ''}`} />
          <span className="landlord-opponent-name">{nameOf(opponentIndices[0])}</span>
          {getRoleTag(opponentIndices[0]) && (
            <span className={`landlord-role-tag ${opponentIndices[0] === s.gameInfo.landlord ? 'landlord' : 'farmer'}`}>
              {getRoleTag(opponentIndices[0])}
            </span>
          )}
          <span className="landlord-hand-count">{s.otherHandCounts[0]}张</span>
        </div>

        {s.bottomCards.length > 0 && (
          <div className="landlord-hud-bottom-label">底牌</div>
        )}

        <div className="landlord-hud-opp">
          <span className={`turn-dot ${s.currentTurn === opponentIndices[1] ? 'active' : ''}`} />
          <span className="landlord-opponent-name">{nameOf(opponentIndices[1])}</span>
          {getRoleTag(opponentIndices[1]) && (
            <span className={`landlord-role-tag ${opponentIndices[1] === s.gameInfo.landlord ? 'landlord' : 'farmer'}`}>
              {getRoleTag(opponentIndices[1])}
            </span>
          )}
          <span className="landlord-hand-count">{s.otherHandCounts[1]}张</span>
        </div>
      </div>

      {/* 中央：叫分/出牌按钮 */}
      <div className="landlord-hud-center">
        {s.gameInfo.multiplier > 1 && (
          <div className="landlord-multiplier">{s.gameInfo.multiplier}倍</div>
        )}

        {isBidding && s.biddingInfo.myTurnToBid && (
          <div className="landlord-bidding">
            <div className="landlord-bidding-info">
              {s.biddingInfo.round === 2 ? '底牌已亮出（明叫）' : '盲叫阶段'}
              {' · '}
              当前最高: {s.biddingInfo.highestBid > 0 ? `${s.biddingInfo.highestBid}分` : '无人叫分'}
            </div>
            <div className="landlord-bid-buttons">
              <button className="landlord-bid-btn pass" onClick={() => onBid(0)}>不叫</button>
              {[1, 2, 3].map(score => (
                <button
                  key={score}
                  className={`landlord-bid-btn score ${score <= s.biddingInfo.highestBid ? 'disabled' : ''}`}
                  onClick={() => score > s.biddingInfo.highestBid && onBid(score)}
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
              等待{nameOf(s.currentTurn)}叫分
              {s.biddingInfo.highestBid > 0 ? `（最高 ${s.biddingInfo.highestBid}分）` : ''}
            </div>
          </div>
        )}

        {isPlaying && isMyTurn && (
          <div className="landlord-actions">
            <button className="landlord-action-btn play" onClick={onPlay} disabled={selectedIds.size === 0}>
              出牌
            </button>
            <button className="landlord-action-btn pass" onClick={onPass} disabled={!canPassNow}>
              不出
            </button>
          </div>
        )}

        {isPlaying && !isMyTurn && (
          <div className="landlord-turn-hint waiting">等待{nameOf(s.currentTurn)}出牌...</div>
        )}
      </div>

      {/* 底部：我的信息 */}
      <div className="landlord-hud-bottom">
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

      {/* 胜利/失败覆盖层 */}
      {s.winner && (
        <div className="landlord-game-over">
          <h2>{s.winner === s.myRole ? '你赢了！' : '你输了'}</h2>
          <p>
            {s.winner === 'landlord' ? '地主' : '农民'}获胜
            {s.gameInfo.multiplier > 1 && ` (${s.gameInfo.multiplier}倍)`}
          </p>
        </div>
      )}

      {/* Toast 通知 */}
      {toast && <div className="landlord-toast">{toast}</div>}
    </div>
  )
}

// ─── CSS 兜底渲染（旧方案） ─────────────────────────────────────────────────

interface CSSProps {
  s: LandlordClientState
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  isMyTurn: boolean
  isBidding: boolean
  isPlaying: boolean
  opponentIndices: number[]
  canPassNow: boolean
  toast: string | null
  setToast: React.Dispatch<React.SetStateAction<string | null>>
  doAction: (event: string, payload: any) => void
  playerNames?: Record<string, string>
  onPlay: () => void
  onPass: () => void
  onBid: (score: number) => void
}

/**
 * CSS 兜底渲染路径。
 * 当 PixiJS/WebGL 不可用时使用，用纯 CSS + HTML 渲染卡牌。
 * 功能与 canvas 路径完全相同，只是渲染方式不同。
 */
function LandlordGameCSS({
  s, selectedIds, setSelectedIds,
  isMyTurn, isBidding, isPlaying,
  opponentIndices, canPassNow,
  toast, setToast, doAction,
  playerNames = {}, onPlay, onPass, onBid,
}: CSSProps) {
  const nameOf = (i: number) => nameFor(s, playerNames, i)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const toggleCard = useCallback((card: Card) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(card.id)) next.delete(card.id)
      else next.add(card.id)
      return next
    })
  }, [setSelectedIds])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isPlaying || !isMyTurn) return
    const target = e.target as HTMLElement
    if (target.closest('.card-shell')) return
    setDragStart({ x: e.clientX, y: e.clientY })
    setDragEnd({ x: e.clientX, y: e.clientY })
  }, [isPlaying, isMyTurn])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragStart) setDragEnd({ x: e.clientX, y: e.clientY })
  }, [dragStart])

  const handleMouseUp = useCallback(() => {
    if (!dragStart || !dragEnd) {
      setDragStart(null)
      setDragEnd(null)
      return
    }
    const left = Math.min(dragStart.x, dragEnd.x)
    const right = Math.max(dragStart.x, dragEnd.x)
    const top = Math.min(dragStart.y, dragEnd.y)
    const bottom = Math.max(dragStart.y, dragEnd.y)
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
  }, [dragStart, dragEnd, selectedIds, setSelectedIds])

  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  const getRoleTag = (playerIdx: number) => {
    if (s.currentPhase === 'bidding') return null
    if (s.gameInfo.landlord === playerIdx) return '地主'
    return '农民'
  }

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
      {selectionBox && (
        <div className="landlord-drag-box" style={{
          position: 'fixed',
          left: selectionBox.left,
          top: selectionBox.top,
          width: selectionBox.width,
          height: selectionBox.height,
        }} />
      )}

      <div className="landlord-top-area">
        <div className="landlord-opponent">
          <div className="landlord-opponent-info">
            <span className={`turn-dot ${s.currentTurn === opponentIndices[0] ? 'active' : ''}`} />
            <span className="landlord-opponent-name">{nameOf(opponentIndices[0])}</span>
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

        <div className="landlord-opponent">
          <div className="landlord-opponent-info">
            <span className={`turn-dot ${s.currentTurn === opponentIndices[1] ? 'active' : ''}`} />
            <span className="landlord-opponent-name">{nameOf(opponentIndices[1])}</span>
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

      <div className="landlord-center">
        {s.gameInfo.multiplier > 1 && (
          <div className="landlord-multiplier">{s.gameInfo.multiplier}倍</div>
        )}
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

        {isBidding && s.biddingInfo.myTurnToBid && (
          <div className="landlord-bidding">
            <div className="landlord-bidding-info">
              {s.biddingInfo.round === 2 ? '底牌已亮出（明叫）' : '盲叫阶段'}
              {' · '}
              当前最高: {s.biddingInfo.highestBid > 0 ? `${s.biddingInfo.highestBid}分` : '无人叫分'}
            </div>
            <div className="landlord-bid-buttons">
              <button className="landlord-bid-btn pass" onClick={() => onBid(0)}>不叫</button>
              {[1, 2, 3].map(score => (
                <button
                  key={score}
                  className={`landlord-bid-btn score ${score <= s.biddingInfo.highestBid ? 'disabled' : ''}`}
                  onClick={() => score > s.biddingInfo.highestBid && onBid(score)}
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
              等待{nameOf(s.currentTurn)}叫分
              {s.biddingInfo.highestBid > 0 ? `（最高 ${s.biddingInfo.highestBid}分）` : ''}
            </div>
          </div>
        )}

        {isPlaying && isMyTurn && (
          <div className="landlord-actions">
            <button className="landlord-action-btn play" onClick={onPlay} disabled={selectedIds.size === 0}>出牌</button>
            <button className="landlord-action-btn pass" onClick={onPass} disabled={!canPassNow}>不出</button>
          </div>
        )}

        {isPlaying && !isMyTurn && (
          <div className="landlord-turn-hint waiting">等待{nameOf(s.currentTurn)}出牌...</div>
        )}
      </div>

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

      {s.winner && (
        <div className="landlord-game-over">
          <h2>{s.winner === s.myRole ? '你赢了！' : '你输了'}</h2>
          <p>
            {s.winner === 'landlord' ? '地主' : '农民'}获胜
            {s.gameInfo.multiplier > 1 && ` (${s.gameInfo.multiplier}倍)`}
          </p>
        </div>
      )}

      {toast && <div className="landlord-toast">{toast}</div>}
    </div>
  )
}

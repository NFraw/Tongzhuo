import type { GameServerPlugin, GameState, EventResult } from '@huiming/core-shared'
import { createLandlordGame } from './engine'
import { isValidBid, isValidPlay, canPass } from './rules'
import { getHandType } from './hand'
import type { LandlordState, LandlordClientState } from './types'

const LANDLORD_DECK_CONFIG = {
  suits: ['hearts', 'diamonds', 'clubs', 'spades'],
  ranks: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
  jokers: 2,
}

function getClientState(state: LandlordState, playerId: string): LandlordClientState {
  const myIdx = state.players.findIndex(p => p.id === playerId)
  const me = state.players[myIdx]
  const otherIndices = [0, 1, 2].filter(i => i !== myIdx)
  const otherHandCounts: [number, number] = [
    state.players[otherIndices[0]].hand.length,
    state.players[otherIndices[1]].hand.length,
  ]

  // Determine last bid for display
  const lastBid = state.bidding.highestBid > 0 ? state.bidding.highestBid : null

  // Bottom card visibility:
  // - Bidding round 1 (blind): nobody sees
  // - Bidding round 2 (open): everyone sees
  // - Playing, landlord decided in round 1 (暗地主): only landlord sees
  // - Playing, landlord decided in round 2 (明地主): everyone sees
  let showBottom = false
  if (state.currentPhase === 'bidding') {
    showBottom = state.bidding.round >= 2
  } else if (state.currentPhase === 'playing') {
    showBottom = state.bidding.landlordDecidedInRound >= 2 || me.role === 'landlord'
  } else {
    showBottom = true // ended
  }

  return {
    myPlayerIndex: myIdx,
    playerIds: state.players.map(p => p.id),
    myHand: me.hand,
    otherHandCounts,
    bottomCards: showBottom ? state.bottomCards : [],
    currentPhase: state.currentPhase,
    currentTurn: state.currentTurn,
    biddingInfo: {
      highestBid: state.bidding.highestBid,
      highestBidder: state.bidding.highestBidder,
      myTurnToBid: state.currentPhase === 'bidding' && state.bidding.currentBidder === myIdx,
      lastBid,
      bottomRevealed: state.bidding.bottomRevealed,
      round: state.bidding.round,
    },
    gameInfo: {
      landlord: state.game.landlord,
      lastPlay: state.game.lastPlay,
      lastPlayer: state.game.lastPlayer,
      passCount: state.game.passCount,
      passEvent: state.game.passEvent,
      multiplier: state.game.multiplier,
      baseScore: state.game.baseScore,
    },
    myRole: me.role,
    winner: state.winner,
  }
}

export const landlordServerPlugin: GameServerPlugin = {
  id: 'landlord',
  name: '欢乐斗地主',
  description: '经典三人扑克牌游戏',
  minPlayers: 3,
  maxPlayers: 3,
  deckConfig: LANDLORD_DECK_CONFIG,

  createInitialState(players: string[]): GameState {
    return createLandlordGame(players)
  },

  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult {
    const game = state as LandlordState
    const broadcast: { event: string; data: any }[] = []

    switch (event) {
      case 'bid': {
        if (game.currentPhase !== 'bidding') return { state, broadcast, error: '当前不是叫分阶段' }
        const { score } = payload
        if (!isValidBid(game, playerId, score)) return { state, broadcast, error: '无效的叫分' }

        const bidderIdx = game.bidding.currentBidder
        game.bidding.turnsTaken++

        if (score === 0) {
          game.bidding.passCount++
        } else {
          game.bidding.highestBid = score
          game.bidding.highestBidder = bidderIdx
          game.bidding.passCount = 0
          if (score === 3) {
            assignLandlord(game, bidderIdx)
            break
          }
        }

        // Check if a full round is complete
        if (game.bidding.turnsTaken >= 3) {
          if (game.bidding.highestBidder >= 0) {
            assignLandlord(game, game.bidding.highestBidder)
          } else if (game.bidding.round === 1) {
            // Round 1 nobody bid → reveal bottom cards, start round 2
            game.bidding.bottomRevealed = true
            game.bidding.round = 2
            game.bidding.turnsTaken = 0
            game.bidding.passCount = 0
            game.bidding.currentBidder = game.bidding.startBidder
            game.currentTurn = game.bidding.startBidder
          } else {
            // Round 2 still nobody bid → re-deal
            const newGame = createLandlordGame(game.players.map(p => p.id))
            Object.assign(game, newGame)
          }
          break
        }

        // Advance to next bidder
        game.bidding.currentBidder = (game.bidding.currentBidder + 1) % 3
        game.currentTurn = game.bidding.currentBidder
        break
      }

      case 'play': {
        if (game.currentPhase !== 'playing') return { state, broadcast, error: '当前不是出牌阶段' }
        const playerIdx = game.players.findIndex(p => p.id === playerId)
        if (playerIdx === -1 || playerIdx !== game.currentTurn) return { state, broadcast, error: '不是你的回合' }

        const { cards } = payload
        if (!isValidPlay(game, playerId, cards)) return { state, broadcast, error: '无效的出牌' }

        // Use real cards from server hand (anti-cheat)
        const hand = game.players[playerIdx].hand
        const handMap = new Map(hand.map(c => [c.id, c]))
        const playIds = new Set(cards.map((c: any) => c.id))
        const realCards = hand.filter(c => playIds.has(c.id))
        game.players[playerIdx].hand = hand.filter(c => !playIds.has(c.id))

        // Record play with real card data
        const handType = getHandType(realCards)!
        game.game.lastPlay = { cards: realCards, type: handType.type, mainRank: handType.mainRank }
        game.game.lastPlayer = playerIdx
        game.game.passCount = 0

        // Check for bomb/rocket multiplier
        if (handType.type === 'bomb' || handType.type === 'rocket') {
          game.game.multiplier *= 2
        }

        // Check if player has won (empty hand)
        if (game.players[playerIdx].hand.length === 0) {
          game.currentPhase = 'ended'
          // Use team role as winner identifier: 'landlord' or 'farmer'
          // Both farmers win together (team victory)
          game.winner = playerIdx === game.game.landlord ? 'landlord' : 'farmer'
          break
        }

        // Advance turn
        game.currentTurn = (game.currentTurn + 1) % 3
        break
      }

      case 'pass': {
        if (game.currentPhase !== 'playing') return { state, broadcast, error: '当前不是出牌阶段' }
        if (!canPass(game, playerId)) return { state, broadcast, error: '当前必须出牌' }

        game.game.passCount++
        game.game.passEvent++
        game.currentTurn = (game.currentTurn + 1) % 3

        // If 2 players passed consecutively, the last player gets free play
        if (game.game.passCount >= 2) {
          game.game.lastPlay = null
          game.game.passCount = 0
          // currentTurn is already at the last player who played
        }
        break
      }

      default:
        return { state, broadcast, error: '未知事件' }
    }

    return { state, broadcast }
  },

  getClientState,
  checkGameEnd(state: GameState): string | null {
    return (state as LandlordState).winner
  },
}

function assignLandlord(game: LandlordState, landlordIdx: number): void {
  game.game.landlord = landlordIdx
  game.game.baseScore = game.bidding.highestBid
  game.bidding.landlordDecidedInRound = game.bidding.round
  game.players[landlordIdx].role = 'landlord'
  for (let i = 0; i < 3; i++) {
    if (i !== landlordIdx) game.players[i].role = 'farmer'
  }
  // Give bottom cards to landlord
  game.players[landlordIdx].hand.push(...game.bottomCards)
  // Sort landlord's hand
  game.players[landlordIdx].hand.sort((a, b) => {
    const ra = a.suit === 'joker_red' ? 17 : a.suit === 'joker_black' ? 16 : a.rank === 'A' ? 14 : a.rank === '2' ? 15 : a.value
    const rb = b.suit === 'joker_red' ? 17 : b.suit === 'joker_black' ? 16 : b.rank === 'A' ? 14 : b.rank === '2' ? 15 : b.value
    return ra - rb
  })
  // Switch to playing phase, landlord goes first
  game.currentPhase = 'playing'
  game.currentTurn = landlordIdx
}

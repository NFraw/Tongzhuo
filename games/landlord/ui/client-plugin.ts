import type { GameClientPlugin } from '@huiming/core-shared'
import { LandlordGame } from './LandlordGame'

export const landlordClientPlugin: GameClientPlugin = {
  id: 'landlord',
  name: '欢乐斗地主',
  description: '经典三人扑克牌游戏',
  minPlayers: 3,
  maxPlayers: 3,
  deckConfig: {
    suits: ['hearts', 'diamonds', 'clubs', 'spades'],
    ranks: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
    jokers: 2,
  },
  GameComponent: LandlordGame,
}

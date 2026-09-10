// games/huiming/ui/client-plugin.ts
import type { GameClientPlugin } from '@huiming/core-shared'
import { HuimingGame } from './HuimingGame'

export const huimingClientPlugin: GameClientPlugin = {
  id: 'huiming',
  name: '晦明',
  description: '基于25张扑克牌的双人博弈',
  minPlayers: 2,
  maxPlayers: 4,
  deckConfig: {
    suits: ['hearts', 'diamonds', 'clubs', 'spades'],
    ranks: ['1', '2', '3', '4', '5', '6'],
    jokers: 1,
  },
  GameComponent: HuimingGame,
}

// games/nimmt/ui/client-plugin.ts
import type { GameClientPlugin } from '@tongzhuo/core-shared'
import { NimmtGame } from './NimmtGame'

export const nimmtClientPlugin: GameClientPlugin = {
  id: 'nimmt',
  name: '牛头人',
  description: '经典吃牛头卡牌游戏，牛头最少者获胜',
  minPlayers: 2,
  maxPlayers: 6,
  deckConfig: {
    suits: [],
    ranks: [],
    jokers: 0,
  },
  GameComponent: NimmtGame,
}

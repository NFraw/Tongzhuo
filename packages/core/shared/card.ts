// packages/core/shared/card.ts
export type StandardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type ExtendedSuit = 'joker_red' | 'joker_black'
export type Suit = StandardSuit | ExtendedSuit | string

export type StandardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  id: string
  suit: Suit
  rank: StandardRank | string
  value: number
  deckIndex: number
}

export interface DeckConfig {
  suits: Suit[]
  ranks: string[]
  jokers: number
  custom?: Card[]
}

/** Create a deck from config */
export function createDeck(config: DeckConfig): Card[] {
  const deck: Card[] = []
  let index = 0

  for (const suit of config.suits) {
    for (const rank of config.ranks) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        value: rankToValue(rank),
        deckIndex: index++,
      })
    }
  }

  for (let i = 0; i < config.jokers; i++) {
    deck.push({
      id: `joker-${i}`,
      suit: i === 0 ? 'joker_red' : 'joker_black',
      rank: 'JOKER',
      value: 0,
      deckIndex: index++,
    })
  }

  if (config.custom) {
    for (const card of config.custom) {
      deck.push({ ...card, deckIndex: index++ })
    }
  }

  return deck
}

/** Shuffle deck (Fisher-Yates) */
export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function rankToValue(rank: string): number {
  const map: Record<string, number> = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
  }
  return map[rank] ?? 0
}

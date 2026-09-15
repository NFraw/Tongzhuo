import { describe, it, expect } from 'vitest'
import type { Card } from '@tongzhuo/core-shared'
import { getHandType, compareHands, canBeat, landlordRank } from '../hand'
import type { PlayedCards } from '../types'

// Helper to create a card quickly
function card(rank: string, suit: string = 'hearts'): Card {
  const valueMap: Record<string, number> = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 1, '2': 2,
  }
  return {
    id: `${suit}-${rank}`,
    suit,
    rank,
    value: valueMap[rank] ?? 0,
    deckIndex: 0,
  }
}

function joker(type: 'red' | 'black'): Card {
  return {
    id: `joker-${type === 'red' ? 0 : 1}`,
    suit: type === 'red' ? 'joker_red' : 'joker_black',
    rank: 'JOKER',
    value: 0,
    deckIndex: type === 'red' ? 52 : 53,
  }
}

function played(type: PlayedCards['type'], mainRank: number, cards: Card[] = []): PlayedCards {
  return { type, mainRank, cards }
}

describe('landlordRank', () => {
  it('maps 3-K by their value', () => {
    expect(landlordRank(card('3'))).toBe(3)
    expect(landlordRank(card('10'))).toBe(10)
    expect(landlordRank(card('K'))).toBe(13)
  })

  it('maps A to 14', () => {
    expect(landlordRank(card('A'))).toBe(14)
  })

  it('maps 2 to 15', () => {
    expect(landlordRank(card('2'))).toBe(15)
  })

  it('maps jokers to 16/17', () => {
    expect(landlordRank(joker('black'))).toBe(16)
    expect(landlordRank(joker('red'))).toBe(17)
  })
})

describe('getHandType - single', () => {
  it('recognizes single card', () => {
    expect(getHandType([card('3')])).toEqual({ type: 'single', mainRank: 3 })
    expect(getHandType([card('A')])).toEqual({ type: 'single', mainRank: 14 })
    expect(getHandType([card('2')])).toEqual({ type: 'single', mainRank: 15 })
    expect(getHandType([joker('red')])).toEqual({ type: 'single', mainRank: 17 })
  })
})

describe('getHandType - pair', () => {
  it('recognizes pair', () => {
    expect(getHandType([card('5', 'hearts'), card('5', 'clubs')])).toEqual({ type: 'pair', mainRank: 5 })
  })
})

describe('getHandType - triple', () => {
  it('recognizes triple', () => {
    expect(getHandType([card('7', 'hearts'), card('7', 'clubs'), card('7', 'spades')])).toEqual({ type: 'triple', mainRank: 7 })
  })
})

describe('getHandType - bomb', () => {
  it('recognizes bomb', () => {
    expect(getHandType([card('9', 'hearts'), card('9', 'clubs'), card('9', 'spades'), card('9', 'diamonds')])).toEqual({ type: 'bomb', mainRank: 9 })
  })
})

describe('getHandType - rocket', () => {
  it('recognizes rocket (joker bomb)', () => {
    expect(getHandType([joker('red'), joker('black')])).toEqual({ type: 'rocket', mainRank: 17 })
  })
})

describe('getHandType - triple_one', () => {
  it('recognizes triple with one kicker', () => {
    const cards = [card('8', 'hearts'), card('8', 'clubs'), card('8', 'spades'), card('3')]
    expect(getHandType(cards)).toEqual({ type: 'triple_one', mainRank: 8 })
  })
})

describe('getHandType - triple_two', () => {
  it('recognizes triple with pair kicker', () => {
    const cards = [card('J', 'hearts'), card('J', 'clubs'), card('J', 'spades'), card('4', 'hearts'), card('4', 'clubs')]
    expect(getHandType(cards)).toEqual({ type: 'triple_two', mainRank: 11 })
  })
})

describe('getHandType - straight', () => {
  it('recognizes 5-card straight', () => {
    const cards = [card('3'), card('4'), card('5'), card('6'), card('7')]
    expect(getHandType(cards)).toEqual({ type: 'straight', mainRank: 7 })
  })

  it('recognizes long straight (3 to A)', () => {
    const cards = [card('3'), card('4'), card('5'), card('6'), card('7'), card('8'), card('9'), card('10'), card('J'), card('Q'), card('K'), card('A')]
    expect(getHandType(cards)).toEqual({ type: 'straight', mainRank: 14 })
  })

  it('rejects straight with 2', () => {
    const cards = [card('10'), card('J'), card('Q'), card('K'), card('A'), card('2')]
    expect(getHandType(cards)).toBeNull()
  })

  it('rejects straight with joker', () => {
    const cards = [card('10'), card('J'), card('Q'), card('K'), card('A'), joker('red')]
    expect(getHandType(cards)).toBeNull()
  })

  it('rejects 4-card sequence', () => {
    const cards = [card('3'), card('4'), card('5'), card('6')]
    expect(getHandType(cards)).toBeNull()
  })
})

describe('getHandType - double_straight', () => {
  it('recognizes 3-pair double straight', () => {
    const cards = [card('3', 'hearts'), card('3', 'clubs'), card('4', 'hearts'), card('4', 'clubs'), card('5', 'hearts'), card('5', 'clubs')]
    expect(getHandType(cards)).toEqual({ type: 'double_straight', mainRank: 5 })
  })

  it('rejects 2-pair sequence', () => {
    const cards = [card('3', 'hearts'), card('3', 'clubs'), card('4', 'hearts'), card('4', 'clubs')]
    expect(getHandType(cards)).toBeNull()
  })
})

describe('getHandType - plane', () => {
  it('recognizes 2-triple plane', () => {
    const cards = [card('5', 'hearts'), card('5', 'clubs'), card('5', 'spades'), card('6', 'hearts'), card('6', 'clubs'), card('6', 'spades')]
    expect(getHandType(cards)).toEqual({ type: 'plane', mainRank: 6 })
  })
})

describe('getHandType - plane_single', () => {
  it('recognizes plane with single kickers', () => {
    const cards = [
      card('5', 'hearts'), card('5', 'clubs'), card('5', 'spades'),
      card('6', 'hearts'), card('6', 'clubs'), card('6', 'spades'),
      card('3'), card('4'),
    ]
    expect(getHandType(cards)).toEqual({ type: 'plane_single', mainRank: 6 })
  })
})

describe('getHandType - plane_pair', () => {
  it('recognizes plane with pair kickers', () => {
    const cards = [
      card('5', 'hearts'), card('5', 'clubs'), card('5', 'spades'),
      card('6', 'hearts'), card('6', 'clubs'), card('6', 'spades'),
      card('3', 'hearts'), card('3', 'clubs'),
      card('4', 'hearts'), card('4', 'clubs'),
    ]
    expect(getHandType(cards)).toEqual({ type: 'plane_pair', mainRank: 6 })
  })
})

describe('getHandType - four_two', () => {
  it('recognizes four with two single kickers', () => {
    const cards = [card('8', 'hearts'), card('8', 'clubs'), card('8', 'spades'), card('8', 'diamonds'), card('3'), card('5')]
    expect(getHandType(cards)).toEqual({ type: 'four_two', mainRank: 8 })
  })
})

describe('getHandType - four_two_pair', () => {
  it('recognizes four with two pair kickers', () => {
    const cards = [
      card('Q', 'hearts'), card('Q', 'clubs'), card('Q', 'spades'), card('Q', 'diamonds'),
      card('3', 'hearts'), card('3', 'clubs'),
      card('5', 'hearts'), card('5', 'clubs'),
    ]
    expect(getHandType(cards)).toEqual({ type: 'four_two_pair', mainRank: 12 })
  })
})

describe('getHandType - invalid', () => {
  it('returns null for empty hand', () => {
    expect(getHandType([])).toBeNull()
  })

  it('returns null for mixed invalid combo', () => {
    const cards = [card('3'), card('5'), card('7')]
    expect(getHandType(cards)).toBeNull()
  })

  it('returns null for 2+2+2 (non-consecutive pairs)', () => {
    const cards = [card('3', 'hearts'), card('3', 'clubs'), card('5', 'hearts'), card('5', 'clubs'), card('8', 'hearts'), card('8', 'clubs')]
    expect(getHandType(cards)).toBeNull()
  })
})

describe('compareHands', () => {
  it('rocket beats everything', () => {
    const rocket = played('rocket', 17)
    const bomb = played('bomb', 14)
    expect(compareHands(rocket, bomb)).toBeGreaterThan(0)
    expect(compareHands(bomb, rocket)).toBeLessThan(0)
  })

  it('bomb beats non-bomb', () => {
    const bomb = played('bomb', 8)
    const straight = played('straight', 14)
    expect(compareHands(bomb, straight)).toBeGreaterThan(0)
    expect(compareHands(straight, bomb)).toBeLessThan(0)
  })

  it('same type compares mainRank', () => {
    const a = played('single', 10)
    const b = played('single', 8)
    expect(compareHands(a, b)).toBeGreaterThan(0)
    expect(compareHands(b, a)).toBeLessThan(0)
  })

  it('same type same rank is equal', () => {
    const a = played('pair', 7)
    const b = played('pair', 7)
    expect(compareHands(a, b)).toBe(0)
  })

  it('different non-bomb types return 0', () => {
    const a = played('single', 14)
    const b = played('pair', 5)
    expect(compareHands(a, b)).toBe(0)
  })
})

describe('canBeat', () => {
  it('anything can beat null (free play)', () => {
    expect(canBeat(played('single', 3), null)).toBe(true)
  })

  it('higher single beats lower', () => {
    expect(canBeat(played('single', 10), played('single', 8))).toBe(true)
    expect(canBeat(played('single', 5), played('single', 8))).toBe(false)
  })

  it('same rank single cannot beat', () => {
    expect(canBeat(played('single', 8), played('single', 8))).toBe(false)
  })

  it('bomb beats non-bomb', () => {
    expect(canBeat(played('bomb', 3), played('straight', 14))).toBe(true)
  })

  it('rocket beats bomb', () => {
    expect(canBeat(played('rocket', 17), played('bomb', 14))).toBe(true)
  })

  it('cannot beat with different type (non-bomb)', () => {
    expect(canBeat(played('pair', 10), played('single', 5))).toBe(false)
  })

  it('higher bomb beats lower bomb', () => {
    expect(canBeat(played('bomb', 10), played('bomb', 8))).toBe(true)
    expect(canBeat(played('bomb', 5), played('bomb', 8))).toBe(false)
  })

  it('straight comparison', () => {
    expect(canBeat(played('straight', 12), played('straight', 10))).toBe(true)
    expect(canBeat(played('straight', 8), played('straight', 10))).toBe(false)
  })

  it('double_straight comparison', () => {
    expect(canBeat(played('double_straight', 9), played('double_straight', 7))).toBe(true)
  })

  it('triple_one comparison', () => {
    expect(canBeat(played('triple_one', 10), played('triple_one', 8))).toBe(true)
  })
})

// packages/core/server/__tests__/plugin-loader.test.ts
import { describe, it, expect } from 'vitest'
import { PluginLoader } from '../plugin-loader'
import type { GameServerPlugin } from '@huiming/core-shared'

const mockPlugin: GameServerPlugin = {
  id: 'test',
  name: 'Test Game',
  description: 'A test game',
  minPlayers: 2,
  maxPlayers: 2,
  deckConfig: { suits: ['hearts'], ranks: ['A'], jokers: 0 },
  createInitialState: () => ({ board: [] }),
  handleEvent: (state) => ({ state, broadcast: [] }),
  getClientState: (state) => state,
  checkGameEnd: () => null,
}

describe('PluginLoader', () => {
  it('should register and retrieve a plugin', () => {
    const loader = new PluginLoader()
    loader.register(mockPlugin)
    expect(loader.getPlugin('test')).toBe(mockPlugin)
  })

  it('should return null for unknown plugin', () => {
    const loader = new PluginLoader()
    expect(loader.getPlugin('unknown')).toBeNull()
  })

  it('should list all registered plugins', () => {
    const loader = new PluginLoader()
    loader.register(mockPlugin)
    expect(loader.listPlugins()).toEqual(['test'])
  })
})

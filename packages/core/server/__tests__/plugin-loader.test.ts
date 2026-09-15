// packages/core/server/__tests__/plugin-loader.test.ts
import { describe, it, expect } from 'vitest'
import { PluginLoader } from '../plugin-loader'
import type { GameServerPlugin } from '@tongzhuo/core-shared'

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

  it('rejects duplicate plugin ids instead of silently replacing a game', () => {
    const loader = new PluginLoader()
    loader.register(mockPlugin)

    expect(() => loader.register({ ...mockPlugin, name: 'Replacement' }))
      .toThrow('Plugin "test" is already registered')
    expect(loader.getPlugin('test')).toBe(mockPlugin)
  })

  it.each([
    [{ ...mockPlugin, id: '' }, 'id must be a non-empty string'],
    [{ ...mockPlugin, minPlayers: 0 }, 'minPlayers must be a positive integer'],
    [{ ...mockPlugin, maxPlayers: 1 }, 'maxPlayers must be greater than or equal to minPlayers'],
  ] as const)('rejects invalid plugin metadata', (plugin, message) => {
    const loader = new PluginLoader()
    expect(() => loader.register(plugin)).toThrow(message)
  })
})

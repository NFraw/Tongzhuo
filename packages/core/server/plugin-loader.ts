// packages/core/server/plugin-loader.ts
import type { GameServerPlugin } from '@huiming/core-shared'

export class PluginLoader {
  private plugins = new Map<string, GameServerPlugin>()

  register(plugin: GameServerPlugin): void {
    this.validateMetadata(plugin)
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered`)
    }
    this.plugins.set(plugin.id, plugin)
  }

  getPlugin(gameId: string): GameServerPlugin | null {
    return this.plugins.get(gameId) ?? null
  }

  listPlugins(): string[] {
    return [...this.plugins.keys()]
  }

  private validateMetadata(plugin: GameServerPlugin): void {
    if (typeof plugin.id !== 'string' || plugin.id.trim().length === 0) {
      throw new Error('Plugin id must be a non-empty string')
    }
    if (!Number.isInteger(plugin.minPlayers) || plugin.minPlayers < 1) {
      throw new Error('Plugin minPlayers must be a positive integer')
    }
    if (!Number.isInteger(plugin.maxPlayers) || plugin.maxPlayers < plugin.minPlayers) {
      throw new Error('Plugin maxPlayers must be greater than or equal to minPlayers')
    }
  }
}

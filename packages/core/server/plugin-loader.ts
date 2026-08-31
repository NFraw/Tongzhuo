// packages/core/server/plugin-loader.ts
import type { GameServerPlugin } from '@huiming/core-shared'

export class PluginLoader {
  private plugins = new Map<string, GameServerPlugin>()

  register(plugin: GameServerPlugin): void {
    this.plugins.set(plugin.id, plugin)
  }

  getPlugin(gameId: string): GameServerPlugin | null {
    return this.plugins.get(gameId) ?? null
  }

  listPlugins(): string[] {
    return [...this.plugins.keys()]
  }
}

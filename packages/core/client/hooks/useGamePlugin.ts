import type { GameClientPlugin } from '@huiming/core-shared'

const plugins = new Map<string, GameClientPlugin>()

export function registerClientPlugin(plugin: GameClientPlugin) {
  plugins.set(plugin.id, plugin)
}

export function useGamePlugin(gameId: string): GameClientPlugin | null {
  return plugins.get(gameId) ?? null
}

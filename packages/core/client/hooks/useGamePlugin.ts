import { useState, useEffect } from 'react'
import type { GameClientPlugin } from '@huiming/core-shared'

const plugins = new Map<string, GameClientPlugin>()
const pluginLoaders = new Map<string, () => Promise<GameClientPlugin>>()
const loadingPromises = new Map<string, Promise<GameClientPlugin>>()

export function registerClientPlugin(plugin: GameClientPlugin) {
  plugins.set(plugin.id, plugin)
}

export function registerClientPluginLoader(gameId: string, loader: () => Promise<GameClientPlugin>) {
  pluginLoaders.set(gameId, loader)
}

export function useGamePlugin(gameId: string): GameClientPlugin | null {
  const [plugin, setPlugin] = useState<GameClientPlugin | null>(plugins.get(gameId) ?? null)

  useEffect(() => {
    if (plugins.has(gameId)) {
      setPlugin(plugins.get(gameId)!)
      return
    }

    const loader = pluginLoaders.get(gameId)
    if (!loader) {
      console.error(`No plugin loader registered for game: ${gameId}`)
      return
    }

    // Deduplicate loading requests
    let loadingPromise = loadingPromises.get(gameId)
    if (!loadingPromise) {
      loadingPromise = loader().then(plugin => {
        plugins.set(gameId, plugin)
        loadingPromises.delete(gameId)
        return plugin
      })
      loadingPromises.set(gameId, loadingPromise)
    }

    loadingPromise.then(setPlugin)
  }, [gameId])

  return plugin
}

/**
 * createLandlordRenderer — factory function for the Landlord PixiJS renderer.
 *
 * This is the entry point registered in the game's client-plugin.
 * It receives a container element, callback context, and the PIXI.Application
 * already created by GameCanvas. Returns the sync/destroy interface.
 */
import type { Application } from 'pixi.js'
import type { GameRendererFactory, RendererFactoryContext } from '@huiming/core-shared'
import { LandlordRenderer } from './LandlordRenderer'

export const createLandlordRenderer: GameRendererFactory = async (
  container: HTMLElement,
  ctx: RendererFactoryContext,
  app?: any,  // PIXI.Application passed from GameCanvas
) => {
  if (!app) return null

  const renderer = new LandlordRenderer(app as Application, {
    onSelectionChange: ctx.onSelectionChange,
  })

  return {
    sync: (state: unknown, selectedIds?: Set<string>) => {
      renderer.sync(state, selectedIds)
    },
    onResize: () => {
      renderer.onResize()
    },
    destroy: () => {
      renderer.destroy()
      // Don't destroy app — GameCanvas owns its lifecycle
    },
  }
}

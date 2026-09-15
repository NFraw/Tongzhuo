/**
 * createLandlordRenderer — 斗地主渲染器工厂函数
 *
 * 这是注册到游戏客户端插件的入口。
 * 接收容器元素、回调上下文和 PIXI.Application，
 * 返回 sync/destroy 接口。
 *
 * 类比 Java：相当于一个 Factory Method，创建并返回渲染器实例。
 *
 * 调用处：
 *   - games/landlord/ui/client-plugin.ts → 注册到 renderer 字段
 *   - GameCanvas.tsx → 调用 rendererFactory() 创建渲染器
 */
import type { Application } from 'pixi.js'
import type { GameRendererFactory, RendererFactoryContext } from '@tongzhuo/core-shared'
import { LandlordRenderer } from './LandlordRenderer'

export const createLandlordRenderer: GameRendererFactory = async (
  container: HTMLElement,
  ctx: RendererFactoryContext,
  app?: any,  // PIXI.Application，由 GameCanvas 传入
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
      // 不销毁 app — GameCanvas 管理 app 的生命周期
    },
  }
}

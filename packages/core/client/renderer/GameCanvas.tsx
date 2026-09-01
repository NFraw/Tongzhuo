/**
 * GameCanvas — PixiJS canvas 的 React 宿主组件
 *
 * 这是连接 React 和 PixiJS 的桥梁。
 * 类比 Java：相当于一个 CanvasPanel，管理 WebGL canvas 的生命周期。
 *
 * 生命周期：
 *   1. 挂载时：创建 PIXI.Application → 调用 rendererFactory 获取渲染器
 *   2. 状态变化时：转发给 renderer.sync()
 *   3. 窗口缩放时：通知渲染器
 *   4. 卸载时：销毁一切
 *
 * 兜底机制：
 *   - WebGL 不可用 → 调用 onUnavailable()，父组件切换到 CSS 渲染
 *   - WebGL 上下文丢失 → 同上
 *   - localStorage['huiming-renderer']='css' → 硬切 CSS
 *
 * 【如果你想修改 canvas 行为】：
 *   - app.init() 参数：背景色、抗锯齿、分辨率上限
 *   - ResizeObserver：监听容器尺寸变化
 *   - FPS 计数器：仅开发模式显示
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Application, isWebGLSupported } from 'pixi.js'
import type { GameRendererFactory, RendererFactoryContext } from '@huiming/core-shared'

// 开发环境检测（Vite、Webpack、Node 都兼容）
const isDev = typeof process !== 'undefined'
  ? process.env.NODE_ENV !== 'production'
  : false

interface GameCanvasProps {
  /** 渲染器工厂函数（由游戏插件提供，如 createLandlordRenderer） */
  rendererFactory: GameRendererFactory
  /** 游戏状态（从服务器同步的 LandlordClientState 等） */
  state: unknown
  /** 选中的卡牌 ID 集合（可选，用于斗地主选牌） */
  selectedIds?: Set<string>
  /** 发送游戏动作的回调（如出牌、叫分） */
  onAction: (event: string, payload: any) => void
  /** 选牌变化回调（渲染器内部点击卡牌时触发） */
  onSelectionChange?: (selectedIds: Set<string>) => void
  /** WebGL 不可用时的兜底回调 */
  onUnavailable: () => void
}

export function GameCanvas({
  rendererFactory,
  state,
  selectedIds,
  onAction,
  onSelectionChange,
  onUnavailable,
}: GameCanvasProps) {
  /** 容器 DOM 引用（PixiJS canvas 会被 append 到这里） */
  const containerRef = useRef<HTMLDivElement>(null)
  /** 渲染器实例引用（由 rendererFactory 创建） */
  const rendererRef = useRef<Awaited<ReturnType<GameRendererFactory>>>(null)
  /** PIXI Application 实例引用 */
  const appRef = useRef<Application>(null)
  /** 渲染器是否已就绪（就绪后才开始同步状态） */
  const [ready, setReady] = useState(false)

  // ─── Debug HUD（仅开发模式） ───
  const fpsRef = useRef<HTMLDivElement>(null)
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 预检 WebGL 支持
    if (!isWebGLSupported()) {
      onUnavailable()
      return
    }

    let destroyed = false  // 防止异步初始化完成后组件已卸载

    ;(async () => {
      try {
        const app = new Application()
        await app.init({
          background: '#141820',      // 深色背景
          antialias: true,             // 抗锯齿
          resolution: Math.min(window.devicePixelRatio || 1, 2),  // DPR 上限 2（避免高 DPI 设备过慢）
          autoDensity: true,           // 自动适配 CSS 像素
          resizeTo: container,         // 自动跟随容器尺寸
          autoStart: false,            // 关闭自动渲染循环，由 BaseGameRenderer 按需渲染
        })
        if (destroyed) { app.destroy(); return }

        appRef.current = app
        container.appendChild(app.canvas as HTMLCanvasElement)

        // FPS 计数器（仅开发模式）
        if (isDev) {
          lastFpsTimeRef.current = performance.now()
          app.ticker.add(() => {
            frameCountRef.current++
            const now = performance.now()
            if (now - lastFpsTimeRef.current >= 1000) {
              const fps = frameCountRef.current
              frameCountRef.current = 0
              lastFpsTimeRef.current = now
              if (fpsRef.current) fpsRef.current.textContent = `${fps} FPS`
            }
          })
        }

        // WebGL 上下文丢失 → 触发兜底
        const canvas = app.canvas as HTMLCanvasElement
        const onContextLost = () => {
          console.warn('[GameCanvas] WebGL context lost')
          onUnavailable()
        }
        canvas.addEventListener('webglcontextlost', onContextLost)

        // 创建渲染器
        const ctx: RendererFactoryContext = {
          onAction,
          onSelectionChange,
        }
        const renderer = await rendererFactory(container, ctx, app)
        if (destroyed || !renderer) {
          canvas.removeEventListener('webglcontextlost', onContextLost)
          app.destroy()
          if (!renderer) onUnavailable()
          return
        }

        rendererRef.current = renderer
        setReady(true)
      } catch (err) {
        console.error('[GameCanvas] init failed:', err)
        onUnavailable()
      }
    })()

    // 清理函数：组件卸载时销毁一切
    return () => {
      destroyed = true
      rendererRef.current?.destroy()
      rendererRef.current = null
      appRef.current?.destroy()
      appRef.current = null
    }
  }, [rendererFactory]) // 仅挂载时执行；rendererFactory 是稳定引用

  // 状态变化时转发给渲染器
  useEffect(() => {
    if (ready && rendererRef.current) {
      rendererRef.current.sync(state, selectedIds)
    }
  }, [state, selectedIds, ready])

  // 容器尺寸变化时通知渲染器
  useEffect(() => {
    if (!ready) return
    const observer = new ResizeObserver(() => {
      rendererRef.current?.onResize?.()
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [ready])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,       // 铺满父容器
        overflow: 'hidden',
      }}
    >
      {/* FPS 计数器（仅开发模式） */}
      {isDev && (
        <div
          ref={fpsRef}
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            zIndex: 9999,
            color: '#0f0',
            font: '12px monospace',
            background: 'rgba(0,0,0,0.6)',
            padding: '2px 6px',
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}

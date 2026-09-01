/**
 * GameCanvas — React host component for a PixiJS canvas.
 *
 * Lifecycle:
 *   1. On mount: create PIXI.Application, call rendererFactory to get a renderer
 *   2. On state change: forward to renderer.sync()
 *   3. On resize: notify renderer
 *   4. On unmount: destroy everything cleanly
 *
 * If WebGL is unavailable or the renderer factory returns null, calls
 * onUnavailable() so the parent can fall back to CSS rendering.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Application, isWebGLSupported } from 'pixi.js'
import type { GameRendererFactory, RendererFactoryContext } from '@huiming/core-shared'

// Portable dev check (works in Vite, Webpack, and plain Node)
const isDev = typeof process !== 'undefined'
  ? process.env.NODE_ENV !== 'production'
  : false

interface GameCanvasProps {
  rendererFactory: GameRendererFactory
  state: unknown
  selectedIds?: Set<string>
  onAction: (event: string, payload: any) => void
  onSelectionChange?: (selectedIds: Set<string>) => void
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
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<Awaited<ReturnType<GameRendererFactory>>>(null)
  const appRef = useRef<Application>(null)
  const [ready, setReady] = useState(false)

  // ---- Debug HUD (dev only) ----
  const fpsRef = useRef<HTMLDivElement>(null)
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Pre-check WebGL support
    if (!isWebGLSupported()) {
      onUnavailable()
      return
    }

    let destroyed = false

    ;(async () => {
      try {
        const app = new Application()
        await app.init({
          background: '#141820',
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          resizeTo: container,
          // 关闭自动渲染循环，由 BaseGameRenderer 在需要时手动渲染
          autoStart: false,
        })
        if (destroyed) { app.destroy(); return }

        appRef.current = app
        container.appendChild(app.canvas as HTMLCanvasElement)

        // FPS counter (dev only)
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

        // WebGL context lost → fallback
        const canvas = app.canvas as HTMLCanvasElement
        const onContextLost = () => {
          console.warn('[GameCanvas] WebGL context lost')
          onUnavailable()
        }
        canvas.addEventListener('webglcontextlost', onContextLost)

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

    return () => {
      destroyed = true
      rendererRef.current?.destroy()
      rendererRef.current = null
      appRef.current?.destroy()
      appRef.current = null
    }
  }, [rendererFactory]) // mount only; rendererFactory is a stable reference

  // Forward state to renderer
  useEffect(() => {
    if (ready && rendererRef.current) {
      rendererRef.current.sync(state, selectedIds)
    }
  }, [state, selectedIds, ready])

  // Resize observer → forward to renderer
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
        inset: 0,
        overflow: 'hidden',
      }}
    >
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

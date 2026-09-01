import { useCallback, useEffect, useState } from 'react'
import { gsap } from 'gsap'

/**
 * 通用 BGM 场景 - 持续循环播放的背景音乐
 * 所有游戏共享这些场景，每个游戏可以选择使用哪些场景
 */
export type BgmScene = 'lobby' | 'playing' | 'exciting' | 'victory' | 'defeat'

/**
 * 音频文件管理
 *
 * BGM 文件位于 /audio/bgm/，命名为 `bgm/huaijiu_<scene>.mp3`
 * 语音 SFX 位于 /audio/voice/，命名为 `voice/<name>.<ext>`
 *
 * 如果文件名包含点号（如 "爆炸.ogg"），直接使用；
 * 否则追加 ".mp3" 以保持向后兼容。
 */
const BASE_AUDIO = 'audio'
const BGM_EXT = '.mp3'

// BGM 文件映射（预加载用）
const BGM_URLS: Record<BgmScene, string> = {
  lobby: `${BASE_AUDIO}/bgm/huaijiu_lobby${BGM_EXT}`,
  playing: `${BASE_AUDIO}/bgm/huaijiu_playing${BGM_EXT}`,
  exciting: `${BASE_AUDIO}/bgm/huaijiu_exciting${BGM_EXT}`,
  victory: `${BASE_AUDIO}/bgm/huaijiu_victory${BGM_EXT}`,
  defeat: `${BASE_AUDIO}/bgm/huaijiu_defeat${BGM_EXT}`,
}

// 旧文件名映射（向后兼容）
const BGM_URLS_COMPAT: Record<string, string> = {
  welcome: `${BASE_AUDIO}/bgm/huaijiu_welcome${BGM_EXT}`,
  normal: `${BASE_AUDIO}/bgm/huaijiu_normal${BGM_EXT}`,
  normal2: `${BASE_AUDIO}/bgm/huaijiu_normal2${BGM_EXT}`,
  win: `${BASE_AUDIO}/bgm/huaijiu_win${BGM_EXT}`,
  lose: `${BASE_AUDIO}/bgm/huaijiu_lose${BGM_EXT}`,
}

// 模块级单例状态
let bgmEl: HTMLAudioElement | null = null
let currentScene: BgmScene | null = null
let storedScene: BgmScene | null = null
let audioContext: AudioContext | null = null
let gestureHandler: (() => void) | null = null
let isUnlocked = false

/**
 * 解析音频文件路径
 */
function resolveUrl(path: string): string {
  return path.startsWith('http') || path.startsWith('file:') ? path : `${BASE_AUDIO}/${path}`
}

/**
 * 获取场景对应的 URL
 */
function getSceneUrl(scene: BgmScene | string): string {
  // 优先使用新场景映射
  if (scene in BGM_URLS) {
    return BGM_URLS[scene as BgmScene]
  }
  // 回退到旧映射
  if (scene in BGM_URLS_COMPAT) {
    return BGM_URLS_COMPAT[scene]
  }
  // 直接作为文件名处理
  return scene.includes('.') ? `bgm/${scene}` : `bgm/huaijiu_${scene}${BGM_EXT}`
}

/**
 * 预加载所有 BGM 文件，避免切换时加载延迟
 */
export function preloadBgmFiles(): void {
  const allUrls = [...Object.values(BGM_URLS), ...Object.values(BGM_URLS_COMPAT)]
  allUrls.forEach(url => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.src = url
  })
}

/**
 * 确保 AudioContext 存在且运行
 */
function ensureContext(): boolean {
  try {
    if (!audioContext) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext)
      audioContext = new Ctx()
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {})
    }
    return audioContext.state === 'running'
  } catch {
    return false
  }
}

/**
 * 设置 BGM 场景，只有场景变化时才切换
 * @param scene - 新场景，null 表示停止
 */
export function setBgmScene(scene: BgmScene | null): void {
  // 场景未变化，跳过
  if (scene === currentScene) return

  // 如果音频未解锁，缓存场景等待解锁
  if (!isUnlocked) {
    storedScene = scene
    return
  }

  // 场景变化，切换 BGM
  currentScene = scene
  playBgm(scene)
}

/**
 * 获取当前 BGM 场景
 */
export function getCurrentScene(): BgmScene | null {
  return currentScene
}

/**
 * 播放一次性音效
 * @param name - 音效文件名，如果包含点号则直接使用，否则追加 .mp3
 */
export function playVoice(name: string): void {
  const file = name.includes('.') ? name : `${name}.mp3`
  try {
    const el = new Audio(resolveUrl(`voice/${file}`))
    el.preload = 'auto'
    el.play().catch(() => {})
  } catch {
    /* ignore */
  }
}

/**
 * 停止当前 BGM 的所有音量淡化动画
 */
function killBgmFades(): void {
  if (bgmEl) gsap.killTweensOf(bgmEl)
}

/**
 * 播放 BGM（内部函数）
 */
function playBgm(scene: BgmScene | null): void {
  if (!scene) {
    // 停止 BGM（带淡出效果）
    killBgmFades()
    if (bgmEl) {
      const el = bgmEl
      gsap.to(el, {
        volume: 0,
        duration: 0.5,
        ease: 'power1.out',
        onComplete: () => {
          el.pause()
          // 只有仍是当前 BGM 时才清空引用
          if (bgmEl === el) bgmEl = null
        },
      })
    }
    currentScene = null
    return
  }

  const url = getSceneUrl(scene)
  if (!url) return

  killBgmFades()

  if (bgmEl) {
    // 切换场景（带淡入）
    const el = bgmEl
    el.src = url
    el.volume = 0
    el.play()
      .then(() => gsap.to(el, { volume: 0.8, duration: 0.4, ease: 'power1.out' }))
      .catch(() => {})
    return
  }

  // 创建新的音频元素
  // getSceneUrl 已返回完整的 audio/bgm/... 路径，直接使用（不再 resolveUrl 二次加前缀）
  const el = new Audio(url)
  el.preload = 'auto'
  el.loop = true
  el.volume = 0
  el.play()
    .then(() => gsap.to(el, { volume: 0.8, duration: 0.4, ease: 'power1.out' }))
    .catch(() => {})
  bgmEl = el
}

/**
 * 手势解锁处理
 */
function unlockAndStart(): void {
  isUnlocked = true
  ensureContext()

  // 如果有缓存的场景，立即播放
  if (storedScene) {
    currentScene = storedScene
    playBgm(storedScene)
    storedScene = null
  }

  // 移除手势监听器
  window.removeEventListener('pointerdown', unlockAndStart)
  window.removeEventListener('keydown', unlockAndStart)
  gestureHandler = null
}

/**
 * 确保手势监听器已注册
 */
function ensureGestureListener(): void {
  if (gestureHandler) return
  gestureHandler = unlockAndStart
  window.addEventListener('pointerdown', unlockAndStart)
  window.addEventListener('keydown', unlockAndStart)
}

/**
 * React Hook for the audio engine.
 *
 * - `playVoice(name)`: one-shot SFX, e.g. `playVoice('不出')`
 * - `setBgmScene(scene)`: set looping BGM scene, only switches on change
 * - `getCurrentScene()`: get current BGM scene
 * - `unlock()`: manually force-start audio
 */
export function useAudio() {
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    preloadBgmFiles()
    ensureGestureListener()
  }, [])

  const unlock = useCallback(() => {
    isUnlocked = true
    setUnlocked(true)
    unlockAndStart()
  }, [])

  return { playVoice, setBgmScene, getCurrentScene, unlock, unlocked }
}

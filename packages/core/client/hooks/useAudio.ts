/**
 * useAudio.ts — 音频引擎（BGM + 语音音效）
 *
 * 管理所有音频播放，包括：
 *   1. BGM（背景音乐）— 循环播放，按场景切换（大厅/对局/紧张/胜利/失败）
 *   2. 语音 SFX — 一次性播放（出牌语音、炸弹音效等）
 *
 * 架构设计：
 *   - BGM 使用单例 HTMLAudioElement，切换场景时带淡入淡出
 *   - 语音使用每次 new Audio()，多个语音可同时播放
 *   - 浏览器要求用户交互后才能播放音频（autoplay policy），所以有手势解锁机制
 *   - GSAP 用于音量淡入淡出动画
 *
 * 类比 C++：相当于一个 AudioManager 单例，管理 BGM 和 SFX 两个子系统。
 *
 * 【如果你想添加新的 BGM 场景】：
 *   1. 在 BgmScene 类型中添加新值
 *   2. 在 BGM_URLS 中添加文件映射
 *   3. 在客户端 public/audio/bgm/ 中放入对应 mp3 文件
 *   4. 在游戏组件中调用 setBgmScene('新场景名')
 *
 * 【如果你想添加新的语音音效】：
 *   1. 在客户端 public/audio/voice/ 中放入音频文件
 *   2. 在游戏组件中调用 playVoice('文件名')
 */
import { useCallback, useEffect, useState } from 'react'
import { gsap } from 'gsap'

/**
 * BGM 场景类型。每个场景对应一个循环播放的背景音乐。
 *
 * - 'lobby'    → 大厅/等待阶段（轻松）
 * - 'playing'  → 对局中（紧张）
 * - 'exciting' → 接近尾声（手牌≤3张时切换，更紧张）
 * - 'victory'  → 胜利
 * - 'defeat'   → 失败
 */
export type BgmScene = 'lobby' | 'playing' | 'exciting' | 'victory' | 'defeat'

const BASE_AUDIO = 'audio'
const BGM_EXT = '.mp3'

/** BGM 场景 → 文件路径映射 */
const BGM_URLS: Record<BgmScene, string> = {
  lobby: `${BASE_AUDIO}/bgm/huaijiu_lobby${BGM_EXT}`,
  playing: `${BASE_AUDIO}/bgm/huaijiu_playing${BGM_EXT}`,
  exciting: `${BASE_AUDIO}/bgm/huaijiu_exciting${BGM_EXT}`,
  victory: `${BASE_AUDIO}/bgm/huaijiu_victory${BGM_EXT}`,
  defeat: `${BASE_AUDIO}/bgm/huaijiu_defeat${BGM_EXT}`,
}

/** 旧文件名映射（向后兼容，新代码应使用 BgmScene） */
const BGM_URLS_COMPAT: Record<string, string> = {
  welcome: `${BASE_AUDIO}/bgm/huaijiu_welcome${BGM_EXT}`,
  normal: `${BASE_AUDIO}/bgm/huaijiu_normal${BGM_EXT}`,
  normal2: `${BASE_AUDIO}/bgm/huaijiu_normal2${BGM_EXT}`,
  win: `${BASE_AUDIO}/bgm/huaijiu_win${BGM_EXT}`,
  lose: `${BASE_AUDIO}/bgm/huaijiu_lose${BGM_EXT}`,
}

/**
 * 模块级单例状态（全局唯一，所有组件共享）。
 *
 * 为什么用模块变量而不是 React state？
 *   因为 BGM 需要在组件卸载/重渲染时保持播放。
 *   React state 会在组件卸载时丢失，而模块变量在 JS 进程存活期间一直存在。
 *
 * 类比 C++：这些就是全局 static 变量。
 */
let bgmEl: HTMLAudioElement | null = null   // BGM 播放器（单例）
let currentScene: BgmScene | null = null    // 当前正在播放的场景
let storedScene: BgmScene | null = null     // 手势解锁前缓存的场景
let audioContext: AudioContext | null = null // Web Audio API 上下文
let gestureHandler: (() => void) | null = null // 手势监听器引用
let isUnlocked = false                       // 是否已通过用户手势解锁音频

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
 * 设置 BGM 场景。只有场景实际变化时才切换（避免重复操作）。
 *
 * 这是游戏组件控制 BGM 的主要接口。
 *
 * @param scene - 新场景名，null 表示停止播放
 *
 * 调用处：
 *   - LandlordGame.tsx → useEffect 中根据游戏状态设置场景
 *   - App.tsx → RoomScreen 播放 'lobby'，EndedScreen 停止（null）
 *
 * 使用示例：
 *   setBgmScene('playing')   // 切换到对局 BGM
 *   setBgmScene(null)         // 停止 BGM
 *   setBgmScene('exciting')  // 切换到紧张 BGM（手牌≤3 张时）
 */
export function setBgmScene(scene: BgmScene | null): void {
  if (scene === currentScene) return  // 场景未变化，跳过

  // 浏览器 autoplay policy：用户交互前无法播放音频
  // 先缓存，等用户点击/按键后自动播放
  if (!isUnlocked) {
    storedScene = scene
    return
  }

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
 * 播放一次性语音/音效。多个音效可同时播放（互不影响）。
 *
 * @param name - 音效文件名。
 *   如果包含点号（如 "special_bomb.ogg"），直接使用；
 *   否则追加 ".mp3"（如 "buyao1" → "buyao1.mp3"）。
 *
 * 文件位置：client/public/audio/voice/
 *
 * 调用处：
 *   - LandlordGame.tsx → 出牌时播放牌型语音，pass 时播放"不要"
 *   - NimmtGame.tsx → 翻牌时播放音效
 *
 * 使用示例：
 *   playVoice('buyao1.ogg')     // 播放"不要"
 *   playVoice('special_bomb')   // 播放炸弹音效（自动加 .mp3）
 */
export function playVoice(name: string): void {
  const file = name.includes('.') ? name : `${name}.mp3`
  try {
    const el = new Audio(resolveUrl(`voice/${file}`))
    el.preload = 'auto'
    el.play().catch(() => {})  // 静默失败（可能用户还没交互）
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

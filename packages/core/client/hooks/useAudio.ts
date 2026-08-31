import { useCallback, useEffect, useRef, useState } from 'react'

export type BgmScene = 'welcome' | 'normal' | 'normal2' | 'exciting' | 'win' | 'lose'

/**
 * Sound files live under /audio/. BGM tracks are named `bgm/huaijiu_<scene>.mp3`,
 * voice SFX are `voice/<name>.mp3`. Audio is fetched lazily, so a missing file
 * simply produces no sound (never an error).
 */
const BASE_AUDIO = 'audio'

// Module-level state so the soundtrack is a singleton across game views.
let bgmEl: HTMLAudioElement | null = null
let currentBgm: BgmScene | null = null
let storedBgm: BgmScene | null = null // BGM requested before user gesture
let audioContext: AudioContext | null = null
let gestureHandler: (() => void) | null = null
let stingEl: HTMLAudioElement | null = null

function ensureContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext)
      audioContext = new Ctx()
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {})
    }
    return audioContext
  } catch {
    return null
  }
}

/** Resolve a public-path url. Works under http(s) and file:// (Vite base: './'). */
function resolveUrl(path: string): string {
  return path.startsWith('http') || path.startsWith('file:') ? path : `${BASE_AUDIO}/${path}`
}

/**
 * Play a one-shot sound effect. Fails silently if the file is missing or audio
 * is blocked. Returns a promise so callers may ignore it.
 */
export function playVoice(name: string): void {
  try {
    const el = new Audio(resolveUrl(`voice/${name}.mp3`))
    el.preload = 'auto'
    el.play().catch(() => { /* missing or autoplay-blocked, ignore */ })
  } catch {
    /* ignore */
  }
}

/**
 * Play a bgm track once (non-looping) as a short sting without breaking the
 * current looping soundtrack. The base loop is paused, the sting plays, then
 * the base loop resumes (unless the scene changed mid-sting). Used for
 * dramatic short cues such as bombs/rockets. Fails (and resumes base) silently.
 */
export function playBgmOnce(scene: BgmScene): void {
  ensureContext()
  if (stingEl) return // only one sting at a time

  const track = `bgm/huaijiu_${scene}.mp3`
  const baseEl = bgmEl
  const baseScene = currentBgm
  if (baseEl) baseEl.pause()

  const el = new Audio(resolveUrl(track))
  el.preload = 'auto'
  el.loop = false
  el.volume = 0.9

  let done = false
  const finish = () => {
    if (done) return
    done = true
    stingEl = null
    // Resume the base loop only if the base element is unchanged.
    if (baseScene && bgmEl === baseEl) {
      startBgm(`bgm/huaijiu_${baseScene}.mp3`, baseScene)
    }
  }
  el.addEventListener('ended', finish)
  el.addEventListener('error', finish)
  stingEl = el
  el.play().catch(finish)
}

/**
 * Switch (or start) the looping background music. `null` stops music.
 * Same-scene calls are no-ops. Different scenes crossfade by replacing the element.
 * Attempts to start immediately (desktop Electron permits autoplay); if the
 * browser blocks it, the scene is remembered and retried on the first user
 * gesture via the gesture listener.
 */
export function playBgm(scene: BgmScene | null): void {
  if (!scene) {
    if (bgmEl) { bgmEl.pause(); bgmEl = null }
    currentBgm = null
    storedBgm = null
    return
  }

  const track = `bgm/huaijiu_${scene}.mp3`
  if (scene === currentBgm) return

  storedBgm = scene
  // Create/resume the context immediately so Electron (autoplay-allowed) starts
  // here and the web retry path on gesture can run as well.
  ensureContext()
  startBgm(track, scene)
}

function startBgm(track: string, scene: BgmScene): void {
  // Replace current track in place (crossfade is implemented by swap).
  if (bgmEl) { bgmEl.pause(); bgmEl = null }
  currentBgm = null // mark as pending until play() resolves
  const el = new Audio(resolveUrl(track))
  el.preload = 'auto'
  el.loop = true
  el.volume = 0.8
  el.play().then(() => {
    currentBgm = scene
  }).catch(() => { /* blocked before gesture, retried via unlock */ })
  bgmEl = el
}

function unlockAndStart(): void {
  ensureContext()
  if (storedBgm) {
    const track = `bgm/huaijiu_${storedBgm}.mp3`
    startBgm(track, storedBgm)
    // Remove the one-shot gesture listener once we've started.
    window.removeEventListener('pointerdown', unlockAndStart)
    window.removeEventListener('keydown', unlockAndStart)
    gestureHandler = null
  }
}

// Attach a one-shot document gesture listener once to auto-unlock audio.
// Browsers require a user gesture before audio can autoplay; by the time a
// player reaches the game table they have certainly interacted, so this fires
// on the first click and starts the requested BGM.
function ensureGestureListener(): void {
  if (gestureHandler) return
  gestureHandler = unlockAndStart
  window.addEventListener('pointerdown', unlockAndStart)
  window.addEventListener('keydown', unlockAndStart)
}

/**
 * React hook for the audio engine.
 *
 * - `bgm`: the scene the calling view wants to hear; the engine loops it and
 *          swaps it automatically. `null` = silence.
 * - `playVoice(name)`: one-shot SFX, e.g. `playVoice('不出')`.
 * - `unlock()`: manually force-start audio (usually unnecessary given the
 *   automatic gesture listener, but useful for programmatic entry).
 */
export function useAudio(bgm: BgmScene | null) {
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    ensureGestureListener()
    playBgm(bgm)
  }, [bgm])

  // Stop background music when the calling view unmounts (e.g. leaving the room).
  useEffect(() => {
    return () => {
      playBgm(null)
    }
  }, [])

  const unlock = useCallback(() => {
    ensureContext()
    setUnlocked(true)
    unlockAndStart()
  }, [])

  return { playVoice, playBgm, unlock, unlocked }
}

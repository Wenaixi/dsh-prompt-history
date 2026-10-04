import { DEFAULT_PREFS, parseLegacyPrefs, type CopyMode, type PluginPrefs } from './prefs-model.ts'

export type { CopyMode, PluginPrefs } from './prefs-model.ts'

const STORAGE_KEY = 'dsh-prompt-history.prefs'
let prefs: PluginPrefs = loadLegacyPrefs()
const listeners = new Set<() => void>()

function loadLegacyPrefs(): PluginPrefs {
  try { return parseLegacyPrefs(localStorage.getItem(STORAGE_KEY)) }
  catch { return { ...DEFAULT_PREFS } }
}

export function getPrefs(): PluginPrefs { return prefs }

export function setPrefs(next: PluginPrefs): void {
  prefs = next
  for (const fn of [...listeners]) {
    try { fn() } catch { /* 单个监听器异常不应阻塞其他监听器。 */ }
  }
}

export function setPref<K extends keyof PluginPrefs>(key: K, value: PluginPrefs[K]): void {
  setPrefs({ ...prefs, [key]: value })
}

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

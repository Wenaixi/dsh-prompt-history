/** 宿主配置与旧版浏览器配置共用的纯设置模型。 */
export type CopyMode = 'toolbar' | 'auto'

export interface PluginPrefs {
  copyMode: CopyMode
  rightClickPaste: boolean
  globalHistory: boolean
  tocVisible: boolean
}

export const DEFAULT_PREFS: PluginPrefs = {
  copyMode: 'toolbar',
  rightClickPaste: true,
  globalHistory: false,
  tocVisible: true,
}

interface LegacyPrefs extends Partial<PluginPrefs> {
  copyOnSelect?: unknown
}

export function parseLegacyPrefs(raw: string | null | undefined): PluginPrefs {
  if (raw === null || raw === undefined) return { ...DEFAULT_PREFS }
  try {
    const parsed = JSON.parse(raw) as LegacyPrefs
    const copyMode = parsed.copyMode === 'auto' || parsed.copyMode === 'toolbar'
      ? parsed.copyMode
      : typeof parsed.copyOnSelect === 'boolean'
        ? parsed.copyOnSelect ? 'auto' : 'toolbar'
        : DEFAULT_PREFS.copyMode
    return {
      copyMode,
      rightClickPaste: typeof parsed.rightClickPaste === 'boolean' ? parsed.rightClickPaste : DEFAULT_PREFS.rightClickPaste,
      globalHistory: typeof parsed.globalHistory === 'boolean' ? parsed.globalHistory : DEFAULT_PREFS.globalHistory,
      tocVisible: typeof parsed.tocVisible === 'boolean' ? parsed.tocVisible : DEFAULT_PREFS.tocVisible,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

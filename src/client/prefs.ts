/**
 * 客户端偏好模型与单一真源 Store（dsh-prompt-history）。
 *
 * 聚合了纯设置规范化/差异比对纯函数，以及连接宿主 ConfigForm 的单一快照 Store。
 * 纯函数保持无 DOM / 无依赖设计，供纯 Node 测试套件高速验证。
 */
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

/** 复制方式：关闭、工具栏按钮、选中即自动复制。 */
export type CopyMode = 'off' | 'toolbar' | 'auto'

/** 一条路径寻址的字段写入操作，形状与宿主 remote.settings 的线格式一致。 */
export type PrefOp =
  | { op: 'set'; path: string[]; value: boolean | number | CopyMode }
  | { op: 'unset'; path: string[] }

/** 插件的用户偏好，字段名与宿主 Config schema 一一对应。 */
export interface PluginPrefs {
  /** 选中文本之后的复制行为；off 表示不做任何自动复制。 */
  copyMode: CopyMode
  /** 输入框上右键是否直接粘贴剪贴板内容。 */
  rightClickPaste: boolean
  /** 上下键历史是否启用；关闭后全部历史行为交还宿主。 */
  historyEnabled: boolean
  /** 双击 Esc 是否启用（非空清空 / 空草稿开列表）；关闭后 Esc 完全交还宿主。 */
  doubleEsc: boolean
  /** 历史环与列表的最大条数。 */
  maxHistoryItems: number
  /** 历史列表行首是否显示相对时间。 */
  relativeTime: boolean
  /** 历史列表过滤是否允许字符子序列模糊匹配。 */
  fuzzyMatch: boolean
  /** 上下键历史是否跨会话保留。 */
  globalHistory: boolean
  /** 以空格开头的提示词不记录入历史（对齐 Bash ignorespace）。 */
  ignoreLeadingSpace: boolean
}

export const DEFAULT_PREFS: PluginPrefs = {
  copyMode: 'toolbar',
  rightClickPaste: true,
  historyEnabled: true,
  doubleEsc: true,
  maxHistoryItems: 100,
  relativeTime: true,
  fuzzyMatch: true,
  globalHistory: false,
  ignoreLeadingSpace: false,
}

/** 历史条数上限的合法区间（对应 schema 的 min/max）。 */
export const MAX_HISTORY_MIN = 10
export const MAX_HISTORY_MAX = 1000

/** 字段写入顺序固定，便于宿主合并与回读时逐字段比对。 */
const FIELDS = [
  'copyMode', 'rightClickPaste', 'historyEnabled', 'doubleEsc',
  'maxHistoryItems', 'relativeTime', 'fuzzyMatch', 'globalHistory',
  'ignoreLeadingSpace',
] as const

/** 旧版浏览器配置里已被 copyMode 取代的字段。 */
interface LegacyPrefs {
  copyOnSelect?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function copyModeOf(value: unknown, legacy?: unknown): CopyMode {
  if (value === 'off' || value === 'auto' || value === 'toolbar') return value
  // 旧字段 copyOnSelect=true 表示选中即复制，false 表示只用工具栏。
  return typeof legacy === 'boolean' ? (legacy ? 'auto' : 'toolbar') : DEFAULT_PREFS.copyMode
}

function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** 非负整数并夹在合法区间；非数或越界回退默认。 */
function intOf(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value < MAX_HISTORY_MIN) return MAX_HISTORY_MIN
  if (value > MAX_HISTORY_MAX) return MAX_HISTORY_MAX
  return Math.floor(value)
}

/**
 * 逐字段规范化：合法值采用，坏字段单独回退默认，不因单个坏字段放弃整份数据。
 */
export function normalizePrefs(raw: unknown): PluginPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_PREFS }
  return {
  return {
    copyMode: copyModeOf(raw.copyMode),
    rightClickPaste: boolOf(raw.rightClickPaste, DEFAULT_PREFS.rightClickPaste),
    historyEnabled: boolOf(raw.historyEnabled, DEFAULT_PREFS.historyEnabled),
    doubleEsc: boolOf(raw.doubleEsc, DEFAULT_PREFS.doubleEsc),
    maxHistoryItems: intOf(raw.maxHistoryItems, DEFAULT_PREFS.maxHistoryItems),
    relativeTime: boolOf(raw.relativeTime, DEFAULT_PREFS.relativeTime),
    fuzzyMatch: boolOf(raw.fuzzyMatch, DEFAULT_PREFS.fuzzyMatch),
    globalHistory: boolOf(raw.globalHistory, DEFAULT_PREFS.globalHistory),
    ignoreLeadingSpace: boolOf(raw.ignoreLeadingSpace, DEFAULT_PREFS.ignoreLeadingSpace),
  }
    rightClickPaste: boolOf(raw.rightClickPaste, DEFAULT_PREFS.rightClickPaste),
    historyEnabled: boolOf(raw.historyEnabled, DEFAULT_PREFS.historyEnabled),
    doubleEsc: boolOf(raw.doubleEsc, DEFAULT_PREFS.doubleEsc),
    maxHistoryItems: intOf(raw.maxHistoryItems, DEFAULT_PREFS.maxHistoryItems),
    relativeTime: boolOf(raw.relativeTime, DEFAULT_PREFS.relativeTime),
    fuzzyMatch: boolOf(raw.fuzzyMatch, DEFAULT_PREFS.fuzzyMatch),
    globalHistory: boolOf(raw.globalHistory, DEFAULT_PREFS.globalHistory),
    ignoreLeadingSpace: boolOf(raw.ignoreLeadingSpace, DEFAULT_PREFS.ignoreLeadingSpace),
  }
}

/** 解析旧 localStorage 载荷（含 copyOnSelect 兼容映射）。 */
export function parseLegacyPrefs(raw: string | null | undefined): PluginPrefs {
  if (raw === null || raw === undefined) return { ...DEFAULT_PREFS }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return { ...DEFAULT_PREFS }
    const legacy = parsed as LegacyPrefs
    return {
      copyMode: copyModeOf(parsed.copyMode, legacy.copyOnSelect),
      rightClickPaste: boolOf(parsed.rightClickPaste, DEFAULT_PREFS.rightClickPaste),
      historyEnabled: boolOf(parsed.historyEnabled, DEFAULT_PREFS.historyEnabled),
      doubleEsc: boolOf(parsed.doubleEsc, DEFAULT_PREFS.doubleEsc),
      maxHistoryItems: intOf(parsed.maxHistoryItems, DEFAULT_PREFS.maxHistoryItems),
      relativeTime: boolOf(parsed.relativeTime, DEFAULT_PREFS.relativeTime),
      fuzzyMatch: boolOf(parsed.fuzzyMatch, DEFAULT_PREFS.fuzzyMatch),
      globalHistory: boolOf(parsed.globalHistory, DEFAULT_PREFS.globalHistory),
      ignoreLeadingSpace: boolOf(parsed.ignoreLeadingSpace, DEFAULT_PREFS.ignoreLeadingSpace),
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

/** 把一份完整偏好拆成逐字段写入操作。 */
export function prefsOps(prefs: PluginPrefs): PrefOp[] {
  return FIELDS.map((field) => ({ op: 'set' as const, path: [field], value: prefs[field] }))
}

/** 两份偏好是否逐字段完全相同。 */
export function prefsEqual(a: PluginPrefs, b: PluginPrefs): boolean {
  return FIELDS.every((field) => a[field] === b[field])
}

/**
 * 草稿与当前值的差异写入操作：只写真正变化的字段，未变的字段不重申。
 */
export function draftDiffOps(draft: PluginPrefs, current: PluginPrefs): PrefOp[] {
  return FIELDS.filter((field) => draft[field] !== current[field])
    .map((field) => ({ op: 'set' as const, path: [field], value: draft[field] }))
}

/**
 * 决定是否执行一次性旧配置迁移。
 */
export function planLegacyMigration(user: unknown, raw: string | null | undefined): PrefOp[] | undefined {
  if (user !== undefined && user !== null && Object.keys(user as object).length > 0) return undefined
  if (raw === null || raw === undefined) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return undefined }
  if (!isRecord(parsed)) return undefined
  return prefsOps(parseLegacyPrefs(raw))
}

// ----------------- 单一真源运行时 Store -----------------

let currentPrefs: PluginPrefs = { ...DEFAULT_PREFS }
const listeners = new Set<() => void>()

function publish(next: PluginPrefs): void {
  currentPrefs = next
  for (const fn of [...listeners]) {
    try { fn() } catch { /* 单个监听器异常不阻断全局 */ }
  }
}

/** 当前偏好快照；宿主表单未就绪时返回默认值。 */
export function getPrefs(): PluginPrefs { return currentPrefs }

/** 订阅偏好变化，返回取消订阅的函数。 */
export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * 把偏好快照接到宿主表单上：读取初始值并订阅其后继快照。
 */
export function bindHostForm(form: ConfigForm<Record<string, unknown>>): () => void {
  const derive = (snapshot: ConfigFormSnapshot<Record<string, unknown>>): PluginPrefs =>
    snapshot.status === 'ready' && snapshot.value !== undefined
      ? normalizePrefs(snapshot.value)
      : { ...DEFAULT_PREFS }
  publish(derive(form.getSnapshot()))
  return form.subscribe(() => publish(derive(form.getSnapshot())))
}
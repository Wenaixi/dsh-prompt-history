/**
 * 宿主配置与旧版浏览器配置共用的纯设置模型。
 *
 * 这里只有纯函数与常量：不含 DOM、不含 cordis 服务，因此可以直接用
 * `node --experimental-strip-types --test` 覆盖规范化与迁移行为。
 */

/** 复制方式：关闭、工具栏按钮、选中即自动复制。 */
export type CopyMode = 'off' | 'toolbar' | 'auto'

/** 一条路径寻址的字段写入操作，形状与宿主 remote.settings 的线格式一致。 */
export type PrefOp =
  | { op: 'set'; path: string[]; value: boolean | CopyMode }
  | { op: 'unset'; path: string[] }

/** 插件的用户偏好，字段名与宿主 Config schema 一一对应。 */
export interface PluginPrefs {
  /** 选中文本之后的复制行为；off 表示不做任何自动复制。 */
  copyMode: CopyMode
  /** 输入框上右键是否直接粘贴剪贴板内容。 */
  rightClickPaste: boolean
  /** 上下键历史是否启用；关闭后 Up/Down 与 Ctrl+R 全部交还宿主。 */
  historyEnabled: boolean
  /** 上下键历史是否跨会话保留。 */
  globalHistory: boolean
  /** 是否显示聊天目录把手。 */
  tocVisible: boolean
}

export const DEFAULT_PREFS: PluginPrefs = {
  copyMode: 'toolbar',
  rightClickPaste: true,
  historyEnabled: true,
  globalHistory: false,
  tocVisible: true,
}

/** 字段写入顺序固定，便于宿主合并与回读时逐字段比对。 */
const FIELDS = ['copyMode', 'rightClickPaste', 'historyEnabled', 'globalHistory', 'tocVisible'] as const

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

/**
 * 逐字段规范化：合法值采用，坏字段单独回退默认，不因单个坏字段放弃整份数据。
 */
export function normalizePrefs(raw: unknown): PluginPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_PREFS }
  return {
    copyMode: copyModeOf(raw.copyMode),
    rightClickPaste: boolOf(raw.rightClickPaste, DEFAULT_PREFS.rightClickPaste),
    historyEnabled: boolOf(raw.historyEnabled, DEFAULT_PREFS.historyEnabled),
    globalHistory: boolOf(raw.globalHistory, DEFAULT_PREFS.globalHistory),
    tocVisible: boolOf(raw.tocVisible, DEFAULT_PREFS.tocVisible),
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
      globalHistory: boolOf(parsed.globalHistory, DEFAULT_PREFS.globalHistory),
      tocVisible: boolOf(parsed.tocVisible, DEFAULT_PREFS.tocVisible),
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

/** 把一份完整偏好拆成逐字段写入操作。 */
export function prefsOps(prefs: PluginPrefs): PrefOp[] {
  return FIELDS.map((field) => ({ op: 'set' as const, path: [field], value: prefs[field] }))
}

/**
 * 决定是否执行一次性旧配置迁移。
 *
 * 判据是宿主的 user 层：宿主只在用户真的写过某字段时把它放进 user 层，所以
 * user 为空（含宿主返回的空对象）表示这份命名空间从未被写过，旧的 localStorage
 * 才可作为初值写入。任何非空 user 层都让迁移退化为 no-op，因此不需要额外的
 * 迁移标志键。
 *
 * @param user - 宿主快照的原始用户层；无则 undefined 或 null。
 * @param raw - 旧 localStorage 载荷。
 * @returns 迁移写入操作；不该迁移时返回 undefined。
 */
export function planLegacyMigration(user: unknown, raw: string | null | undefined): PrefOp[] | undefined {
  if (user !== undefined && user !== null && Object.keys(user as object).length > 0) return undefined
  if (raw === null || raw === undefined) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return undefined }
  if (!isRecord(parsed)) return undefined
  // historyEnabled 在旧载荷里不存在，parseLegacyPrefs 会给它默认值 true。
  return prefsOps(parseLegacyPrefs(raw))
}
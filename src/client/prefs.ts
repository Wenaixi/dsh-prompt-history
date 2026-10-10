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
/** 一条偏好字段名。 */
export type PrefField = keyof PluginPrefs


/**
 * 配置健康度诊断报告。
 */
export interface ConfigHealthReport {
  /** 健康档位：healthy（完美）、degraded（残缺但可用）、corrupted（严重损坏/含未知脏键）。 */
  status: 'healthy' | 'degraded' | 'corrupted'
  /** 缺失的标准字段列表（如升级后缺少 ignoreLeadingSpace）。 */
  missingKeys: PrefField[]
  /** 宿主层中残留的未知/废弃脏键（可能导致宿主拒绝写入，如旧版 tocVisible）。 */
  unknownKeys: string[]
  /** 类型不匹配或非法的字段列表。 */
  invalidKeys: string[]
  /** 9 个核心标准字段是否全部有效存在。 */
  isComplete: boolean
  /** 诊断说明摘要（zh）。 */
  summary: string
}

/**
 * 从损坏数据中提取出的配置结果。
 */
export interface ExtractedConfigResult {
  /** 抢救并清洗后的标准配置（缺失或损坏项已用默认值补齐）。 */
  prefs: PluginPrefs
  /** 成功抢救并保留的有效字段数量（0..9）。 */
  salvagedCount: number
  /** 修复详情记录。 */
  repairs: string[]
}

/** 9 个标准字段名作为集合，用于极速白名单与诊断校验。 */
export const KNOWN_FIELDS: readonly PrefField[] = FIELDS

/**
 * 诊断一份配置对象的健康度。
 *
 * @param raw 待检测的配置对象（如宿主 snapshot.value 或任意输入）
 * @param userLayer 宿主 user 层原始对象（用于探测是否有陈旧脏键）
 */
export function analyzeConfigHealth(raw: unknown, userLayer?: unknown): ConfigHealthReport {
  const missingKeys: PrefField[] = []
  const invalidKeys: string[] = []
  const unknownKeys: string[] = []

  if (!isRecord(raw)) {
    return {
      status: 'corrupted',
      missingKeys: [...FIELDS],
      unknownKeys: [],
      invalidKeys: ['(not an object)'],
      isComplete: false,
      summary: '配置不是有效的键值对象',
    }
  }

  // 1. 检查 9 个标准字段的完整性与类型有效性
  for (const field of FIELDS) {
    if (!(field in raw) || raw[field] === undefined) {
      missingKeys.push(field)
    } else {
      const val = raw[field]
      if (field === 'copyMode') {
        if (val !== 'off' && val !== 'toolbar' && val !== 'auto') invalidKeys.push(field)
      } else if (field === 'maxHistoryItems') {
        if (typeof val !== 'number' || !Number.isFinite(val) || val < MAX_HISTORY_MIN || val > MAX_HISTORY_MAX) {
          invalidKeys.push(field)
        }
      } else {
        if (typeof val !== 'boolean') invalidKeys.push(field)
      }
    }
  }

  // 2. 检查未知脏键（探测 raw 和 userLayer，宿主可能因脏键拒绝保存）
  const candidates = new Set<string>()
  for (const k of Object.keys(raw)) candidates.add(k)
  if (isRecord(userLayer)) {
    for (const k of Object.keys(userLayer)) candidates.add(k)
  }
  for (const k of candidates) {
    if (!FIELDS.includes(k as PrefField)) {
      unknownKeys.push(k)
    }
  }

  const isComplete = missingKeys.length === 0 && invalidKeys.length === 0
  let status: ConfigHealthReport['status'] = 'healthy'
  let summary = '配置完整且健康'

  if (unknownKeys.length > 0 || invalidKeys.length > 0) {
    status = 'corrupted'
    summary = `检测到 ${unknownKeys.length} 个废弃脏键或 ${invalidKeys.length} 个异常值，需清理自愈`
  } else if (missingKeys.length > 0) {
    status = 'degraded'
    summary = `缺少 ${missingKeys.length} 个标准配置项，需补全`
  }

  return { status, missingKeys, unknownKeys, invalidKeys, isComplete, summary }
}

/**
 * 容灾提取器：即使配置部分损坏、丢失或含有脏键，也能最大程度提取完好配置，
 * 损坏字段用默认值修复补齐，并彻底剔除未知脏键。
 */
export function extractValidConfig(raw: unknown, fallback: PluginPrefs = DEFAULT_PREFS): ExtractedConfigResult {
  const repairs: string[] = []
  let salvagedCount = 0

  if (!isRecord(raw)) {
    return {
      prefs: { ...fallback },
      salvagedCount: 0,
      repairs: ['输入非合法对象，全量采用安全默认值'],
    }
  }

  // copyMode 提取（兼容旧 copyOnSelect）
  let copyMode: CopyMode
  if (raw.copyMode === 'off' || raw.copyMode === 'toolbar' || raw.copyMode === 'auto') {
    copyMode = raw.copyMode
    salvagedCount++
  } else if (typeof raw.copyOnSelect === 'boolean') {
    copyMode = raw.copyOnSelect ? 'auto' : 'toolbar'
    repairs.push(`从旧字段 copyOnSelect=${raw.copyOnSelect} 迁移 copyMode=${copyMode}`)
    salvagedCount++
  } else {
    copyMode = fallback.copyMode
    repairs.push(`copyMode 无效或缺失，采用默认值 ${copyMode}`)
  }

  // 布尔字段提取
  const extractBool = (field: PrefField): boolean => {
    const val = raw[field]
    if (typeof val === 'boolean') {
      salvagedCount++
      return val
    }
    const def = fallback[field] as boolean
    repairs.push(`${field} 无效或缺失，采用默认值 ${def}`)
    return def
  }

  // maxHistoryItems 提取（支持字符串数字和超界纠偏）
  let maxHistoryItems: number
  const rawMax = raw.maxHistoryItems
  if (typeof rawMax === 'number' && Number.isFinite(rawMax)) {
    const clamped = Math.floor(Math.min(MAX_HISTORY_MAX, Math.max(MAX_HISTORY_MIN, rawMax)))
    if (clamped !== rawMax) repairs.push(`maxHistoryItems=${rawMax} 纠偏为合法区间 ${clamped}`)
    maxHistoryItems = clamped
    salvagedCount++
  } else if (typeof rawMax === 'string' && /^\d+$/.test(rawMax.trim())) {
    const parsed = parseInt(rawMax.trim(), 10)
    const clamped = Math.min(MAX_HISTORY_MAX, Math.max(MAX_HISTORY_MIN, parsed))
    repairs.push(`maxHistoryItems 字符串 "${rawMax}" 转换纠偏为 ${clamped}`)
    maxHistoryItems = clamped
    salvagedCount++
  } else {
    maxHistoryItems = fallback.maxHistoryItems
    repairs.push(`maxHistoryItems 无效或缺失，采用默认值 ${maxHistoryItems}`)
  }

  const prefs: PluginPrefs = {
    copyMode,
    rightClickPaste: extractBool('rightClickPaste'),
    historyEnabled: extractBool('historyEnabled'),
    doubleEsc: extractBool('doubleEsc'),
    maxHistoryItems,
    relativeTime: extractBool('relativeTime'),
    fuzzyMatch: extractBool('fuzzyMatch'),
    globalHistory: extractBool('globalHistory'),
    ignoreLeadingSpace: extractBool('ignoreLeadingSpace'),
  }

  return { prefs, salvagedCount, repairs }
}

/**
 * 生成自愈重构操作流：
 * 1. 对 9 个标准字段生成全量 set（写全所有字段，满足宿主深比较与 patch 约束）；
 * 2. 对 userLayer 里所有存在的陈旧废弃脏键精准生成 unset（从底层文件彻底拔除阻断写入的陈旧键）。
 */
export function generateHealingOps(rawUserLayer: unknown, extractedPrefs: PluginPrefs): PrefOp[] {
  const ops: PrefOp[] = []

  // 1. 如果宿主 user 层里有未知脏键，先生成 unset 彻底清理
  if (isRecord(rawUserLayer)) {
    for (const key of Object.keys(rawUserLayer)) {
      if (!FIELDS.includes(key as PrefField)) {
        ops.push({ op: 'unset', path: [key] })
      }
    }
  }

  // 2. 全量生成 9 个标准字段的写入操作
  for (const field of FIELDS) {
    ops.push({ op: 'set', path: [field], value: extractedPrefs[field] })
  }

  return ops
}

/**
 * 从任意配置文本（如 JSON 或导出的字符串）中安全提取配置并诊断。
 */
export function safeParseAndExtract(text: string): { success: boolean; result: ExtractedConfigResult; health: ConfigHealthReport } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return {
      success: false,
      result: {
        prefs: { ...DEFAULT_PREFS },
        salvagedCount: 0,
        repairs: ['JSON 解析失败：' + (err instanceof Error ? err.message : String(err))],
      },
      health: {
        status: 'corrupted',
        missingKeys: [...FIELDS],
        unknownKeys: [],
        invalidKeys: ['(invalid json)'],
        isComplete: false,
        summary: '非合法的 JSON 格式',
      },
    }
  }

  const result = extractValidConfig(parsed)
  const health = analyzeConfigHealth(parsed)
  return { success: true, result, health }
}

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
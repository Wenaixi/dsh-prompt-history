/**
 * 历史列表选择器的纯逻辑：过滤、排序、高亮移动、双击手势判定、相对时间。
 *
 * 这里只有纯函数与常量，不含 DOM、不含 React、不含 cordis，因此可以直接用
 * `node --experimental-strip-types --test` 覆盖。浮层渲染在 feedback.ts，
 * 按键接线在 InputHistory.tsx，三者只共享本文件的判定。
 */

/** 双击手势的时间窗（毫秒），取自 Claude Code 的 useDoublePress 800。 */
export const DOUBLE_ESCAPE_MS = 800

/**
 * 按包含条件过滤历史，返回历史下标数组，最新的排在最前。
 *
 * 重复文本只保留最新一次出现，与 Claude Code 的 Ctrl+R 选择器一致：同一句
 * 提示词提过三次，列表里只出现一次，避免翻列表时被同质条目刷屏。
 *
 * @param history - 历史文本，按时间从旧到新。
 * @param query - 过滤词；空串表示不过滤。
 * @returns 命中的历史下标，最新优先。
 */
export function matchesOf(history: readonly string[], query: string): number[] {
  const out: number[] = []
  const seen = new Set<string>()
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]
    if (entry === undefined || entry === '') continue
    if (!entry.includes(query)) continue
    if (seen.has(entry)) continue
    seen.add(entry)
    out.push(i)
  }
  return out
}

/**
 * 字符子序列匹配（复刻 Claude Code HistorySearchDialog 的 isSubsequence）：
 * query 的每个字符按顺序出现在 text 中即命中，大小写不敏感。
 *
 * @param text - 被匹配文本。
 * @param query - 过滤词。
 * @returns 是否为子序列。
 */
export function isSubsequence(text: string, query: string): boolean {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let j = 0
  for (let i = 0; i < lowerText.length && j < lowerQuery.length; i += 1) {
    if (lowerText[i] === lowerQuery[j]) j += 1
  }
  return j === lowerQuery.length
}

/**
 * 模糊过滤：先「包含」后「子序列」，各自最新优先、重复折叠。
 *
 * 对齐 Claude Code：exact.concat(fuzzy)，包含命中排在模糊命中之前。
 *
 * @param history - 历史文本，按时间从旧到新。
 * @param query - 过滤词；空串时不过滤（返回全部去重倒序）。
 * @returns 命中下标数组，exact 在前 fuzzy 在后，各自最新优先。
 */
export function fuzzyMatchesOf(history: readonly string[], query: string): number[] {
  if (query === '') return matchesOf(history, '')
  const exact: number[] = []
  const fuzzy: number[] = []
  const seen = new Set<string>()
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]
    if (entry === undefined || entry === '') continue
    if (seen.has(entry)) continue
    if (entry.includes(query)) {
      seen.add(entry)
      exact.push(i)
    } else if (isSubsequence(entry, query)) {
      seen.add(entry)
      fuzzy.push(i)
    }
  }
  return exact.concat(fuzzy)
}

/**
 * 在命中列表里移动高亮，两端夹取（不环绕，对齐 Claude Code FuzzyPicker 的 clamp：
 * `clamp(current + step, 0, total - 1)`，越界 current 按原值参与运算后夹回）。
 *
 * @param current - 当前高亮在命中数组里的下标；越界视为夹取源。
 * @param step - 步长，正数向后（更旧），负数向前（更新）。
 * @param total - 命中条数。
 * @returns 新的高亮下标；无命中时返回 -1。
 */
export function clampIndex(current: number, step: number, total: number): number {
  if (total <= 0) return -1
  return Math.max(0, Math.min(total - 1, current + step))
}

/**
 * 判断这次 Escape 是否构成双击的第二次。
 *
 * 用 performance.now() 的单调时间戳而非 Date.now()：后者会被系统时钟调整
 * （改时区、夏令时校时）影响，可能让两次按键的差值凭空变成负数或超大值。
 *
 * @param last - 上一次 Escape 的时间戳，0 表示从未按过。
 * @param now - 本次 Escape 的时间戳。
 * @param windowMs - 时间窗，默认取 DOUBLE_ESCAPE_MS。
 * @returns 命中双击时为 true。
 */
export function isDoubleEscape(last: number, now: number, windowMs: number = DOUBLE_ESCAPE_MS): boolean {
  if (last === 0) return false
  const gap = now - last
  return gap >= 0 && gap <= windowMs
}

/** 相对时间的结构化结果：数值 + 单位；unit='now' 时 value 恒为 0。 */
export interface RelativeAge {
  readonly value: number
  readonly unit: 'now' | 'min' | 'hour' | 'day'
}

/**
 * 把时间戳格式化成相对年龄（对齐 Claude Code 的 formatRelativeTimeAgo）。
 *
 * 只返回结构化数值不拼文案，文案由调用方按 locale 模板渲染。
 *
 * @param ts - 条目时间戳（Unix epoch ms）。
 * @param now - 当前时间戳（Unix epoch ms）。
 * @returns 相对年龄；30 天以上、时间戳缺失或未来时间返回 null。
 */
export function relativeAgeOf(ts: number, now: number): RelativeAge | null {
  if (ts <= 0 || now <= 0 || !Number.isFinite(ts) || !Number.isFinite(now)) return null
  const diff = now - ts
  if (diff < 0) return null
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return { value: 0, unit: 'now' }
  if (minutes < 60) return { value: minutes, unit: 'min' }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { value: hours, unit: 'hour' }
  const days = Math.floor(hours / 24)
  if (days < 30) return { value: days, unit: 'day' }
  return null
}

/**
 * 已浏览 step 条时对应的历史下标。
 *
 * 历史数组按时间从旧到新存放，而浏览从最新一条开始，所以两者方向相反：
 * step=1 取最后一条（最新），step=total 取第 0 条（最旧）。
 *
 * @param step - 已浏览条数，1..total。
 * @param total - 历史总条数。
 * @returns 历史数组下标；越界时返回 -1。
 */
export function atStep(step: number, total: number): number {
  if (step < 1 || step > total) return -1
  return total - step
}

/**
 * 按一次 ↑ 之后的浏览位置。
 *
 * 已到最旧一条（step 已达历史条数）时保持原值：Claude Code 在这里回滚索引并把
 * 用户当前那一行原样留着，不会像 bash 那样环绕回最新。
 *
 * @param step - 当前已浏览条数，0 表示未在浏览。
 * @param total - 历史总条数。
 * @returns 新的已浏览条数。
 */
export function upStep(step: number, total: number): number {
  if (total <= 0) return 0
  return step >= total ? step : step + 1
}

/**
 * 按一次 ↓ 之后的浏览位置；回到 0 表示退出浏览、恢复浏览前那一行。
 *
 * @param step - 当前已浏览条数。
 * @returns 新的已浏览条数，最小为 0。
 */
export function downStep(step: number): number {
  return step <= 1 ? 0 : step - 1
}

/**
 * 历史列表选择器的纯逻辑：过滤、排序、高亮移动、双击手势判定。
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
 * 在命中列表里移动高亮，两端环绕。
 *
 * @param current - 当前高亮在命中数组里的下标，越界或负数视为未选中。
 * @param step - 步长，正数向后（更旧），负数向前（更新）。
 * @param total - 命中条数。
 * @returns 新的高亮下标；无命中时返回 -1。
 */
export function nextIndex(current: number, step: number, total: number): number {
  if (total <= 0) return -1
  if (current < 0 || current >= total) return step > 0 ? total - 1 : 0
  return (current + step + total) % total
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

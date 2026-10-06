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

// ---- ↑/↓ 顺序浏览（对齐 Claude Code 的 useArrowKeyHistory）----
//
// 浏览位置不用「历史下标」而用「已看过几条」（step）：0 表示没在浏览，n≥1 表示
// 正显示从最新往回数第 n 条。好处是最旧一条的边界天然是 step === total，越界时
// step 不变、草稿不动，不需要额外的环绕分支。

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

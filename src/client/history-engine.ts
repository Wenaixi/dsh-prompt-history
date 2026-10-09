/**
 * PromptHistoryEngine: 终端提示词历史的核心无头状态机（深模块）。
 *
 * 彻底脱离 React 声明周期与 DOM 环境，纯数据驱动：
 * 1. 历史环存储：容量上限 FIFO 截断、会话滑动窗口 seq 去重、跨会话全环去重 vs 单会话相邻去重；
 * 2. 上下键浏览：Claude Code 风格浏览步进、到底不环绕、输入恢复与用户手动编辑失效脱离；
 * 3. 双击 Esc 状态机：800ms 单调时钟黄金判定窗口、任意非 Esc 按键打断待定态（Primed Reset）；
 * 4. 搜索面板状态机：差量搜索词提取、子序列模糊匹配、两端夹取导航、无损还原基准草稿；
 * 5. 隐私与过滤：前瞻支持 ignoreLeadingSpace（前导空格不存历史）。
 */

import {
  atStep,
  clampIndex,
  downStep,
  fuzzyMatchesOf,
  isDoubleEscape,
  matchesOf,
  upStep,
} from './history-model.ts'

export interface HistoryRecord {
  readonly text: string
  readonly time: number
}

export interface PromptHistoryConfig {
  historyEnabled: boolean
  globalHistory: boolean
  maxHistoryItems: number
  doubleEsc: boolean
  fuzzyMatch: boolean
  ignoreLeadingSpace?: boolean
}

export interface StorageDriver {
  load(): readonly HistoryRecord[]
  save(records: readonly HistoryRecord[]): void
}

export interface EngineClock {
  monotonicNow(): number
  wallClockNow(): number
}

export interface SearchSnapshot {
  readonly query: string
  readonly highlight: number
  /** 命中的历史记录下标（以引擎原 history 数组下标为准，便于回填）。 */
  readonly hits: readonly number[]
  /** 完整的历史记录引用。 */
  readonly entries: readonly HistoryRecord[]
  readonly total: number
}

export type EngineAction =
  | { readonly type: 'none' }
  | { readonly type: 'set-draft'; readonly text: string; readonly caret: 'start' | 'end' }
  | { readonly type: 'show-panel'; readonly snapshot: SearchSnapshot }
  | { readonly type: 'hide-panel' }
  | { readonly type: 'flash-hint'; readonly hintKey: 'esc.again' }

export interface KeyInputContext {
  readonly key: string
  readonly shiftKey?: boolean
  readonly ctrlKey?: boolean
  readonly altKey?: boolean
  readonly metaKey?: boolean
  readonly isComposing?: boolean
  readonly currentDraft: string
  readonly isCaretOnFirstLine: boolean
  readonly isCaretOnLastLine: boolean
}

export type EngineMode = 'idle' | 'browsing' | 'searching'

const DEFAULT_STORAGE: StorageDriver = {
  load: () => {
    try {
      if (typeof localStorage === 'undefined') return []
      const raw = localStorage.getItem('dsh-prompt-history.global')
      if (raw === null) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((item: unknown) => {
          if (typeof item === 'string') return { text: item, time: 0 }
          if (typeof item === 'object' && item !== null && typeof (item as { text?: unknown }).text === 'string') {
            const time = typeof (item as { time?: unknown }).time === 'number' ? (item as { time: number }).time : 0
            return { text: (item as { text: string }).text, time }
          }
          return null
        })
        .filter((e): e is HistoryRecord => e !== null)
    } catch {
      return []
    }
  },
  save: (records) => {
    try {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem('dsh-prompt-history.global', JSON.stringify(records))
    } catch {
      /* storage quota exceeded or restricted */
    }
  },
}

const DEFAULT_CLOCK: EngineClock = {
  monotonicNow: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  wallClockNow: () => Date.now(),
}

export class PromptHistoryEngine {
  private config: PromptHistoryConfig
  private readonly storage: StorageDriver
  private readonly clock: EngineClock

  private history: HistoryRecord[] = []
  private seen: Set<number> = new Set()
  private browse: { step: number; saved: string; lastSet: string | null } = {
    step: 0,
    saved: '',
    lastSet: null,
  }
  private picker: { query: string; highlight: number; origin: string; seen: string } | null = null
  private lastEscape: number = 0

  constructor(config: PromptHistoryConfig, storage?: StorageDriver, clock?: EngineClock) {
    this.config = { ...config }
    this.storage = storage ?? DEFAULT_STORAGE
    this.clock = clock ?? DEFAULT_CLOCK

    // 初始化时若开启跨会话记忆，从存储载入历史并裁剪
    if (this.config.historyEnabled && this.config.globalHistory) {
      const loaded = this.storage.load()
      const cap = this.config.maxHistoryItems
      this.history = loaded.slice(-cap)
    }
  }

  /** 获取当前运行模式 */
  public getMode(): EngineMode {
    if (this.picker !== null) return 'searching'
    if (this.browse.step !== 0) return 'browsing'
    return 'idle'
  }

  /** 只读暴露历史列表 */
  public getHistory(): readonly HistoryRecord[] {
    return this.history
  }

  /** 动态更新配置（处理运行时容量缩容、开关变更） */
  public updateConfig(patch: Partial<PromptHistoryConfig>): void {
    const prevCap = this.config.maxHistoryItems
    this.config = { ...this.config, ...patch }
    const nextCap = this.config.maxHistoryItems

    if (this.history.length > nextCap) {
      this.history.splice(0, this.history.length - nextCap)
      if (this.config.globalHistory) this.storage.save(this.history)
    }
  }

  /** 切换会话上下文：重置所有瞬态状态机 */
  public switchSession(_sessionId: string): void {
    if (!this.config.historyEnabled || !this.config.globalHistory) {
      this.history = []
    }
    this.seen = new Set()
    this.browse = { step: 0, saved: '', lastSet: null }
    this.picker = null
    this.lastEscape = 0
  }

  /** 吸收宿主消息流（幂等追加、去重过滤、容量裁剪） */
  public ingestMessages(messages: ReadonlyArray<{ seq: number; text: string | null; time: number }>): void {
    const cap = this.config.maxHistoryItems
    const globalOn = this.config.globalHistory
    const ignoreSpace = this.config.ignoreLeadingSpace ?? false
    let mutated = false

    for (const msg of messages) {
      if (this.seen.has(msg.seq)) continue
      this.seen.add(msg.seq)
      if (msg.text === null) continue
      // 敏感指令与前导空格过滤
      if (ignoreSpace && msg.text.startsWith(' ')) continue

      // 全环去重 vs 相邻去重
      const shouldPush = globalOn
        ? !this.history.some((e) => e.text === msg.text)
        : this.history[this.history.length - 1]?.text !== msg.text

      if (shouldPush) {
        this.history.push({ text: msg.text, time: msg.time })
        mutated = true
      }
    }

    if (this.history.length > cap) {
      this.history.splice(0, this.history.length - cap)
      mutated = true
    }

    if (globalOn && mutated) {
      this.storage.save(this.history)
    }
  }

  /**
   * 响应草稿变更：
   * 1. 浏览态下：感知用户手动编辑（脱离浏览状态机）；
   * 2. 搜索态下：计算输入法差量搜索词并刷新面板快照。
   */
  public onDraftChange(currentDraft: string): EngineAction {
    // 浏览态：如果当前草稿既不是空也不是上次插件写入的文本，说明用户手动修改了，脱离历史链
    if (this.browse.step !== 0 && currentDraft !== this.browse.lastSet) {
      this.browse = { step: 0, saved: '', lastSet: null }
    }

    // 搜索态：差量更新
    if (this.picker !== null) {
      if (this.picker.seen === currentDraft) return { type: 'none' }
      this.picker.seen = currentDraft
      const origin = this.picker.origin
      const query = currentDraft.startsWith(origin) ? currentDraft.slice(origin.length) : currentDraft
      this.picker.query = query
      this.picker.highlight = 0
      const snapshot = this.getSearchSnapshot()
      return snapshot !== null ? { type: 'show-panel', snapshot } : { type: 'none' }
    }

    return { type: 'none' }
  }

  /**
   * 统一键盘调度中枢：判定事件是否消费，并产出明确的声明式动作。
   */
  public onKeyDown(ctx: KeyInputContext): { handled: boolean; action: EngineAction } {
    if (!this.config.historyEnabled) return { handled: false, action: { type: 'none' } }
    if (ctx.isComposing) return { handled: false, action: { type: 'none' } }

    // ----------------- 模式 A：搜索面板开启中 -----------------
    if (this.picker !== null) {
      if (ctx.key === 'Escape') {
        return { handled: true, action: this.cancelSearch() }
      }
      if (ctx.key === 'Enter' || ctx.key === 'Tab') {
        return { handled: true, action: this.acceptSearch() }
      }
      if (ctx.key === 'ArrowUp' || ctx.key === 'ArrowDown' || ctx.key === 'Home' || ctx.key === 'End') {
        const snapshot = this.getSearchSnapshot()
        if (snapshot === null || snapshot.total === 0) return { handled: true, action: { type: 'none' } }
        let nextIndex = snapshot.highlight
        if (ctx.key === 'ArrowUp') nextIndex = clampIndex(snapshot.highlight, -1, snapshot.total)
        else if (ctx.key === 'ArrowDown') nextIndex = clampIndex(snapshot.highlight, 1, snapshot.total)
        else if (ctx.key === 'Home') nextIndex = 0
        else if (ctx.key === 'End') nextIndex = snapshot.total - 1

        this.picker.highlight = nextIndex
        const nextSnapshot = this.getSearchSnapshot()
        return {
          handled: true,
          action: nextSnapshot !== null ? { type: 'show-panel', snapshot: nextSnapshot } : { type: 'none' },
        }
      }
      // 其余按键放行给输入框草稿处理（驱动 onDraftChange 差量搜索）
      return { handled: false, action: { type: 'none' } }
    }

    // ----------------- 模式 B：面板关闭状态 -----------------

    // 非 Esc 键立即清零待定 Esc 态（Primed Reset）
    if (ctx.key !== 'Escape') {
      this.lastEscape = 0
    } else {
      // Esc 键分支
      if (!this.config.doubleEsc) {
        this.lastEscape = 0
        return { handled: false, action: { type: 'none' } }
      }

      const now = this.clock.monotonicNow()
      const doubled = isDoubleEscape(this.lastEscape, now)

      if (ctx.currentDraft !== '') {
        // 分支 1：非空草稿双击清空
        if (doubled) {
          this.lastEscape = 0
          if (ctx.currentDraft.trim() !== '') {
            this.appendManualDraft(ctx.currentDraft)
          }
          this.browse = { step: 0, saved: '', lastSet: null }
          return { handled: true, action: { type: 'set-draft', text: '', caret: 'start' } }
        }
        // 第一次 Esc：记时并不拦截，提示再按一次
        this.lastEscape = now
        return { handled: false, action: { type: 'flash-hint', hintKey: 'esc.again' } }
      } else if (this.history.length > 0) {
        // 分支 2：空草稿双击唤起历史列表
        if (doubled) {
          this.lastEscape = 0
          return { handled: true, action: this.openSearch(ctx.currentDraft) }
        }
        this.lastEscape = now
        return { handled: false, action: { type: 'none' } }
      } else {
        this.lastEscape = 0
        return { handled: false, action: { type: 'none' } }
      }
    }

    // 上下方向键：Claude Code 语义浏览历史
    if (ctx.key !== 'ArrowUp' && ctx.key !== 'ArrowDown') {
      return { handled: false, action: { type: 'none' } }
    }
    if (ctx.shiftKey || ctx.ctrlKey || ctx.metaKey || ctx.altKey) {
      return { handled: false, action: { type: 'none' } }
    }
    if (this.history.length === 0) {
      return { handled: false, action: { type: 'none' } }
    }

    // ArrowUp：首行接管，逐条往回
    if (ctx.key === 'ArrowUp') {
      if (!ctx.isCaretOnFirstLine) return { handled: false, action: { type: 'none' } }
      const next = upStep(this.browse.step, this.history.length)
      if (this.browse.step === 0) {
        this.browse = { step: next, saved: ctx.currentDraft, lastSet: null }
      } else if (next === this.browse.step) {
        // 已经到最旧一条：到底不环绕，保持不变
        return { handled: true, action: { type: 'none' } }
      } else {
        this.browse = { ...this.browse, step: next }
      }
      const entry = this.history[atStep(next, this.history.length)]
      const text = entry !== undefined ? entry.text : ''
      this.browse.lastSet = text
      return { handled: true, action: { type: 'set-draft', text, caret: 'start' } }
    }

    // ArrowDown：未浏览时不拦截；末行接管，递减恢复草稿
    if (this.browse.step === 0) return { handled: false, action: { type: 'none' } }
    if (!ctx.isCaretOnLastLine) return { handled: false, action: { type: 'none' } }
    const next = downStep(this.browse.step)
    if (next === 0) {
      const saved = this.browse.saved
      this.browse = { step: 0, saved: '', lastSet: saved }
      return { handled: true, action: { type: 'set-draft', text: saved, caret: 'end' } }
    }
    this.browse = { ...this.browse, step: next }
    const entry = this.history[atStep(next, this.history.length)]
    const text = entry !== undefined ? entry.text : ''
    this.browse.lastSet = text
    return { handled: true, action: { type: 'set-draft', text, caret: 'end' } }
  }

  /** 打开搜索面板 */
  public openSearch(origin: string): EngineAction {
    this.picker = { query: '', highlight: 0, origin, seen: origin }
    const snapshot = this.getSearchSnapshot()
    return snapshot !== null ? { type: 'show-panel', snapshot } : { type: 'none' }
  }

  /** 面板提交：选定历史项回填草稿并关闭面板 */
  public acceptSearch(index?: number): EngineAction {
    if (this.picker === null) return { type: 'none' }
    const snapshot = this.getSearchSnapshot()
    if (snapshot === null || snapshot.hits.length === 0) {
      this.picker = null
      return { type: 'hide-panel' }
    }

    const hitIndex = index !== undefined ? index : snapshot.highlight
    const targetEntryIdx = snapshot.hits[hitIndex]
    if (targetEntryIdx === undefined) {
      this.picker = null
      return { type: 'hide-panel' }
    }
    const targetText = this.history[targetEntryIdx]?.text ?? ''
    this.picker = null
    this.browse = { step: 0, saved: '', lastSet: targetText }
    return { type: 'set-draft', text: targetText, caret: 'end' }
  }

  /** 面板取消：无损恢复打开面板时的 origin 草稿并关闭面板 */
  public cancelSearch(): EngineAction {
    if (this.picker === null) return { type: 'none' }
    const origin = this.picker.origin
    this.picker = null
    return { type: 'set-draft', text: origin, caret: 'end' }
  }

  /** 获取当前只读搜索快照 */
  public getSearchSnapshot(): SearchSnapshot | null {
    if (this.picker === null) return null
    const query = this.picker.query
    // 从最新向最旧匹配
    const reversed = [...this.history].reverse()
    const strings = reversed.map((e) => e.text)
    const reversedHits = this.config.fuzzyMatch ? fuzzyMatchesOf(strings, query) : matchesOf(strings, query)
    const total = this.history.length
    // 换算回原始 history 下标
    const originalHits = reversedHits.map((rIdx) => total - 1 - rIdx)
    const highlight = clampIndex(this.picker.highlight, 0, originalHits.length)
    return {
      query,
      highlight,
      hits: originalHits,
      entries: this.history,
      total: originalHits.length,
    }
  }

  /** 手动把双击清空的有效草稿存入历史 */
  private appendManualDraft(text: string): void {
    if (this.config.ignoreLeadingSpace && text.startsWith(' ')) return
    const globalOn = this.config.globalHistory
    const cap = this.config.maxHistoryItems

    if (globalOn
      ? !this.history.some((e) => e.text === text)
      : this.history[this.history.length - 1]?.text !== text) {
      this.history.push({ text, time: this.clock.wallClockNow() })
    }
    if (this.history.length > cap) {
      this.history.splice(0, this.history.length - cap)
    }
    if (globalOn) {
      this.storage.save(this.history)
    }
  }
}
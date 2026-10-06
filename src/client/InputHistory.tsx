/**
 * InputHistory: bash-like prompt history + right-click paste for the composer
 * (dsh-prompt-history). Renders nothing — it mounts capture-phase listeners on
 * the document while the session's composer card is live.
 *
 * Prompt history, Claude Code style: Up starts browsing at the newest prompt and
 * walks back one entry per press; it only engages when the caret can no longer
 * move up (first line), so multi-line drafts keep their normal cursor movement.
 * Down walks forward and restores the line that was being typed before browsing
 * began; at the oldest entry Up does nothing (no wrap-around). Recalled entries
 * park the caret at the start of the line, restoring the draft parks it at the
 * end. Editing the draft while browsing drops back to the live line. The '/' and
 * '@' suggestion menus keep their own arrow-key navigation: while the menu
 * (role=listbox inside the composer card) is open, the history listener
 * declines and the input trigger pipeline owns the keys.
 *
 * Double Escape (toggleable): with a non-empty draft the first Escape hints
 * "Esc again to clear" and passes through, the second one saves the draft to
 * history and clears the input (caret back to 0); with an empty draft the
 * double press opens the history list panel. When the doubleEsc setting is
 * off, Escape is never consumed by this plugin. Ctrl+R is NOT bound anymore —
 * the browser keeps its native refresh.
 *
 * Right-click paste (terminal-style, like Linux): a right-click on the composer
 * textarea pastes the clipboard directly — no context menu. Paste runs the
 * SAME pipeline as Ctrl+V (execCommand('paste') fires the composer's own paste
 * handler, so images and reference chips behave identically), with a
 * navigator.clipboard fallback that splices text at the caret.
 *
 * Copy on select: any selection in the composer textarea (left-drag,
 * double-click, keyboard Shift+arrows, Ctrl+A) auto-copies once it stabilizes
 * — so select → right-click paste works end to end. Copy prefers the
 * composer's own handler (execCommand), with a navigator.clipboard fallback.
 *
 * History is fed from the conversation snapshot's user nodes (kind 'user' and
 * 'steering'), appended as they land — so everything submitted while the page
 * is open is recallable even after the session event window slides. Consecutive
 * duplicates collapse; on a session switch the window's in-window user messages
 * seed the list. Unlike a parallel storage ring, the history IS the session's
 * own message log: it stays consistent with the transcript, survives reloads
 * through the session itself, and needs no configuration or extra storage.
 *
 * Interception guards: composer textarea target only, no modifier keys
 * (Shift+Up still extends selection), no IME composition, machine not
 * adjudicating/submitting, session not removed.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ui-conversation SlotMap merge (the input.right entry) and the
// session standard kit members (useInput/inputActions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the runtime SessionStandardProps merge (useSession/sessionId) and
// the conversation node union.
import type { ConversationNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { getPrefs } from './prefs.ts'
import {
  flashCopied, hideHistoryPanel, hideSelectionToolbar, showHistoryPanel, showSelectionToolbar,
} from './feedback.ts'
import { atStep, clampIndex, downStep, fuzzyMatchesOf, isDoubleEscape, matchesOf, upStep } from './history-model.ts'
import { T } from './i18n.ts'
import { relativeAgeOf } from './history-model.ts'

/** 相对时间文案：短格式（5m / 3h / 2d），对齐终端紧凑风格。 */
function relativeAgeText(time: number, now: number): string | null {
  const age = relativeAgeOf(time, now)
  if (age === null) return null
  if (age.unit === 'now') return T('history.relative.now')
  const unit = age.unit === 'min' ? 'm' : age.unit === 'hour' ? 'h' : 'd'
  return `${age.value}${unit}`
}
import { promptMessage, type PromptMessage } from './nodes.ts'
import {
  COMPOSER_CARD, editorFocused, editorHost, editorSelectedText, editorSelectionOffsets,
  focusEditor, isCaretOnFirstLine, isCaretOnLastLine, isEditorTarget, setEditorCaret,
} from './editor.ts'

/** Full props of the input-history entry: framework standard kit + owner share. */
export type InputHistoryProps = PropsRuntime<'conversation.input.right'>

/** One history entry: prompt text + the source event timestamp (0 = unknown). */
interface HistoryEntry {
  readonly text: string
  readonly time: number
}

/** One browse-position snapshot; step 0 = showing the live draft (not browsing). */
interface BrowseState {
  /** 已浏览条数；0 表示未在浏览，n≥1 表示正显示从最新往回数第 n 条。 */
  readonly step: number
  /** 开始浏览前保存的草稿；空串表示本来就是空行。 */
  readonly saved: string
  /** The exact draft our own setDraft last wrote (user-edit detection). */
  readonly lastSet: string | null
}

/** One open history list session (null = the panel is closed). */
interface PickerState {
  /** 当前过滤词，始终等于草稿去掉 origin 之后的剩余部分。 */
  readonly query: string
  /** Highlight position within the match array; -1 = no match. */
  readonly highlight: number
  /** 开面板前的草稿；取消时原样写回。 */
  readonly origin: string
  /** 上一次读到的草稿，用来判断输入框这一次是打了一个字还是删了一个字。 */
  readonly seen: string
}

/** Not-browsing state; also the reset target after edits and session switches. */
const RESET_BROWSE: BrowseState = { step: 0, saved: '', lastSet: null }

/** The suggestion menu (slash/at) renders a listbox inside the card while open. */
const OPEN_MENU = '[role="listbox"]'

/** DSH ≥ 0.1.2 moved the conversation nodes off the session snapshot onto the
 * chat view (useChat); the lifecycle fields (removed) stay on useSession.
 * Node shapes differ per generation, so reads go through rawNodesOf +
 * promptMessage (nodes.ts). */
interface ChatLike {
  /** 0.1.1 session snapshot nodes, or a direct array on newer shapes. */
  nodes?: unknown
  /** 0.1.2 web: the old-shaped node array compatibility slice. */
  legacy?: { nodes?: unknown }
  /** 2.0.x desktop: ordered node keys + a store whose .get(key) returns a node. */
  order?: readonly string[]
  removed?: boolean
}
type SelectorHook = (select: (snapshot: ChatLike) => unknown) => unknown

/** Pull the ordered node array out of whichever snapshot shape is present. */
function rawNodesOf(snapshot: ChatLike): readonly unknown[] {
  const legacy = snapshot.legacy?.nodes
  if (Array.isArray(legacy)) return legacy
  const order = snapshot.order
  const store = snapshot.nodes as { get?: (key: string) => unknown } | undefined
  if (Array.isArray(order) && store !== undefined && typeof store.get === 'function') {
    return order.map((key) => store.get?.(key)).filter((n): n is unknown => n !== null && n !== undefined)
  }
  if (Array.isArray(snapshot.nodes)) return snapshot.nodes
  return []
}

/**
 * The composer history + right-click-paste entry.
 * @param props - framework standard kit (useInput/useSession/inputActions/sessionId).
 * @returns null (the entry is invisible chrome).
 */
export function InputHistory(props: InputHistoryProps) {
  const { useInput, useSession, inputActions, sessionId } = props
  // rc.1 merges useChat into the same session standard props (nodes source).
  const useChat = (props as InputHistoryProps & { useChat?: unknown }).useChat
  const nodesHook = (typeof useChat === 'function' ? useChat : useSession) as SelectorHook | undefined
  const sessionHook = useSession as SelectorHook | undefined

  // Latest machine/session facts at event time (the listeners mount once).
  const draft = useInput(s => s.draft)
  const phase = useInput(s => s.phase)
  // Node shapes differ by DSH generation (old {kind,seq,content} vs 2.0.x
  // chatNode with data.content/anchorSeq, and rc.1's nodes being a store, not
  // an array). rawNodesOf + promptMessage normalize them to {kind, seq, text},
  // so nothing non-iterable or mis-shaped reaches the history or the directory.
  const rawNodes = (nodesHook?.((s: ChatLike) => rawNodesOf(s)) as readonly unknown[] | undefined) ?? []
  const messages = useMemo(
    () => rawNodes.map(promptMessage).filter((m): m is PromptMessage => m !== null),
    [rawNodes],
  )
  const removed = sessionHook?.((s) => s.removed) as boolean | undefined ?? false

  /** Submitted prompt entries, oldest → newest (per session; append-only). */
  const historyRef = useRef<HistoryEntry[]>([])
  /** User-node seqs already folded into historyRef (append-once dedup). */
  const seenRef = useRef<Set<number>>(new Set())
  const browseRef = useRef<BrowseState>(RESET_BROWSE)
  const pickerRef = useRef<PickerState | null>(null)
  /** Monotonic timestamp of the last unpaired Escape; 0 = none. */
  const lastEscapeRef = useRef(0)
  const liveRef = useRef({ draft, phase, removed, inputActions })
  liveRef.current = { draft, phase, removed, inputActions }

  // Cross-session history ring: when the setting is on, the history persists
  // in localStorage (capped), survives reloads and session switches, and is
  // deduplicated against the whole ring instead of only consecutive entries.
  const RING_KEY = 'dsh-prompt-history.global'
  const loadRing = (): HistoryEntry[] => {
    try {
      const raw = localStorage.getItem(RING_KEY)
      if (raw === null) return []
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.map((item): HistoryEntry | null => {
        // 兼容旧 ring：纯字符串条目视为 time=0（不显示相对时间）。
        if (typeof item === 'string' && item !== '') return { text: item, time: 0 }
        if (item !== null && typeof item === 'object') {
          const obj = item as { text?: unknown; time?: unknown }
          if (typeof obj.text === 'string' && obj.text !== '') {
            const time = typeof obj.time === 'number' && Number.isFinite(obj.time) ? obj.time : 0
            return { text: obj.text, time }
          }
        }
        return null
      }).filter((entry): entry is HistoryEntry => entry !== null)
    } catch {
      return []
    }
  }
  const saveRing = (history: readonly HistoryEntry[]): void => {
    try {
      const cap = getPrefs().maxHistoryItems
      localStorage.setItem(RING_KEY, JSON.stringify(history.slice(-cap)))
    } catch { /* storage unavailable */ }
  }

  // Seed the ring once on mount when the option is on.
  useEffect(() => {
    const prefs = getPrefs()
    if (prefs.historyEnabled && prefs.globalHistory && historyRef.current.length === 0) {
      historyRef.current = loadRing()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Session switch: with global history the ring persists (only the transient
  // browse/search state resets); otherwise a fresh per-session history.
  useEffect(() => {
    // 历史或跨会话记忆任一关闭，都从空的每会话历史开始。
    const prefs = getPrefs()
    if (!prefs.historyEnabled || !prefs.globalHistory) historyRef.current = []
    seenRef.current = new Set()
    browseRef.current = RESET_BROWSE
    pickerRef.current = null
    hideHistoryPanel()
    lastEscapeRef.current = 0
  }, [sessionId])

  // Fold newly arrived user messages into the history (window slides; the
  // append-only list survives it). With global history, dedup against the
  // whole ring and persist it after every append. The ring is capped by
  // maxHistoryItems.
  useEffect(() => {
    const seen = seenRef.current
    const history = historyRef.current
    const prefs = getPrefs()
    const globalOn = prefs.globalHistory
    const cap = prefs.maxHistoryItems
    for (const message of messages) {
      if (seen.has(message.seq)) continue
      seen.add(message.seq)
      if (message.text === null) continue
      if (globalOn
        ? !history.some((entry) => entry.text === message.text)
        : history[history.length - 1]?.text !== message.text) {
        history.push({ text: message.text, time: message.time })
      }
    }
    if (history.length > cap) history.splice(0, history.length - cap)
    if (globalOn) saveRing(history)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // Any draft change that is not our own history write ends the browse
  // session (recalled lines drop back to the live draft when edited).
  useEffect(() => {
    const browse = browseRef.current
    if (browse.step !== 0 && draft !== browse.lastSet) browseRef.current = RESET_BROWSE
  }, [draft])

  // 面板开着时草稿就是查询词：每敲一个字（中文输入法 group 结束后同样成立）
  // 重新过滤一遍。这比逐键累加 query 可靠——composition 期间浏览器不发 keydown，
  // 攒按键永远攒不到汉字。退格删到 origin 以内时查询词归零，继续删就是改草稿。
  useEffect(() => {
    const picker = pickerRef.current
    if (picker === null || draft === picker.seen) return
    const keepsOrigin = draft.length >= picker.origin.length && draft.startsWith(picker.origin)
    const query = keepsOrigin ? draft.slice(picker.origin.length) : draft
    pickerRef.current = { query, highlight: 0, origin: keepsOrigin ? picker.origin : draft, seen: draft }
    paintPicker()
  }, [draft])

  // ---- 历史列表面板 ----
  //
  // 面板状态刻意不复用 browseRef：浏览历史的 effect 会在草稿变化时把 browseRef
  // 重置，若高亮搭在上面会被自己抹掉。
  //
  // 查询词取自输入框本身（草稿），而不是把按键一个一个攒起来：中文输入法组字
  // 时浏览器只发 composition 事件，攒按键永远攒不到汉字。
  /** 把当前命中与高亮刷进浮层（含相对时间、模糊过滤、宽屏预览）。 */
  const paintPicker = (): void => {
    const picker = pickerRef.current
    if (picker === null) return
    const prefs = getPrefs()
    const history = historyRef.current
    const hits = (prefs.fuzzyMatch ? fuzzyMatchesOf : matchesOf)(
      history.map((entry) => entry.text),
      picker.query,
    )
    const highlight = clampIndex(picker.highlight, 0, hits.length)
    pickerRef.current = { ...picker, highlight }
    const now = Date.now()
    const entries = hits.map((index) => history[index])
    showHistoryPanel(
      {
        texts: entries.map((entry) => entry?.text ?? ''),
        ages: prefs.relativeTime
          ? entries.map((entry) => relativeAgeText(entry?.time ?? 0, now))
          : entries.map(() => null),
        highlight,
        query: picker.query,
        shown: hits.length,
        total: history.length,
      },
      { onPick: pickFromPanel, onDismiss: cancelPicker },
    )
  }

  const openPicker = (): void => {
    const seed = liveRef.current.draft
    pickerRef.current = { query: '', highlight: 0, origin: seed, seen: seed }
    hideHistoryPanel()
    paintPicker()
  }

  const closePicker = (): void => {
    pickerRef.current = null
    hideHistoryPanel()
  }

  /** 回填高亮条目：写草稿、光标到末尾、焦点回输入框。 */
  const acceptPicker = (): void => {
    const picker = pickerRef.current
    if (picker === null) return
    const prefs = getPrefs()
    const history = historyRef.current
    const hits = (prefs.fuzzyMatch ? fuzzyMatchesOf : matchesOf)(
      history.map((entry) => entry.text),
      picker.query,
    )
    const at = picker.highlight >= 0 && picker.highlight < hits.length ? picker.highlight : hits.length - 1
    const index = hits[at]
    const text = index === undefined ? undefined : history[index]?.text
    closePicker()
    if (text === undefined || text === '') return
    liveRef.current.inputActions.setDraft(text)
    browseRef.current = RESET_BROWSE
    // Lexical 写草稿是异步的，等一帧再放光标，否则会被内部重渲染覆盖。
    requestAnimationFrame(() => {
      const host = editorHost()
      if (host === null) return
      focusEditor(host)
      setEditorCaret(host, text.length)
    })
  }

  /** 取消：把草稿还原成开面板前的那一行。 */
  const cancelPicker = (): void => {
    const picker = pickerRef.current
    if (picker !== null && liveRef.current.draft !== picker.origin) {
      liveRef.current.inputActions.setDraft(picker.origin)
      browseRef.current = RESET_BROWSE
    }
    closePicker()
  }

  /** 鼠标点中某一行：回填该条。 */
  const pickFromPanel = (index: number): void => {
    const picker = pickerRef.current
    if (picker === null) return
    pickerRef.current = { ...picker, highlight: index }
    acceptPicker()
  }

  const moveHighlight = (where: 'older' | 'newer' | 'newest' | 'oldest'): void => {
    const picker = pickerRef.current
    if (picker === null) return
    const prefs = getPrefs()
    const history = historyRef.current
    const total = (prefs.fuzzyMatch ? fuzzyMatchesOf : matchesOf)(
      history.map((entry) => entry.text),
      picker.query,
    ).length
    if (total === 0) { paintPicker(); return }
    const next = where === 'newest' ? 0
      : where === 'oldest' ? total - 1
        : clampIndex(picker.highlight, where === 'older' ? 1 : -1, total)
    pickerRef.current = { ...picker, highlight: next }
    paintPicker()
  }
  // History keydown listener (mounts once; reads refs at event time):
  // ↑/↓ browse (Claude Code order: newest → oldest, no prefix search),
  // Ctrl+R or double Escape for the history list panel, non-empty double
  // Escape clears the input and saves it to history.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target
      if (!isEditorTarget(target)) return
      const card = (target as Element).closest(COMPOSER_CARD)
      if (card === null) return
      // IME composition stays native; the suggestion menu owns the keys.
      if (e.isComposing || e.keyCode === 229) return
      // 面板已开时不让位给建议菜单：取消面板会还原草稿，还原出来的那行若带 / 或 @
      // 会顺手弹出建议菜单，若此时才检查 OPEN_MENU，面板就再也关不掉了。
      const panelOpen = pickerRef.current !== null
      if (!panelOpen && card.querySelector(OPEN_MENU) !== null) return
      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return
      // 历史功能被关掉：↑/↓ 与 Ctrl+R 与双击 Esc 全部交还宿主，不拦截任何键。
      if (!getPrefs().historyEnabled) return
      const history = historyRef.current
      const recall = (index: number): string => history[index]?.text ?? ''
      // 回填一条并摆好光标（↑ 放行首对齐 Claude Code，↓/恢复草稿放行尾）。
      // 只写草稿与 lastSet，浏览步数由调用方推进——browseRef 的 step 必须保持
      // 真实浏览位置，否则 ↑ 连按会被误清成「每次都是第一步」。
      const fill = (index: number, caretAtStart: boolean): void => {
        const text = recall(index)
        browseRef.current = { ...browseRef.current, lastSet: text }
        live.inputActions.setDraft(text)
        requestAnimationFrame(() => {
          const host = editorHost()
          if (host === null) return
          focusEditor(host)
          setEditorCaret(host, caretAtStart ? 0 : text.length)
        })
      }

      // ---- history list panel: double Escape (empty draft) opens it ----
      //
      // 打开后焦点留在输入框：输入过滤、↑↓ 移动高亮、Enter/Tab 回填、Esc 关闭。
      // 宿主 Menu 的方向键行走依赖真实焦点搬进列表（lib/index.js 的 anchored 判断），
      // 与「焦点留输入框」互斥，所以浮层与键盘都自己实现。
      const prefs = getPrefs()

      if (panelOpen) {
        // 面板已开：所有键都先归它，避免同一次按键既过滤又触发宿主行为。
        if (e.key === 'Escape') {
          // 面板无条件先消费 Esc：否则关面板时会连带关掉别的浮层。
          e.preventDefault(); e.stopPropagation()
          cancelPicker()
          return
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
          e.preventDefault(); e.stopPropagation()
          acceptPicker()
          return
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
          e.preventDefault(); e.stopPropagation()
          // 列表按「最新在上」渲染（Claude Code 方向：最新贴底、↑ 走更旧）。
          moveHighlight(e.key === 'ArrowUp' ? 'newer' : e.key === 'ArrowDown' ? 'older' : e.key === 'Home' ? 'newest' : 'oldest')
          return
        }
        // 其余按键（输入、Backspace、粘贴、快捷键）一律放行给宿主编辑器：
        // 查询词跟着草稿走（见下面的 draft effect），输入法与 Ctrl+V 才不会失效。
        return
      }

      // ---- 关闭态：Esc（双击 Esc 受 doubleEsc 开关控制）----
      // Ctrl+R 已移除：浏览器保留原生刷新，插件不再消费。
      // 任何非 Esc 的键都清零待定状态（Codex 的 primed 取消规则），
      // 否则上一次 Esc 会一直挂着等着配对。
      if (e.key !== 'Escape') {
        lastEscapeRef.current = 0
      } else if (!prefs.doubleEsc) {
        // 双击 Esc 关闭：Esc 完全交还宿主（不提示、
        // 不消费）。宿主会自行关闭其浮层/菜单。
        lastEscapeRef.current = 0
        return
      } else {
        const now = performance.now()
        const doubled = isDoubleEscape(lastEscapeRef.current, now)
        if (live.draft !== '') {
          // 非空草稿：双击清空（对齐 Claude Code 的 handleEscape）——
          // 第一次提示并透传，第二次把非空白草稿存入历史后清空输入框。
          if (doubled) {
            e.preventDefault(); e.stopPropagation()
            lastEscapeRef.current = 0
            if (live.draft.trim() !== '') {
              // 与提交时的去重规则一致（跨会话全环去重 / 相邻去重）。
              const globalOn = prefs.globalHistory
              const cap = prefs.maxHistoryItems
              if (globalOn
                ? !history.some((entry) => entry.text === live.draft)
                : history[history.length - 1]?.text !== live.draft) {
                history.push({ text: live.draft, time: Date.now() })
              }
              if (history.length > cap) history.splice(0, history.length - cap)
              if (globalOn) saveRing(history)
            }
            browseRef.current = RESET_BROWSE
            live.inputActions.setDraft('')
            requestAnimationFrame(() => {
              const host = editorHost()
              if (host === null) return
              focusEditor(host)
              setEditorCaret(host, 0)
            })
            return
          }
          // 第一次 Esc 只记时间戳、不消费：单按 Esc 仍要能关掉工具栏等既有浮层。
          lastEscapeRef.current = now
          flashCopied(null, T('esc.again'))
        } else if (history.length > 0) {
          // 空草稿：双击开历史列表面板。
          if (doubled) {
            e.preventDefault(); e.stopPropagation()
            lastEscapeRef.current = 0
            hideSelectionToolbar()
            openPicker()
            return
          }
          lastEscapeRef.current = now
        } else {
          lastEscapeRef.current = 0
        }
      }

      // ---- 方向键：顺序浏览历史（Claude Code 语义：最新 → 最旧，不环绕）----
      //
      // 只在光标已经动不了的时候才走历史：多行草稿的光标停在中段时，↑/↓ 仍是
      // 普通的上下移行（对齐 useTextInput 的 upOrHistoryUp）。
      // ponytail: 按逻辑行而非视觉折行判断，超长单行折行后按 ↑ 会直接进历史；
      // 若真实用户反馈受扰，升级路径是用 Range 测量光标所在视觉行再决定拦截。
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (history.length === 0) return
      const host = editorHost()
      if (host === null) return
      const browse = browseRef.current

      if (e.key === 'ArrowUp') {
        if (!isCaretOnFirstLine(host)) return // 光标还能上移：让位宿主
        e.preventDefault()
        e.stopPropagation()
        const next = upStep(browse.step, history.length)
        if (browse.step === 0) {
          // 开始浏览：保存当前草稿（空行也保存，退出时原样还原）。
          browseRef.current = { step: next, saved: live.draft, lastSet: null }
        } else if (next === browse.step) {
          // 已到最旧一条：Claude Code 在这里回滚并不动草稿，不环绕回最新。
          return
        } else {
          browseRef.current = { ...browse, step: next }
        }
        fill(atStep(next, history.length), true)
        return
      }

      // ↓：未浏览时交给宿主的原生下行；浏览中也要光标在最后一行才走历史
      // （对齐 downOrHistoryDown 的「先移光标」），回到 0 时恢复草稿。
      if (browse.step === 0) return
      if (!isCaretOnLastLine(host)) return
      e.preventDefault()
      e.stopPropagation()
      const next = downStep(browse.step)
      if (next === 0) {
        const saved = browse.saved
        browseRef.current = { step: 0, saved: '', lastSet: saved }
        live.inputActions.setDraft(saved)
        requestAnimationFrame(() => {
          const h = editorHost()
          if (h === null) return
          focusEditor(h)
          setEditorCaret(h, saved.length)
        })
        return
      }
      browseRef.current = { ...browse, step: next }
      fill(atStep(next, history.length), false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // 卸载时收掉浮层：否则切换会话或插件热重载后 body 上会留下孤儿节点。
      closePicker()
    }
  }, [])

  // Right-click paste (terminal style): a right-click on the composer editor
  // pastes the clipboard directly, like a Linux terminal.
  useEffect(() => {
    const pasteInto = (host: HTMLElement): void => {
      // The composer's own paste handler (chip matching, image intake) fires on
      // the native paste event execCommand dispatches — full Ctrl+V parity.
      focusEditor(host)
      if (document.execCommand('paste')) return
      // Fallback: read text and splice it at the selection ourselves.
      void navigator.clipboard.readText().then(
        (text) => {
          if (text === '') return
          const sel = editorSelectionOffsets(host)
          const start = sel?.start ?? liveRef.current.draft.length
          const end = sel?.end ?? start
          const draft = liveRef.current.draft
          const next = draft.slice(0, start) + text + draft.slice(end)
          liveRef.current.inputActions.setDraft(next)
          const caret = start + text.length
          requestAnimationFrame(() => { setEditorCaret(host, caret) })
        },
        () => { /* clipboard read denied: nothing to paste */ },
      )
    }

    const onContextMenu = (e: MouseEvent): void => {
      const target = e.target
      if (!isEditorTarget(target)) return
      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return
      // Toggle off: leave the native context menu alone.
      if (!getPrefs().rightClickPaste) return
      e.preventDefault()
      e.stopPropagation()
      const host = editorHost()
      if (host === null) return
      // Right-click does not focus in browsers; focus so the caret/selection is
      // authoritative for the paste (preventScroll: the caret is where the user
      // sees it already).
      focusEditor(host)
      pasteInto(host)
    }
    document.addEventListener('contextmenu', onContextMenu, true)
    return () => { document.removeEventListener('contextmenu', onContextMenu, true) }
  }, [])

  // Selection-driven copy, two modes (Settings → 终端式输入): 'auto' copies
  // any stable non-empty selection directly (terminal-style, floods the system
  // clipboard — opt-in); 'toolbar' (default) shows an explicit 复制 button
  // above the selection and copies only when clicked (nothing writes the
  // clipboard on its own). Both modes apply
  // anywhere in the page — the composer editor (chip-aware via the composer's
  // own copy handler), chat messages, code blocks. A stable-window
  // debounce keeps mid-drag partial selections out; the toolbar is dismissed
  // by collapsing the selection, Escape, scrolling, or clicking elsewhere.
  useEffect(() => {
    let timer: number | undefined
    let lastKey = ''
    let dragStartedInEditor = false

    const selectionRect = (): DOMRect | null => {
      try {
        const sel = document.getSelection()
        if (sel !== null && !sel.isCollapsed && sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect()
          if (rect.width > 0 || rect.height > 0) return rect
        }
      } catch { /* no range for textarea selections in some engines */ }
      const host = editorHost()
      if (host !== null && document.activeElement === host) {
        const rect = host.getBoundingClientRect()
        if (rect.width > 0 || rect.height > 0) return rect
      }
      return null
    }

    const copyText = (text: string, key: string, focusHost?: HTMLElement): void => {
      if (key === lastKey) return // unchanged selection: already copied
      lastKey = key
      if (focusHost !== undefined && document.activeElement !== focusHost) {
        focusEditor(focusHost)
      }
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false // flaky across engines; fall back to the clipboard API
      }
      if (ok) {
        flashCopied(selectionRect())
        return
      }
      if (text === '') return
      navigator.clipboard.writeText(text).then(
        () => { flashCopied(selectionRect()) },
        (error) => { console.warn('[dsh-prompt-history] clipboard copy failed:', error) },
      )
    }

    const copySelection = (): void => {
      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return

      // 1) Composer editor selection (the composer's own handler expands
      //    chips; only while it is the active selection or a drag started in
      //    it — a stale editor selection must not shadow a chat selection).
      const host = editorHost()
      if (host !== null && (document.activeElement === host || dragStartedInEditor)) {
        const text = editorSelectedText(host)
        if (text !== '') {
          copyText(text, `ed:${text}`, host)
          return
        }
      }

      // 2) Any other document selection (chat messages, code blocks, ...).
      const sel = document.getSelection()
      if (sel === null || sel.isCollapsed || sel.rangeCount === 0) return
      const text = sel.toString()
      if (text === '') return
      copyText(text, `doc:${text}`)
    }

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0) return
      dragStartedInEditor = isEditorTarget(e.target)
    }

    // 引用: insert the FULL selected text into the composer as a markdown
    // quote block (each line prefixed with '> ', Codex-style) — everything is
    // visible and editable in the input. A blank line before (unless the draft
    // starts there) and a blank line after keep the quote distinct from the
    // user's own next input, which begins on a fresh line after the caret.
    const quoteSelection = (): void => {
      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return
      const host = editorHost()
      if (host === null) return
      const hostFocused = document.activeElement === host
      let text = ''
      if (hostFocused) {
        text = editorSelectedText(host)
      } else {
        const sel = document.getSelection()
        if (sel !== null && !sel.isCollapsed) text = sel.toString()
      }
      if (text.trim() === '') return
      // A plain markdown blockquote (each line prefixed with '> '), matching
      // how other DSH quote plugins format it — minimal and clean in the
      // input, rendered as a proper blockquote when sent.
      const quoted = '> ' + text.replace(/\n/g, '\n> ')
      const draft = live.draft
      const caret = hostFocused ? (editorSelectionOffsets(host)?.start ?? draft.length) : draft.length
      // A blank line before the quote separates it from prior text; a SINGLE
      // newline after lets the next input start on the line right below it.
      const lead = caret > 0 && draft[caret - 1] !== '\n' ? '\n\n' : caret > 0 ? '\n' : ''
      const tail = '\n'
      const next = draft.slice(0, caret) + lead + quoted + tail + draft.slice(caret)
      live.inputActions.setDraft(next)
      const pos = caret + lead.length + quoted.length + tail.length
      requestAnimationFrame(() => {
        focusEditor(host)
        setEditorCaret(host, pos)
      })
      flashCopied(null, T('pill.quoted'))
    }

    const onSelectionChange = (): void => {
      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) {
        hideSelectionToolbar()
        return
      }
      const mode = getPrefs().copyMode
      // 复制被关掉：不自动复制，也不显示工具栏，只清掉可能残留的旧工具栏。
      if (mode === 'off') {
        window.clearTimeout(timer)
        hideSelectionToolbar()
        return
      }
      const host = editorHost()
      const editorActive = host !== null
        && (document.activeElement === host || dragStartedInEditor)
        && editorSelectedText(host) !== ''
      const sel = document.getSelection()
      const domActive = sel !== null && !sel.isCollapsed
      if (!editorActive && !domActive) {
        window.clearTimeout(timer)
        hideSelectionToolbar()
        return
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (mode === 'auto') {
          copySelection()
        } else {
          const rect = selectionRect()
          if (rect !== null) showSelectionToolbar(rect, quoteSelection)
        }
      }, 150)
    }

    // Toolbar dismissal: Escape, scrolling anywhere, and pointer-down outside
    // the toolbar itself (its own mousedown is suppressed to keep the
    // selection, and the click handler copies before any hide).
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hideSelectionToolbar()
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Element && e.target.closest('.dsh-ph-toolbar') !== null) return
      hideSelectionToolbar()
    }
    const onScroll = (): void => { hideSelectionToolbar() }

    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', hideSelectionToolbar)
    console.info('[dsh-prompt-history] copy modes active (toolbar/auto)')
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', hideSelectionToolbar)
      window.clearTimeout(timer)
      hideSelectionToolbar()
    }
  }, [])

  return null
}

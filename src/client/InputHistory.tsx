/**
 * InputHistory: bash-like prompt history + right-click paste for the composer
 * (dsh-prompt-history). Renders nothing — it mounts capture-phase listeners on
 * the document while the session's composer card is live.
 *
 * Prompt history: Up recalls previously submitted prompts (newest first), Down
 * walks forward and restores the line that was being typed before browsing
 * began; editing the draft while browsing drops back to the live line. The '/'
 * and '@' suggestion menus keep their own arrow-key navigation: while the menu
 * (role=listbox inside the composer card) is open, the history listener
 * declines and the input trigger pipeline owns the keys.
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
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ui-conversation SlotMap merge (the input.right entry) and the
// session standard kit members (useInput/inputActions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the runtime SessionStandardProps merge (useSession/sessionId) and
// the conversation node union.
import type { ConversationNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { getPrefs, subscribePrefs } from './prefs.ts'
import {
  flashCopied, hideHistoryPanel, hideSelectionToolbar, showHistoryPanel, showSelectionToolbar,
} from './feedback.ts'
import { isDoubleEscape, matchesOf, nextIndex } from './history-model.ts'
import { T } from './i18n.ts'
import { pullOlderPage } from './sessionCtx.ts'
import { promptMessage, type PromptMessage } from './nodes.ts'
import {
  COMPOSER_CARD, editorFocused, editorHost, editorSelectedText, editorSelectionOffsets,
  focusEditor, isEditorTarget, setEditorCaret,
} from './editor.ts'
import { ChatToc } from './ChatToc.tsx'

/** Full props of the input-history entry: framework standard kit + owner share. */
export type InputHistoryProps = PropsRuntime<'conversation.input.right'>

/** One browse-position snapshot; index -1 = showing the live draft (not browsing). */
interface BrowseState {
  /** History index currently shown; -1 = the live line. */
  readonly index: number
  /** The draft saved when browsing started; restored at the bottom edge. */
  readonly saved: string
  /** The exact draft our own setDraft last wrote (user-edit detection). */
  readonly lastSet: string | null
  /** Present only in prefix-search mode: the prefix that anchors the matches. */
  readonly prefix?: string
}

/** One open history list session (null = the panel is closed). */
interface PickerState {
  /** The incremental filter typed so far. */
  readonly query: string
  /** Highlight position within the match array; -1 = no match. */
  readonly highlight: number
}

/** Not-browsing state; also the reset target after edits and session switches. */
const RESET_BROWSE: BrowseState = { index: -1, saved: '', lastSet: null }

/** The suggestion menu (slash/at) renders a listbox inside the card while open. */
const OPEN_MENU = '[role="listbox"]'

/** DSH ≥ 0.1.2 moved the conversation nodes off the session snapshot onto the
 * chat view (useChat); the lifecycle fields (removed/hasMore/loadingOlder/
 * openState) stay on useSession. Node shapes differ per generation, so reads
 * go through rawNodesOf + promptMessage (nodes.ts). */
interface ChatLike {
  /** 0.1.1 session snapshot nodes, or a direct array on newer shapes. */
  nodes?: unknown
  /** 0.1.2 web: the old-shaped node array compatibility slice. */
  legacy?: { nodes?: unknown }
  /** 2.0.x desktop: ordered node keys + a store whose .get(key) returns a node. */
  order?: readonly string[]
  removed?: boolean
  hasMore?: boolean
  loadingOlder?: boolean
  openState?: string
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
  // Directory texts: consecutive duplicates collapsed, in conversation order.
  const tocTexts = useMemo(() => {
    const out: string[] = []
    for (const message of messages) {
      if (message.text !== null && out[out.length - 1] !== message.text) out.push(message.text)
    }
    return out
  }, [messages])
  const removed = sessionHook?.((s) => s.removed) as boolean | undefined ?? false

  // Full-history TOC: when the directory opens it asks us to widen the loaded
  // window backwards (loadOlder page by page) until hasMore is false, so every
  // earlier user message shows up in the directory, not just the initial window.
  const hasMore = sessionHook?.((s) => s.hasMore) as boolean | undefined ?? false
  const loadingOlder = sessionHook?.((s) => s.loadingOlder) as boolean | undefined ?? false
  const openState = sessionHook?.((s) => s.openState) as string | undefined ?? ''
  const [widen, setWiden] = useState(false)
  const widenBusyRef = useRef(false)
  const widenPagesRef = useRef(0)
  const requestWiden = useCallback((): void => { setWiden(true) }, [])
  useEffect(() => {
    if (!widen) return
    if (removed || openState !== 'open') { setWiden(false); return }
    if (!hasMore) { setWiden(false); return }
    if (loadingOlder || widenBusyRef.current) return
    if (widenPagesRef.current >= 60) { setWiden(false); return } // safety cap
    widenBusyRef.current = true
    widenPagesRef.current += 1
    void pullOlderPage(sessionId).finally(() => { widenBusyRef.current = false })
  }, [widen, hasMore, loadingOlder, openState, sessionId, removed])

  /** Submitted prompt texts, oldest → newest (per session; append-only). */
  const historyRef = useRef<string[]>([])
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
  const RING_CAP = 200
  const loadRing = (): string[] => {
    try {
      const raw = localStorage.getItem(RING_KEY)
      if (raw === null) return []
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  const saveRing = (history: readonly string[]): void => {
    try {
      localStorage.setItem(RING_KEY, JSON.stringify(history.slice(-RING_CAP)))
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
  // whole ring and persist it after every append.
  useEffect(() => {
    const seen = seenRef.current
    const history = historyRef.current
    const globalOn = getPrefs().globalHistory
    for (const message of messages) {
      if (seen.has(message.seq)) continue
      seen.add(message.seq)
      if (message.text === null) continue
      if (globalOn ? !history.includes(message.text) : history[history.length - 1] !== message.text) {
        history.push(message.text)
      }
    }
    if (globalOn) saveRing(historyRef.current)
  }, [messages])

  // Any draft change that is not our own history write ends the browse
  // session (bash drops the recalled line when you edit it).
  useEffect(() => {
    const browse = browseRef.current
    if (browse.index !== -1 && draft !== browse.lastSet) browseRef.current = RESET_BROWSE
  }, [draft])

  // ---- 历史列表面板 ----
  //
  // 面板状态只有 query 与 highlight 两个字段，刻意不复用 browseRef：浏览历史的
  // effect 会在草稿变化时把 browseRef 重置，若高亮搭在上面会被自己抹掉。
  const activeQuery = (): string => pickerRef.current?.query ?? ''

  /** 把当前命中与高亮刷进浮层。 */
  const paintPicker = (): void => {
    const picker = pickerRef.current
    if (picker === null) return
    const history = historyRef.current
    const hits = matchesOf(history, picker.query)
    const highlight = nextIndex(picker.highlight, 0, hits.length)
    pickerRef.current = { ...picker, highlight }
    showHistoryPanel(
      {
        texts: hits.map((index) => history[index] ?? ''),
        highlight,
        query: picker.query,
        shown: hits.length,
        total: history.length,
      },
      { onPick: pickFromPanel, onDismiss: closePicker },
    )
  }

  const openPicker = (): void => {
    pickerRef.current = { query: '', highlight: 0 }
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
    const history = historyRef.current
    const hits = matchesOf(history, picker.query)
    const at = picker.highlight >= 0 && picker.highlight < hits.length ? picker.highlight : hits.length - 1
    const index = hits[at]
    const text = index === undefined ? undefined : history[index]
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

  /** 鼠标点中某一行：回填该条。 */
  const pickFromPanel = (index: number): void => {
    const picker = pickerRef.current
    if (picker === null) return
    pickerRef.current = { ...picker, highlight: index }
    acceptPicker()
  }

  const setQuery = (query: string): void => {
    const picker = pickerRef.current
    if (picker === null) return
    // 换查询词就回到最新一条，避免停在一个越界的高亮上。
    pickerRef.current = { query, highlight: 0 }
    paintPicker()
  }

  const moveHighlight = (where: 'older' | 'newer' | 'newest' | 'oldest'): void => {
    const picker = pickerRef.current
    if (picker === null) return
    const total = matchesOf(historyRef.current, picker.query).length
    if (total === 0) { paintPicker(); return }
    const next = where === 'newest' ? 0
      : where === 'oldest' ? total - 1
        : nextIndex(picker.highlight, where === 'older' ? 1 : -1, total)
    pickerRef.current = { ...picker, highlight: next }
    paintPicker()
  }
  // History keydown listener (mounts once; reads refs at event time):
  // ↑/↓ browse (bash-style prefix search when the draft is non-empty),
  // Ctrl+R or double Escape for the history list panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target
      if (!isEditorTarget(target)) return
      const card = (target as Element).closest(COMPOSER_CARD)
      if (card === null) return
      // IME composition stays native; the suggestion menu owns the keys.
      if (e.isComposing || e.keyCode === 229) return
      if (card.querySelector(OPEN_MENU) !== null) return
      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return
      // 历史功能被关掉：↑/↓ 与 Ctrl+R 全部交还宿主，不拦截任何键。
      if (!getPrefs().historyEnabled) return
      const history = historyRef.current
      const recall = (index: number): string => history[index] ?? ''
      const prefixMatches = (prefix: string): number[] => {
        const out: number[] = []
        history.forEach((entry, i) => { if (entry.startsWith(prefix)) out.push(i) })
        return out
      }

      // ---- history list panel: Ctrl+R or a double Escape opens it ----
      //
      // 打开后焦点留在输入框：输入过滤、↑↓ 移动高亮、Enter/Tab 回填、Esc 关闭。
      // 宿主 Menu 的方向键行走依赖真实焦点搬进列表（lib/index.js 的 anchored 判断），
      // 与「焦点留输入框」互斥，所以浮层与键盘都自己实现。
      const prefs = getPrefs()
      const panel = pickerRef.current
      const ctrlR = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r'

      if (panel !== null) {
        // 面板已开：所有键都先归它，避免同一次按键既过滤又触发宿主行为。
        if (ctrlR) {
          e.preventDefault(); e.stopPropagation()
          closePicker()
          return
        }
        if (e.key === 'Escape') {
          // 面板无条件先消费 Esc：否则关面板时会连带关掉别的浮层。
          e.preventDefault(); e.stopPropagation()
          closePicker()
          return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault(); e.stopPropagation()
          acceptPicker()
          return
        }
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault(); e.stopPropagation()
          acceptPicker()
          return
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
            closePicker()
            return
          }
          e.preventDefault(); e.stopPropagation()
          moveHighlight(e.key === 'ArrowUp' ? 'older' : e.key === 'ArrowDown' ? 'newer' : e.key === 'Home' ? 'newest' : 'oldest')
          return
        }
        if (e.key === 'Backspace') {
          e.preventDefault(); e.stopPropagation()
          setQuery(activeQuery().slice(0, -1))
          return
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault(); e.stopPropagation()
          setQuery(activeQuery() + e.key)
          return
        }
        // 其余按键（Home 之外的导航、粘贴、快捷键等）先关面板，再交回宿主。
        closePicker()
        return
      }

      // ---- 关闭态：两个入口 ----
      if (ctrlR) {
        if (prefs.historyGesture === 'esc') return
        if (history.length === 0) return
        e.preventDefault(); e.stopPropagation()
        hideSelectionToolbar()
        openPicker()
        return
      }
      // 双击 Esc：手势关闭、历史为空时不认，且任何非 Esc 的键都清零待定状态
      // （Codex 的 primed 取消规则），否则上一次 Esc 会一直挂着等着配对。
      if (e.key !== 'Escape') {
        lastEscapeRef.current = 0
      } else if (prefs.historyGesture !== 'ctrlR' && history.length > 0) {
        const now = performance.now()
        if (isDoubleEscape(lastEscapeRef.current, now)) {
          e.preventDefault(); e.stopPropagation()
          lastEscapeRef.current = 0
          hideSelectionToolbar()
          openPicker()
          return
        }
        // 第一次 Esc 只记时间戳，不消费：单按 Esc 仍要能关掉工具栏等既有浮层。
        lastEscapeRef.current = now
      } else {
        lastEscapeRef.current = 0
      }

      // ---- arrow keys: prefix search (non-empty draft) or plain browse ----
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (history.length === 0) return
      const browse = browseRef.current

      if (e.key === 'ArrowDown' && browse.index === -1) return // native caret-down on the live line

      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'ArrowUp') {
        if (browse.index === -1) {
          const draft = live.draft
          if (draft !== '') {
            // Prefix search: the typed line is the prefix; recall the most
            // recent history entry starting with it (bash history-search-backward).
            const matches = prefixMatches(draft)
            if (matches.length === 0) return // no prefix match: keep the line
            const index = matches[matches.length - 1] ?? 0
            browseRef.current = { index, saved: draft, lastSet: recall(index), prefix: draft }
            live.inputActions.setDraft(recall(index))
          } else {
            // Plain recall: save the live line, recall the newest prompt.
            const index = history.length - 1
            browseRef.current = { index, saved: '', lastSet: recall(index) }
            live.inputActions.setDraft(recall(index))
          }
        } else if (browse.prefix !== undefined) {
          // Walk further back through prefix matches.
          const matches = prefixMatches(browse.prefix)
          const pos = matches.indexOf(browse.index)
          if (pos > 0) {
            const index = matches[pos - 1] ?? 0
            browseRef.current = { ...browse, index, lastSet: recall(index) }
            live.inputActions.setDraft(recall(index))
          }
        } else {
          const index = Math.max(0, browse.index - 1)
          browseRef.current = { ...browse, index, lastSet: recall(index) }
          live.inputActions.setDraft(recall(index))
        }
        return
      }

      // ArrowDown while browsing.
      if (browse.prefix !== undefined) {
        const matches = prefixMatches(browse.prefix)
        const pos = matches.indexOf(browse.index)
        if (pos < matches.length - 1) {
          const index = matches[pos + 1] ?? 0
          browseRef.current = { ...browse, index, lastSet: recall(index) }
          live.inputActions.setDraft(recall(index))
        } else {
          // Bottom edge of the prefix matches: restore the typed prefix.
          browseRef.current = RESET_BROWSE
          live.inputActions.setDraft(browse.saved)
        }
      } else if (browse.index + 1 >= history.length) {
        // Bottom edge: restore the saved live line and stop browsing.
        browseRef.current = RESET_BROWSE
        live.inputActions.setDraft(browse.saved)
      } else {
        const index = browse.index + 1
        browseRef.current = { ...browse, index, lastSet: recall(index) }
        live.inputActions.setDraft(recall(index))
      }
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

  return useSyncExternalStore(subscribePrefs, getPrefs).tocVisible
    ? <ChatToc texts={tocTexts} onWiden={requestWiden} />
    : null
}

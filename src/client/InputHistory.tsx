/**
 * InputHistory: bash-like prompt history + right-click paste for the composer
 * (dsh-prompt-history). Renders nothing — it mounts capture-phase listeners on
 * the document while the session's composer card is live.
 *
 * 核心交互状态机已全部下沉并收敛至 PromptHistoryEngine（纯 TypeScript 深模块），
 * 本组件仅作为纯粹的事件捕获与声明式副作用薄壳。
 */
import { useEffect, useMemo, useRef } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { getPrefs, subscribePrefs } from './prefs.ts'
import {
  flashCopied, hideHistoryPanel, hideSelectionToolbar, showHistoryPanel, showSelectionToolbar,
} from './feedback.ts'
import { relativeAgeOf } from './history-model.ts'
import { T } from './i18n.ts'
import { promptMessage, type PromptMessage } from './nodes.ts'
import {
  COMPOSER_CARD, editorFocused, editorHost, editorSelectedText, editorSelectionOffsets,
  focusEditor, isCaretOnFirstLine, isCaretOnLastLine, isEditorTarget, setEditorCaret,
} from './editor.ts'
import {
  PromptHistoryEngine, type EngineAction, type SearchSnapshot,
} from './history-engine.ts'

/** 相对时间文案：短格式（5m / 3h / 2d），对齐终端紧凑风格。 */
function relativeAgeText(time: number, now: number): string | null {
  const age = relativeAgeOf(time, now)
  if (age === null) return null
  if (age.unit === 'now') return T('history.relative.now')
  const unit = age.unit === 'min' ? 'm' : age.unit === 'hour' ? 'h' : 'd'
  return `${age.value}${unit}`
}

/** Full props of the input-history entry: framework standard kit + owner share. */
export type InputHistoryProps = PropsRuntime<'conversation.input.right'>

/** Suggestions menu query selector: wait for trigger menu before taking Up/Down keys. */
const OPEN_MENU = '[role="listbox"], [data-trigger-menu]'

interface ChatLike {
  nodes?: unknown
  legacy?: { nodes?: unknown }
  order?: readonly string[]
  removed?: boolean
}

type SelectorHook = (select: (snapshot: ChatLike) => unknown) => unknown

/** Pull the ordered node array out of whichever snapshot shape is present across DSH generations. */
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

export function InputHistory(props: InputHistoryProps): null {
  const { useInput, useSession, inputActions, sessionId } = props
  const useChat = (props as InputHistoryProps & { useChat?: unknown }).useChat
  const nodesHook = (typeof useChat === 'function' ? useChat : useSession) as SelectorHook | undefined
  const sessionHook = useSession as SelectorHook | undefined

  const draft = (useInput((s) => s.draft) as string | undefined) ?? ''
  const phase = (useInput((s) => (s as { phase?: unknown }).phase) as string | undefined) ?? ''
  const rawNodes = (nodesHook?.((s: ChatLike) => rawNodesOf(s)) as readonly unknown[] | undefined) ?? []
  const messages = useMemo(
    () => rawNodes.map(promptMessage).filter((m): m is PromptMessage => m !== null),
    [rawNodes],
  )
  const removed = (sessionHook?.((s) => s.removed) as boolean | undefined) ?? false

  const liveRef = useRef({ draft, phase, removed, inputActions })
  liveRef.current = { draft, phase, removed, inputActions }

  // 核心无头引擎实例
  const engineRef = useRef<PromptHistoryEngine | null>(null)
  if (engineRef.current === null) {
    engineRef.current = new PromptHistoryEngine(getPrefs())
  }
  const engine = engineRef.current

  /** 渲染搜索快照到历史浮层 */
  const renderSnapshot = (snapshot: SearchSnapshot): void => {
    const prefs = getPrefs()
    const now = Date.now()
    const entries = snapshot.hits.map((idx) => snapshot.entries[idx])
    showHistoryPanel(
      {
        texts: entries.map((entry) => entry?.text ?? ''),
        ages: prefs.relativeTime
          ? entries.map((entry) => relativeAgeText(entry?.time ?? 0, now))
          : entries.map(() => null),
        highlight: snapshot.highlight,
        query: snapshot.query,
        shown: snapshot.hits.length,
        total: snapshot.entries.length,
      },
      {
        onPick: (index) => applyAction(engine.acceptSearch(index)),
        onDismiss: () => applyAction(engine.cancelSearch()),
      },
    )
  }

  /** 执行引擎产出的声明式动作 */
  const applyAction = (action: EngineAction): void => {
    if (action.type === 'none') return
    if (action.type === 'set-draft') {
      liveRef.current.inputActions.setDraft(action.text)
      hideHistoryPanel()
      requestAnimationFrame(() => {
        const host = editorHost()
        if (host === null) return
        focusEditor(host)
        setEditorCaret(host, action.caret === 'start' ? 0 : action.text.length)
      })
    } else if (action.type === 'show-panel') {
      hideSelectionToolbar()
      renderSnapshot(action.snapshot)
    } else if (action.type === 'hide-panel') {
      hideHistoryPanel()
    } else if (action.type === 'flash-hint') {
      flashCopied(null, T(action.hintKey))
    }
  }

  // 偏好设置更新同步
  useEffect(() => {
    return subscribePrefs(() => {
      engine.updateConfig(getPrefs())
    })
  }, [engine])

  // 会话切换：重置引擎状态
  useEffect(() => {
    engine.switchSession(sessionId)
    hideHistoryPanel()
  }, [engine, sessionId])

  // 消息流进入：吸收并折叠去重
  useEffect(() => {
    engine.ingestMessages(messages)
  }, [engine, messages])

  // 草稿变更驱动：感知用户编辑脱离或差量搜索更新
  useEffect(() => {
    const action = engine.onDraftChange(draft)
    applyAction(action)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  // 键盘事件调度
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target
      if (!isEditorTarget(target)) return
      const card = (target as Element).closest(COMPOSER_CARD)
      if (card === null) return
      if (e.isComposing || e.keyCode === 229) return

      const panelOpen = engine.getMode() === 'searching'
      if (!panelOpen && card.querySelector(OPEN_MENU) !== null) return

      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return

      const host = editorHost()
      const isFirst = host !== null ? isCaretOnFirstLine(host) : true
      const isLast = host !== null ? isCaretOnLastLine(host) : true

      const { handled, action } = engine.onKeyDown({
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        isComposing: false,
        currentDraft: live.draft,
        isCaretOnFirstLine: isFirst,
        isCaretOnLastLine: isLast,
      })

      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
      applyAction(action)
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      hideHistoryPanel()
    }
  }, [engine])

  // Right-click paste (terminal style): a right-click on the composer editor
  // pastes the clipboard directly, like a Linux terminal.
  useEffect(() => {
    const pasteInto = (host: HTMLElement): void => {
      focusEditor(host)
      if (document.execCommand('paste')) return
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
      if (!getPrefs().rightClickPaste) return
      const target = e.target
      if (!isEditorTarget(target)) return
      const host = editorHost()
      if (host === null) return
      const live = liveRef.current
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return
      e.preventDefault()
      e.stopPropagation()
      pasteInto(host)
    }

    document.addEventListener('contextmenu', onContextMenu, true)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [])

  // Copy on select: toolbar / auto / off modes
  useEffect(() => {
    let timer: number | undefined
    let dragStartedInEditor = false

    const copyText = (text: string, quote: boolean): void => {
      const live = liveRef.current
      if (quote) {
        const quoted = text
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n\n'
        const base = live.draft
        const next = base === '' ? quoted : base.endsWith('\n') ? `${base}${quoted}` : `${base}\n\n${quoted}`
        live.inputActions.setDraft(next)
        flashCopied(null, T('pill.quoted'))
        return
      }
      void navigator.clipboard.writeText(text).then(
        () => { flashCopied(null, T('pill.copied')) },
        () => {
          try {
            document.execCommand('copy')
            flashCopied(null, T('pill.copied'))
          } catch { /* copy failed */ }
        },
      )
    }

    const stabilize = (): void => {
      const mode = getPrefs().copyMode
      if (mode === 'off') {
        hideSelectionToolbar()
        return
      }
      const sel = document.getSelection()
      if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
        hideSelectionToolbar()
        return
      }
      const text = sel.toString().trim()
      if (text === '') {
        hideSelectionToolbar()
        return
      }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        hideSelectionToolbar()
        return
      }

      if (mode === 'auto') {
        hideSelectionToolbar()
        copyText(text, false)
        return
      }

      // toolbar 模式：传入选区 rect 与 onQuote 回调（复制内置于按钮内）
      showSelectionToolbar(
        rect,
        () => {
          hideSelectionToolbar()
          copyText(text, true)
        },
      )
    }

    const onSelectionChange = (): void => {
      if (getPrefs().copyMode === 'off') return
      window.clearTimeout(timer)
      timer = window.setTimeout(stabilize, 150)
    }

    const onMouseDown = (e: MouseEvent): void => {
      dragStartedInEditor = isEditorTarget(e.target)
    }

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

/**
 * InputHistory: bash-like prompt history + right-click paste for the composer
 * (dsh-prompt-history). Renders nothing — it mounts capture-phase listeners on
 * the document while the session's composer card is live.
 *
 * 核心交互状态机已全部下沉至 PromptHistoryEngine（纯 TypeScript 深模块），
 * 浮层 DOM 渲染由 HistoryOverlayController 接管。本模块采用 Coordinator 模式，
 * 拆解为 3 个单一职责的正交 Hooks，消灭发散式变化坏味道。
 */
import { useEffect, useMemo, useRef } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { getPrefs, subscribePrefs } from './prefs.ts'
import {
  flashCopied, hideSelectionToolbar, showSelectionToolbar,
} from './feedback.ts'
import {
  HistoryOverlayController,
  type HistoryPanelView,
} from './history-overlay.ts'
import { relativeAgeText } from './history-model.ts'
import { T } from './i18n.ts'
import { promptMessage, type PromptMessage } from './nodes.ts'
import {
  COMPOSER_CARD, editorHost, editorSelectionOffsets,
  focusEditor, isCaretOnFirstLine, isCaretOnLastLine, isEditorTarget, setEditorCaret,
} from './editor.ts'
import {
  PromptHistoryEngine, type EngineAction, type SearchSnapshot,
} from './history-engine.ts'

/** Full props of the input-history entry: framework standard kit + owner share. */
export type InputHistoryProps = PropsRuntime<'conversation.input.right'>

/** Suggestions menu query selector: wait for trigger menu before taking Up/Down keys. */
const OPEN_MENU = '[role="listbox"], [data-trigger-menu]'

/** DSH 0.2.0-rc.2 现代 Chat 视图快照契约。 */
interface ChatSnapshot {
  readonly order?: readonly string[]
  readonly nodes?: { get?: (key: string) => unknown }
  readonly legacy?: { readonly nodes?: readonly unknown[] }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    chat: ChatSnapshot
  }
}

/** 实时活跃编辑上下文，供全局事件监听器安全读取防闭包过期。 */
export interface LiveEditorContext {
  draft: string
  phase: string
  removed: boolean
  inputActions: { setDraft: (text: string) => void }
}

/**
 * Hook 1: 划词复制/引用工具栏交互（支持 auto / toolbar / off 模式）。
 */
function useSelectionCopyToolbar(liveRef: React.RefObject<LiveEditorContext>): void {
  useEffect(() => {
    let timer: number | undefined

    const copyText = (text: string, quote: boolean): void => {
      const live = liveRef.current
      if (live === null) return
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

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hideSelectionToolbar()
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Element && e.target.closest('.dsh-ph-toolbar') !== null) return
      hideSelectionToolbar()
    }
    const onScroll = (): void => { hideSelectionToolbar() }

    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', hideSelectionToolbar)

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', hideSelectionToolbar)
      window.clearTimeout(timer)
      hideSelectionToolbar()
    }
  }, [liveRef])
}

/**
 * Hook 2: 终端风格鼠标右键直接粘贴。
 */
function useRightClickPaste(liveRef: React.RefObject<LiveEditorContext>): void {
  useEffect(() => {
    const pasteInto = (host: HTMLElement): void => {
      focusEditor(host)
      if (document.execCommand('paste')) return
      void navigator.clipboard.readText().then(
        (text) => {
          if (text === '') return
          const live = liveRef.current
          if (live === null) return
          const sel = editorSelectionOffsets(host)
          const start = sel?.start ?? live.draft.length
          const end = sel?.end ?? start
          const draft = live.draft
          const next = draft.slice(0, start) + text + draft.slice(end)
          live.inputActions.setDraft(next)
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
      if (live === null) return
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return
      e.preventDefault()
      e.stopPropagation()
      pasteInto(host)
    }

    document.addEventListener('contextmenu', onContextMenu, true)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [liveRef])
}

/**
 * Hook 3: 提示词历史键盘事件调度与引擎动作派发。
 */
function usePromptHistoryHotkeys(params: {
  engine: PromptHistoryEngine
  liveRef: React.RefObject<LiveEditorContext>
  overlay: HistoryOverlayController
  applyAction: (action: EngineAction) => void
}): void {
  const { engine, liveRef, overlay, applyAction } = params

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target
      if (!isEditorTarget(target)) return
      const card = (target as Element).closest(COMPOSER_CARD)
      if (card === null) return
      if (e.isComposing || e.keyCode === 229) return
      if (card.querySelector('[data-composer-composing]') !== null) return

      const panelOpen = overlay.isOpen() || engine.getMode() === 'searching'
      if (!panelOpen && card.querySelector(OPEN_MENU) !== null) return

      const live = liveRef.current
      if (live === null) return
      if (live.phase === 'adjudicating' || live.phase === 'submitting' || live.removed) return

      const host = editorHost()
      const isFirst = host !== null ? isCaretOnFirstLine(host, live.draft) : true
      const isLast = host !== null ? isCaretOnLastLine(host, live.draft) : true

      // 键盘提交感知：用户按下 Enter 或 Ctrl/Cmd+Enter 发送非空草稿时即刻无损入库（含斜杠命令原型重构）
      const isEnterSubmit = e.key === 'Enter' && !e.shiftKey && !e.altKey
      if (isEnterSubmit && !panelOpen && card.querySelector(OPEN_MENU) === null && live.draft.trim() !== '') {
        const chip = card.querySelector<HTMLElement>('[data-composer-chip]')
        const cmd = chip?.getAttribute('data-composer-chip')
        const fullPrompt = cmd && cmd.trim() !== '' ? `/${cmd.trim()} ${live.draft.trim()}` : live.draft
        engine.recordPrompt(fullPrompt)
      }

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
      overlay.hide()
    }
  }, [engine, overlay, applyAction, liveRef])
}

export function InputHistory(props: InputHistoryProps): null {
  const { useInput, useSession, useConversation, inputActions, sessionId } = props

  const draft = (useInput((s) => s.draft) as string | undefined) ?? ''
  const phase = (useInput((s) => (s as { phase?: unknown }).phase) as string | undefined) ?? ''
  const chat = useConversation?.((c) => c?.views.get('chat'))
  const rawNodes = useMemo(() => {
    if (chat === undefined) return []
    // 优先从 order + nodes.get 提取
    if (Array.isArray(chat.order) && typeof chat.nodes?.get === 'function') {
      const fromOrder = chat.order
        .map((key) => chat.nodes?.get?.(key))
        .filter((n): n is unknown => n !== null && n !== undefined)
      if (fromOrder.length > 0) return fromOrder
    }
    // 次选从 legacy.nodes 提取（当 order 尚未投影或为空时）
    if (Array.isArray(chat.legacy?.nodes) && chat.legacy.nodes.length > 0) {
      return [...chat.legacy.nodes]
    }
    return []
  }, [chat])
  const messages = useMemo(
    () => rawNodes.map(promptMessage).filter((m): m is PromptMessage => m !== null),
    [rawNodes],
  )
  const removed = (useSession((s) => s.removed) as boolean | undefined) ?? false

  const liveRef = useRef<LiveEditorContext>({ draft, phase, removed, inputActions })
  liveRef.current = { draft, phase, removed, inputActions }

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // 记录最近一次非空草稿，用于鼠标点击发送或快捷键提交时的零延迟沉淀（实时识别并融合斜杠命令原型）
  const lastNonEmptyDraftRef = useRef(draft)
  if (draft.trim() !== '') {
    const card = typeof document !== 'undefined' ? document.querySelector<HTMLElement>(COMPOSER_CARD) : null
    const chip = card?.querySelector<HTMLElement>('[data-composer-chip]')
    const cmd = chip?.getAttribute('data-composer-chip')
    const full = cmd && cmd.trim() !== '' && !draft.startsWith('/') ? `/${cmd.trim()} ${draft.trim()}` : draft
    lastNonEmptyDraftRef.current = full
  }

  // 浮层控制器深模块实例
  const overlayRef = useRef<HistoryOverlayController | null>(null)
  if (overlayRef.current === null) {
    overlayRef.current = new HistoryOverlayController()
  }
  const overlay = overlayRef.current

  // 核心无头引擎实例
  const engineRef = useRef<PromptHistoryEngine | null>(null)
  if (engineRef.current === null) {
    engineRef.current = new PromptHistoryEngine(getPrefs())
  }
  const engine = engineRef.current

  // 提交态跃迁监听：当 phase 变为 submitting/adjudicating 时，全渠道捕获用户提交（涵盖鼠标点击发送按钮）
  const prevPhaseRef = useRef(phase)
  useEffect(() => {
    const prev = prevPhaseRef.current
    const isNowSubmitting =
      (phase === 'submitting' || phase === 'adjudicating') &&
      prev !== 'submitting' &&
      prev !== 'adjudicating'

    if (isNowSubmitting) {
      const text = lastNonEmptyDraftRef.current
      if (text.trim() !== '') {
        const card = document.querySelector<HTMLElement>(COMPOSER_CARD)
        const chip = card?.querySelector<HTMLElement>('[data-composer-chip]')
        const cmd = chip?.getAttribute('data-composer-chip')
        const fullPrompt = cmd && cmd.trim() !== '' ? `/${cmd.trim()} ${text.trim()}` : text
        engine.recordPrompt(fullPrompt)
      }
    }
    prevPhaseRef.current = phase
  }, [phase, engine])

  /** 渲染搜索快照到历史浮层 */
  const renderSnapshot = (snapshot: SearchSnapshot): void => {
    const prefs = getPrefs()
    const now = Date.now()
    const entries = snapshot.hits.map((idx) => snapshot.entries[idx])
    overlay.render(
      {
        texts: entries.map((entry) => entry?.text ?? ''),
        ages: prefs.relativeTime
          ? entries.map((entry) => relativeAgeText(entry?.time ?? 0, now, T))
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
      overlay.hide()
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
      overlay.hide()
    } else if (action.type === 'flash-hint') {
      flashCopied(null, T(action.hintKey))
    }
  }

  // 组件卸载时释放浮层资源
  useEffect(() => {
    return () => {
      overlay.destroy()
    }
  }, [overlay])

  // 偏好设置更新同步
  useEffect(() => {
    return subscribePrefs(() => {
      engine.updateConfig(getPrefs())
    })
  }, [engine])

  // 会话切换：重置引擎状态并关闭浮层
  useEffect(() => {
    engine.switchSession(sessionId)
    overlay.hide()
  }, [engine, sessionId, overlay])

  // 消息流实时响应式吸收与平滑继承：只要宿主消息就绪，立即执行吸收与旧版继承
  useEffect(() => {
    if (messages.length > 0) {
      engine.inheritLegacyGlobalIfEligible(true)
      engine.supplementMessages(messages)
    }
  }, [engine, messages])

  // 会话被归档删除时，清理对应会话的持久化历史
  useEffect(() => {
    if (removed && sessionId) {
      engine.cleanupSession(sessionId)
    }
  }, [engine, removed, sessionId])

  // 周期性旧消息巡检补充：每 1500ms 独立兜底巡检视口滚动加载的旧历史
  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentMsgs = messagesRef.current
      if (currentMsgs.length > 0) {
        engine.supplementMessages(currentMsgs)
      }
    }, 1500)

    return () => {
      window.clearInterval(timer)
    }
  }, [engine])

  // 草稿变更驱动：感知用户编辑脱离或差量搜索更新
  useEffect(() => {
    const action = engine.onDraftChange(draft)
    applyAction(action)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  // 挂载 3 个单一职责的正交 Hooks
  usePromptHistoryHotkeys({ engine, liveRef, overlay, applyAction })
  useRightClickPaste(liveRef)
  useSelectionCopyToolbar(liveRef)

  return null
}

/**
 * Transient DOM feedback for dsh-prompt-history: the copied pill and the
 * floating copy toolbar shown above a selection in 'toolbar' copy mode.
 * Vanilla DOM (no React) so both can be driven from event handlers.
 */
import { T } from './i18n.ts'

/** Copy the current document selection via execCommand, clipboard API fallback. */
function copyDocumentSelection(): boolean {
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  if (ok) return true
  const sel = document.getSelection()
  const text = sel !== null && !sel.isCollapsed ? sel.toString() : ''
  if (text === '') return false
  navigator.clipboard.writeText(text).catch((error) => {
    console.warn('[dsh-prompt-history] clipboard copy failed:', error)
  })
  return true
}

/** A brief feedback pill (已复制 / 已引用 …) above the given rect. */
export function flashCopied(rect?: DOMRect | null, text?: string): void {
  const label = text ?? T('pill.copied')
  let x = 8
  let y = 8
  if (rect !== undefined && rect !== null && (rect.width > 0 || rect.height > 0)) {
    x = Math.max(4, Math.min(rect.left, window.innerWidth - 90))
    y = Math.max(4, rect.top - 26)
  }
  const pill = document.createElement('div')
  pill.textContent = label
  pill.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:2147483000;` +
    'padding:3px 8px;border-radius:6px;pointer-events:none;' +
    'background:var(--dsw-specific-tip);border:1px solid var(--dsw-alias-border-l1);' +
    'color:var(--dsw-alias-label-primary);font:12px system-ui,sans-serif;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.2);'
  document.body.appendChild(pill)
  window.setTimeout(() => { pill.remove() }, 800)
}

const BAR_CLASS = 'dsh-ph-toolbar'
let bar: HTMLDivElement | null = null

function ensureToolbarStyle(): void {
  if (document.querySelector('style[data-plugin-css="dsh-ph-toolbar"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'dsh-ph-toolbar'
  tag.textContent = [
    `.${BAR_CLASS}{position:fixed;z-index:2147483000;display:flex;align-items:center;padding:4px;`,
    'border-radius:8px;background:var(--dsw-specific-menu);',
    'border:1px solid var(--dsw-alias-border-l1);box-shadow:0 4px 16px rgba(0,0,0,.25);}',
    `.${BAR_CLASS} button{border:0;border-radius:6px;padding:4px 12px;font-size:12px;line-height:1.4;cursor:pointer;`,
    'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
    `.${BAR_CLASS} button:hover{background:var(--dsw-alias-bg-layer-3);}`,
  ].join('')
  document.head.appendChild(tag)
}

/** Hide the copy toolbar (idempotent). */
export function hideSelectionToolbar(): void {
  if (bar !== null) {
    bar.remove()
    bar = null
  }
}

/**
 * Show the floating selection toolbar above the selection rect: 复制 copies
 * the current document selection; 引用 (when a handler is given) hands the
 * selection to the caller for insertion into the composer as a quote. Mousedown
 * is suppressed so the selection survives the click.
 * @param rect - the selection's bounding rect (toolbar sits above it).
 * @param onQuote - quote handler; renders the 引用 button only when provided.
 */
export function showSelectionToolbar(rect: DOMRect, onQuote?: () => void): void {
  ensureToolbarStyle()
  hideSelectionToolbar()
  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.textContent = T('toolbar.copy')
  copyButton.addEventListener('mousedown', (e) => { e.preventDefault() }) // keep the selection
  copyButton.addEventListener('click', () => {
    const copied = copyDocumentSelection()
    hideSelectionToolbar()
    if (copied) flashCopied(rect)
  })
  const el = document.createElement('div')
  el.className = BAR_CLASS
  el.appendChild(copyButton)
  if (onQuote !== undefined) {
    const quoteButton = document.createElement('button')
    quoteButton.type = 'button'
    quoteButton.textContent = T('toolbar.quote')
    quoteButton.addEventListener('mousedown', (e) => { e.preventDefault() }) // keep the selection
    quoteButton.addEventListener('click', () => {
      hideSelectionToolbar()
      onQuote()
    })
    el.appendChild(quoteButton)
  }
  const W = onQuote !== undefined ? 116 : 64
  const H = 30
  const x = Math.max(4, Math.min(rect.left + rect.width / 2 - W / 2, window.innerWidth - W - 4))
  const y = Math.max(4, rect.top - H - 4)
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  document.body.appendChild(el)
  bar = el
}


// ---- history list panel (double Escape / Ctrl+R before 2.2) ----

const HISTORY_CLASS = 'dsh-ph-history'
const HISTORY_MAX_ROWS = 200
/** 相对时间列宽（右对齐，Claude Code AGE_WIDTH=8）。 */
const AGE_WIDTH = 8

interface HistoryPanelView {
  /** 命中条目的文本，按展示顺序排列。 */
  readonly texts: readonly string[]
  /** 每行的相对时间文案；null 表示不显示（时间未知或设置关闭）。 */
  readonly ages: readonly (string | null)[]
  /** 高亮项在 texts 里的下标；-1 表示没有高亮。 */
  readonly highlight: number
  /** 过滤词；空串表示未过滤。 */
  readonly query: string
  /** 命中条数与历史总条数，用于底部提示。 */
  readonly shown: number
  /** 历史总条数。 */
  readonly total: number
}

interface HistoryPanelRefs {
  /** 鼠标点中的下标；键盘与点击两条路径共用同一个提交入口。 */
  readonly onPick: (index: number) => void
  readonly onDismiss: () => void
}

let historyPanel: HTMLDivElement | null = null
let historyList: HTMLDivElement | null = null
let historyFoot: HTMLDivElement | null = null
let historyPreview: HTMLDivElement | null = null
let historyRefs: HistoryPanelRefs | null = null

/** Remove the history list panel and detach its outside-click listener (idempotent). */
export function hideHistoryPanel(): void {
  if (historyPanel !== null) {
    document.removeEventListener('pointerdown', onHistoryOutsidePointer, true)
    historyPanel.remove()
    historyPanel = null
  }
  historyList = null
  historyFoot = null
  historyPreview = null
  historyRefs = null
}

/** Close the panel when a pointer lands outside both it and the composer. */
function onHistoryOutsidePointer(e: PointerEvent): void {
  if (!(e.target instanceof Node)) return
  if (historyPanel?.contains(e.target) === true) return
  const card = document.querySelector('[data-composer-card]')
  if (card !== null && e.target instanceof Node && card.contains(e.target)) return
  historyRefs?.onDismiss()
}

const PANEL_CSS = 'position:fixed;z-index:2147483000;' +
  'left:50%;transform:translateX(-50%);' +
  'width:min(640px, calc(100vw - 24px));border-radius:10px;overflow:hidden;' +
  'background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l1);' +
  'box-shadow:0 8px 28px rgba(0,0,0,.28);'

/** Anchor the panel above the composer card, clamped inside the viewport. */
function placeHistoryPanel(el: HTMLElement): void {
  const card = document.querySelector('[data-composer-card]')
  const rect = card instanceof HTMLElement ? card.getBoundingClientRect() : null
  if (rect === null) {
    el.style.top = '8px'
    return
  }
  const h = el.offsetHeight || 240
  const above = rect.top - h - 6
  // 输入框上方放不下时改放下方，两种情况都夹在视口内。
  const top = above >= 8 ? above : Math.min(rect.bottom + 6, window.innerHeight - h - 8)
  el.style.top = `${Math.max(8, Math.min(top, window.innerHeight - h - 8))}px`
}

/** Highlight every occurrence of the query inside one entry. */
function paintHighlighted(host: HTMLElement, text: string, query: string): void {
  if (query === '') {
    host.textContent = text
    return
  }
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  let cursor = 0
  let hit = lower.indexOf(needle)
  while (hit >= 0) {
    if (hit > cursor) host.append(text.slice(cursor, hit))
    const mark = document.createElement('mark')
    mark.textContent = text.slice(hit, hit + needle.length)
    host.append(mark)
    cursor = hit + needle.length
    hit = lower.indexOf(needle, cursor)
  }
  host.append(text.slice(cursor))
}

const ROW_CSS = 'display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;' +
  'padding:7px 12px;border:0;background:transparent;cursor:pointer;font:13px/1.45 inherit;' +
  'color:var(--dsw-alias-label-secondary);border-left:2px solid transparent;'

const ROW_ACTIVE_CSS = 'background:var(--dsw-specific-menu-hover);color:var(--dsw-alias-label-primary);' +
  'border-left-color:var(--dsw-static-blue-500);'

const AGE_CSS = 'flex:none;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;' +
  `min-width:${AGE_WIDTH}ch;text-align:right;color:var(--dsw-alias-label-tertiary);`

const ROW_TEXT_CSS = 'min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'

/** 宽屏阈值：Claude Code 终端列数 ≥100，web 用像素近似。 */
const WIDE_MIN_PX = 1000
/** 预览最多行数，对齐 Claude Code PREVIEW_ROWS=6。 */
const PREVIEW_ROWS = 6

/**
 * Open the history list above the composer card.
 *
 * 只做渲染与鼠标交互：键盘（过滤、移动、回填、关闭）在 InputHistory.tsx 里处理，
 * 因为焦点必须留在输入框，宿主 Menu 的方向键行走（依赖真实焦点）用不上。
 * 列表按最新在顶渲染；宽屏（≥1000px）时右侧显示高亮条目的完整内容预览。
 *
 * @param view - 命中文本、相对时间、高亮位置与计数。
 * @param refs - 提交与关闭回调。
 */
export function showHistoryPanel(view: HistoryPanelView, refs: HistoryPanelRefs): void {
  if (historyPanel === null) {
    const el = document.createElement('div')
    el.className = HISTORY_CLASS
    el.style.cssText = PANEL_CSS
    el.setAttribute('role', 'listbox')
    const body = document.createElement('div')
    body.style.cssText = 'display:flex;align-items:stretch;'
    const list = document.createElement('div')
    list.style.cssText = 'flex:1 1 0;min-width:0;max-height:240px;overflow-y:auto;overscroll-behavior:contain;'
    list.setAttribute('role', 'presentation')
    const preview = document.createElement('div')
    preview.className = 'dsh-ph-history-preview'
    preview.style.cssText = 'display:none;flex:1 1 0;min-width:0;max-height:240px;overflow-y:auto;' +
      'padding:7px 12px;border-left:1px solid var(--dsw-alias-border-l2);' +
      'font:12.5px/1.6 inherit;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;' +
      'word-break:break-word;'
    body.append(list, preview)
    const foot = document.createElement('div')
    foot.style.cssText = 'padding:5px 12px;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;' +
      'color:var(--dsw-alias-label-tertiary);border-top:1px solid var(--dsw-alias-border-l2);'
    el.append(body, foot)
    document.body.appendChild(el)
    historyPanel = el
    historyList = list
    historyFoot = foot
    historyPreview = preview
    document.addEventListener('pointerdown', onHistoryOutsidePointer, true)
  }
  const el = historyPanel
  const list = historyList
  const foot = historyFoot
  const preview = historyPreview
  if (el === null || list === null || foot === null || preview === null) return
  historyRefs = refs

  list.replaceChildren()
  const rows = view.texts.slice(0, HISTORY_MAX_ROWS)
  rows.forEach((text, i) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.id = `${HISTORY_CLASS}-row-${i}`
    row.setAttribute('role', 'option')
    row.setAttribute('aria-selected', i === view.highlight ? 'true' : 'false')
    row.style.cssText = ROW_CSS + (i === view.highlight ? ROW_ACTIVE_CSS : '')
    row.title = text
    const age = view.ages[i]
    if (age !== null && age !== undefined && age !== '') {
      const ageEl = document.createElement('span')
      ageEl.style.cssText = AGE_CSS
      ageEl.textContent = age
      row.appendChild(ageEl)
    }
    const textEl = document.createElement('span')
    textEl.style.cssText = ROW_TEXT_CSS
    paintHighlighted(textEl, text, view.query)
    row.appendChild(textEl)
    row.addEventListener('click', () => { historyRefs?.onPick(i) })
    list.appendChild(row)
  })
  if (view.highlight >= 0) el.setAttribute('aria-activedescendant', `${HISTORY_CLASS}-row-${view.highlight}`)
  else el.removeAttribute('aria-activedescendant')

  foot.textContent = view.shown === 0
    ? T('history.noMatch')
    : `${view.shown} / ${view.total}　${T('history.hint')}`

  // 宽屏右侧预览：显示高亮条目的完整文本，超过 6 行截断 + 「… +N more lines」。
  preview.style.display = window.innerWidth >= WIDE_MIN_PX ? 'block' : 'none'
  preview.replaceChildren()
  if (view.highlight >= 0 && view.highlight < rows.length) {
    const text = rows[view.highlight] ?? ''
    const lines = text.split('\n')
    const shown = lines.slice(0, PREVIEW_ROWS)
    preview.textContent = shown.join('\n')
    if (lines.length > PREVIEW_ROWS) {
      preview.append(`\n… +${lines.length - PREVIEW_ROWS} ${T('history.moreLines')}`)
    }
  }

  placeHistoryPanel(el)
  // 高亮项滚进可视区，但不抢焦点。
  const active = list.querySelector(`#${HISTORY_CLASS}-row-${view.highlight}`)
  if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' })
}

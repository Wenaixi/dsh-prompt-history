/**
 * Composer editor abstraction for dsh-prompt-history.
 *
 * DSH ≤ 0.1.1: the composer input is a <textarea> inside
 * `[data-composer-card]` — selections/carets read off selectionStart/End.
 * DSH ≥ 0.1.2: the composer input is a Lexical contenteditable host
 * (`[data-composer-input]`); draft writes still flow through
 * `inputActions.setDraft`, and caret/selection read off the DOM Selection.
 * Everything editor-shaped goes through this module so both hosts behave the
 * same from the plugin's point of view.
 */

export const COMPOSER_CARD = '[data-composer-card]'
/** The rc.1 Lexical contenteditable host attribute. */
const EDITOR_HOST = '[data-composer-input]'

/** The composer editor host (textarea on old DSH, contenteditable on new), if any. */
export function editorHost(): HTMLTextAreaElement | HTMLElement | null {
  const card = document.querySelector<HTMLElement>(COMPOSER_CARD)
  if (card === null) return null
  const textarea = card.querySelector<HTMLTextAreaElement>('textarea')
  if (textarea !== null) return textarea
  return card.querySelector<HTMLElement>(EDITOR_HOST)
}

/** Is the event target the composer editor (the host or a node inside it)? */
export function isEditorTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(COMPOSER_CARD) === null) return false
  if (target instanceof HTMLTextAreaElement) return true
  return target.closest(EDITOR_HOST) !== null
}

/** Whether the composer editor currently holds focus. */
export function editorFocused(): boolean {
  const host = editorHost()
  return host !== null && document.activeElement === host
}

/** The editor host's current plain text (its own content, not the draft mirror). */
export function editorText(host: HTMLTextAreaElement | HTMLElement): string {
  if (host instanceof HTMLTextAreaElement) return host.value
  return host.textContent ?? ''
}

/**
 * Text offset of a DOM Selection endpoint within a contenteditable host's
 * textContent (document-order text-node walk). Lexical decorations (chips)
 * are stripped by using the node's text; plain drafts map 1:1 to draft text.
 */
function hostOffsetOf(host: HTMLElement, node: Node, offset: number): number {
  if (node === host) return offset // collapsed at the host boundary
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  let acc = 0
  let current: Node | null = walker.nextNode()
  while (current !== null) {
    if (current === node) return acc + Math.min(offset, (current.textContent ?? '').length)
    acc += (current.textContent ?? '').length
    current = walker.nextNode()
  }
  return acc
}

/** Focus the editor host without scrolling (textarea or contenteditable). */
export function focusEditor(host: HTMLTextAreaElement | HTMLElement): void {
  host.focus({ preventScroll: true })
}

/**
 * The editor's selection as draft-text offsets [start, end), or null when the
 * editor is not the active selection owner. Exact on a textarea; best-effort
 * on the contenteditable (maps the DOM Selection through its text content).
 */
export function editorSelectionOffsets(host: HTMLTextAreaElement | HTMLElement): { start: number; end: number } | null {
  if (host instanceof HTMLTextAreaElement) {
    if (document.activeElement !== host) return null
    const start = host.selectionStart ?? 0
    const end = host.selectionEnd ?? start
    return { start, end }
  }
  if (document.activeElement !== host) {
    const hostNode = host.contains(document.activeElement) ? document.activeElement : null
    if (hostNode === null) return null
  }
  const sel = document.getSelection()
  if (sel === null || sel.rangeCount === 0) return null
  const { anchorNode, anchorOffset, focusNode, focusOffset } = sel
  if (anchorNode === null || focusNode === null) return null
  const inHost = (n: Node): boolean => n === host || host.contains(n)
  if (!inHost(anchorNode) || !inHost(focusNode)) return null
  const start = hostOffsetOf(host, anchorNode, anchorOffset)
  const end = hostOffsetOf(host, focusNode, focusOffset)
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

/** The editor's selected text ('' when there is no selection inside it). */
export function editorSelectedText(host: HTMLTextAreaElement | HTMLElement): string {
  if (host instanceof HTMLTextAreaElement) {
    if (document.activeElement !== host) return ''
    const start = host.selectionStart ?? 0
    const end = host.selectionEnd ?? start
    return end > start ? host.value.slice(start, end) : ''
  }
  const sel = document.getSelection()
  if (sel === null || sel.isCollapsed || sel.rangeCount === 0) return ''
  const anchorNode = sel.anchorNode
  if (anchorNode === null || !host.contains(anchorNode)) return ''
  return sel.toString()
}

/**
 * 光标在 contenteditable 里的行号（0 起）。
 *
 * Lexical 的多行文本不是 `\n` 而是 `<br>` 元素（实测 `textContent` 挤成一行），
 * 所以不能靠换行符判断行。做法：把「host 开头 → 光标锚点」克隆成 fragment，
 * 数里面有几个 `<br>`，那就是光标所在行。锚点在空段落占位 `<br>` 之后或直接
 * 挂在 host 边界时该段一个 `<br>` 都没有，行号就是 0（第一行）——空输入框因此
 * 也能被 ↑ 接管（这正是「空框调出历史」的核心路径）。
 */
function contentEditableCaretLine(host: HTMLElement): number {
  const sel = document.getSelection()
  if (sel === null || sel.rangeCount === 0) return 0
  const anchor = sel.anchorNode
  if (anchor === null || !host.contains(anchor)) return 0
  if (anchor === host) return 0 // 空内容边界上的光标：第一行
  const range = document.createRange()
  range.selectNodeContents(host)
  try {
    range.setEnd(anchor, sel.anchorOffset)
  } catch {
    return 0
  }
  const fragment = range.cloneContents()
  return fragment.querySelectorAll('br').length
}

/**
 * contenteditable 里的总行数。
 *
 * 每行之间是一个 `<br>`，所以 `行数 = <br> 数 + 1`；唯一的例外是整个编辑器
 * 只有一个空段落占位 `<br>`（Lexical 的空输入框结构）时仍是 1 行。
 */
function contentEditableLineCount(host: HTMLElement): number {
  const brs = host.querySelectorAll('br').length
  if ((host.textContent ?? '') === '' && brs === 1) return 1
  return brs + 1
}

/** Whether the caret sits on the first line of the draft (or the draft is single-line). */
export function isCaretOnFirstLine(host: HTMLTextAreaElement | HTMLElement): boolean {
  if (host instanceof HTMLTextAreaElement) {
    const text = editorText(host)
    const firstBreak = text.indexOf('\n')
    if (firstBreak === -1) return true
    return editorCaretOffset(host) <= firstBreak
  }
  return contentEditableCaretLine(host) === 0
}

/** Whether the caret sits on the last line of the draft (or the draft is single-line). */
export function isCaretOnLastLine(host: HTMLTextAreaElement | HTMLElement): boolean {
  if (host instanceof HTMLTextAreaElement) {
    const text = editorText(host)
    const lastBreak = text.lastIndexOf('\n')
    if (lastBreak === -1) return true
    return editorCaretOffset(host) > lastBreak
  }
  return contentEditableCaretLine(host) === contentEditableLineCount(host) - 1
}

/** The editor caret's offset into the draft text. */
function editorCaretOffset(host: HTMLTextAreaElement | HTMLElement): number {
  if (host instanceof HTMLTextAreaElement) {
    return host.selectionStart ?? 0
  }
  return editorSelectionOffsets(host)?.start ?? 0
}

/**
 * Move the editor caret to a draft-text offset (used to park the caret after
 * an insertion). Exact on a textarea; best-effort collapse on the
 * contenteditable (falls back to leaving the caret wherever the editor put it).
 */
export function setEditorCaret(host: HTMLTextAreaElement | HTMLElement, offset: number): void {
  if (host instanceof HTMLTextAreaElement) {
    const clamp = Math.max(0, Math.min(offset, host.value.length))
    host.setSelectionRange(clamp, clamp)
    return
  }
  // Collapse the DOM selection inside the host after `offset` text characters.
  const target = Math.max(0, Math.min(offset, (host.textContent ?? '').length))
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  let acc = 0
  let node: Node | null = walker.nextNode()
  while (node !== null) {
    const len = (node.textContent ?? '').length
    if (acc + len >= target) {
      try {
        const range = document.createRange()
        range.setStart(node, Math.min(target - acc, len))
        range.collapse(true)
        const sel = document.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      } catch { /* structure edge: leave the caret alone */ }
      return
    }
    acc += len
    node = walker.nextNode()
  }
}

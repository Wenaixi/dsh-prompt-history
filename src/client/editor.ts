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
  if (host === null) return false
  const active = document.activeElement
  return active === host || (active !== null && host.contains(active))
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
  const { anchorNode, focusNode } = sel
  if (anchorNode === null || focusNode === null) return ''
  if (!host.contains(anchorNode) || !host.contains(focusNode)) return ''
  return sel.toString()
}

/**
 * 检查 Range 容器内是否存在 <br> 换行符。
 */
function hasBrInRange(container: Node, startOffset: number, endNode: Node, endOffset: number): boolean {
  try {
    const range = document.createRange()
    range.setStart(container, startOffset)
    range.setEnd(endNode, endOffset)
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT)
    let el = walker.nextNode()
    while (el !== null) {
      if (el.nodeName === 'BR' && range.intersectsNode(el)) return true
      el = walker.nextNode()
    }
    return false
  } catch {
    return false
  }
}

/**
 * 光标是否位于 contenteditable 编辑器的第一逻辑行。
 *
 * Lexical 的换行模型有两种：
 * 1. 硬回车生成兄弟段落 <p>（非空段落内部没有 <br>）；
 * 2. 软换行（Shift+Enter）在段落内插入 <br>。
 *
 * 判定依据：
 * - 若有块级段落（firstElementChild 存在），光标必须位于首个块级子元素内部，且在光标前没有 <br> 软换行；
 * - 若光标停在 host 根节点边界（空内容），也视为第一行；
 * - 若无块级子元素（平铺结构），则检查 host 开头到光标之间是否有 <br>。
 */
function isContentEditableCaretFirstLine(host: HTMLElement): boolean {
  const sel = document.getSelection()
  if (sel === null || sel.rangeCount === 0) return true
  const anchor = sel.anchorNode
  if (anchor === null || !host.contains(anchor) || anchor === host) return true

  const firstBlock = host.firstElementChild
  if (firstBlock !== null) {
    // 若光标不在首个块级元素内部，绝对不是第一行（例如在第 2 段）
    if (!firstBlock.contains(anchor)) return false
    // 若在首个块内，检查首块起点到当前光标之间是否有软换行 <br>
    return !hasBrInRange(firstBlock, 0, anchor, sel.anchorOffset)
  }

  // 无块级元素的平铺 fallback：检查 host 起点到光标之间是否有 <br>
  return !hasBrInRange(host, 0, anchor, sel.anchorOffset)
}

/**
 * 光标是否位于 contenteditable 编辑器的最后一行。
 */
function isContentEditableCaretLastLine(host: HTMLElement): boolean {
  const sel = document.getSelection()
  if (sel === null || sel.rangeCount === 0) return true
  const anchor = sel.anchorNode
  if (anchor === null || !host.contains(anchor) || anchor === host) return true

  const lastBlock = host.lastElementChild
  if (lastBlock !== null) {
    // 若光标不在末尾块级元素内部，绝对不是最后一行
    if (!lastBlock.contains(anchor)) return false
    // 若在末块内，检查光标到末块末尾之间是否有软换行 <br>
    const endOffset = lastBlock.childNodes.length
    return !hasBrInRange(anchor, sel.anchorOffset, lastBlock, endOffset)
  }

  // 无块级元素的平铺 fallback：检查光标到 host 末尾是否有 <br>
  return !hasBrInRange(anchor, sel.anchorOffset, host, host.childNodes.length)
}

/** Whether the caret sits on the first line of the draft (or the draft is single-line). */
export function isCaretOnFirstLine(host: HTMLTextAreaElement | HTMLElement): boolean {
  if (host instanceof HTMLTextAreaElement) {
    const text = editorText(host)
    const firstBreak = text.indexOf('\n')
    if (firstBreak === -1) return true
    return editorCaretOffset(host) <= firstBreak
  }
  return isContentEditableCaretFirstLine(host)
}

/** Whether the caret sits on the last line of the draft (or the draft is single-line). */
export function isCaretOnLastLine(host: HTMLTextAreaElement | HTMLElement): boolean {
  if (host instanceof HTMLTextAreaElement) {
    const text = editorText(host)
    const lastBreak = text.lastIndexOf('\n')
    if (lastBreak === -1) return true
    return editorCaretOffset(host) > lastBreak
  }
  return isContentEditableCaretLastLine(host)
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
  // 空输入框或 0 偏移兜底：直接锚定在首段容器起点，防止因找不到 Text 节点静默丢失光标
  if (offset === 0 || (host.textContent ?? '') === '') {
    const target = host.firstElementChild ?? host
    try {
      const range = document.createRange()
      range.setStart(target, 0)
      range.collapse(true)
      const sel = document.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    } catch { /* 容错保护 */ }
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

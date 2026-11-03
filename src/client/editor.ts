/**
 * DSH 0.2.0-rc.2 输入框编辑器底层适配器。
 *
 * 现代 DSH 采用 Lexical contenteditable 宿主（`[data-composer-input]`），
 * 内部草稿修改通过 `inputActions.setDraft` 流转，选区与光标映射通过 DOM Selection 与 TreeWalker 计算；
 * 同时保持对原生单行与多行编辑器的容积适配。精准判定视觉与逻辑行首末行，防止方向键历史回溯误吞正常多行光标移动。
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
  if (anchor === null || !host.contains(anchor)) return true

  // 1. 几何探测优先：若能获取光标与首行的 DOMRect，以视觉行高判定（精准支持视觉自动折行）
  try {
    const range = sel.getRangeAt(0)
    const caretRect = range.getBoundingClientRect()
    if (caretRect && typeof caretRect.height === 'number' && caretRect.height > 0) {
      const startRange = document.createRange()
      startRange.selectNodeContents(host)
      startRange.collapse(true)
      const firstLineRect = startRange.getBoundingClientRect()
      if (firstLineRect && typeof firstLineRect.height === 'number' && firstLineRect.height > 0) {
        // 若光标顶部明显低于首行底部（预留 2px 浮点容差），说明光标绝对在第二行及以后
        if (caretRect.top >= firstLineRect.bottom - 2) {
          return false
        }
      }
    }
  } catch {
    /* 容错降级至 DOM 结构判定 */
  }

  // 2. DOM 结构判定：
  // 若 anchor 为 host 自身（光标直接停在根容器，常发生于块级元素之间或多段落切换）
  if (anchor === host) {
    // anchorOffset 表示子节点索引，若有多段且大于 0 说明光标停在第 2 个或后续段落
    if (host.childNodes.length > 1 && sel.anchorOffset > 0) return false
    return true
  }

  const firstBlock = host.firstElementChild
  if (firstBlock !== null) {
    // 若光标不在首个块级元素内部，绝对不是第一行（例如在第 2 段、第 3 段）
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
  if (anchor === null || !host.contains(anchor)) return true

  // 1. 几何探测优先：若能获取光标与末行的 DOMRect，以视觉行高判定（精准支持视觉自动折行）
  try {
    const range = sel.getRangeAt(0)
    const caretRect = range.getBoundingClientRect()
    if (caretRect && typeof caretRect.height === 'number' && caretRect.height > 0) {
      const endRange = document.createRange()
      endRange.selectNodeContents(host)
      endRange.collapse(false)
      const lastLineRect = endRange.getBoundingClientRect()
      if (lastLineRect && typeof lastLineRect.height === 'number' && lastLineRect.height > 0) {
        // 若光标底部明显高于末行顶部（预留 2px 浮点容差），说明光标绝对在末行之上
        if (caretRect.bottom <= lastLineRect.top + 2) {
          return false
        }
      }
    }
  } catch {
    /* 容错降级至 DOM 结构判定 */
  }

  // 2. DOM 结构判定：
  if (anchor === host) {
    // 若 anchor 为 host 且 offset 小于末尾子节点索引，说明不在末段
    const count = host.childNodes.length
    if (count > 1 && sel.anchorOffset < count - 1) return false
    return true
  }

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
export function isCaretOnFirstLine(host: HTMLTextAreaElement | HTMLElement, draft?: string): boolean {
  if (host instanceof HTMLTextAreaElement) {
    const text = draft ?? editorText(host)
    const firstBreak = text.indexOf('\n')
    if (firstBreak === -1) return true
    return editorCaretOffset(host) <= firstBreak
  }
  if (typeof draft === 'string' && draft.includes('\n')) {
    const sel = editorSelectionOffsets(host)
    if (sel !== null) {
      const firstBreak = draft.indexOf('\n')
      if (firstBreak !== -1 && sel.start > firstBreak) return false
    }
  }
  return isContentEditableCaretFirstLine(host)
}

/** Whether the caret sits on the last line of the draft (or the draft is single-line). */
export function isCaretOnLastLine(host: HTMLTextAreaElement | HTMLElement, draft?: string): boolean {
  if (host instanceof HTMLTextAreaElement) {
    const text = draft ?? editorText(host)
    const lastBreak = text.lastIndexOf('\n')
    if (lastBreak === -1) return true
    return editorCaretOffset(host) > lastBreak
  }
  if (typeof draft === 'string' && draft.includes('\n')) {
    const sel = editorSelectionOffsets(host)
    if (sel !== null) {
      const lastBreak = draft.lastIndexOf('\n')
      if (lastBreak !== -1 && sel.end < lastBreak) return false
    }
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

import test from 'node:test'
import assert from 'node:assert/strict'

// 在 Node 裸环境下为 editor 提供极简 DOM 契约模拟
class FakeNode {
  parentNode: FakeNode | null = null
  childNodes: FakeNode[] = []
  textContent: string = ''
  nodeName: string = '#text'

  contains(other: FakeNode | null): boolean {
    if (!other) return false
    let cur: FakeNode | null = other
    while (cur) {
      if (cur === this) return true
      cur = cur.parentNode
    }
    return false
  }

  appendChild(child: FakeNode): FakeNode {
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }
}

class FakeElement extends FakeNode {
  nodeName: string = 'DIV'
  get firstElementChild(): FakeElement | null {
    return (this.childNodes.find(c => c instanceof FakeElement) as FakeElement) || null
  }
  get lastElementChild(): FakeElement | null {
    const list = this.childNodes.filter(c => c instanceof FakeElement) as FakeElement[]
    return list.length > 0 ? list[list.length - 1] : null
  }
}

class FakeTextArea extends FakeElement {
  nodeName: string = 'TEXTAREA'
  value: string = ''
  selectionStart: number = 0
  selectionEnd: number = 0
}

;(globalThis as any).Element = FakeElement
;(globalThis as any).HTMLTextAreaElement = FakeTextArea

// 引入待测模块
const { isCaretOnFirstLine, isCaretOnLastLine, editorText } = await import('../src/client/editor.ts')

test('textarea: 单行文本光标任意位置既是首行也是末行', () => {
  const ta = new FakeTextArea()
  ta.value = 'hello world'
  ta.selectionStart = 5
  assert.equal(isCaretOnFirstLine(ta), true)
  assert.equal(isCaretOnLastLine(ta), true)
})

test('textarea: 多行文本首行、中行、末行精准区分', () => {
  const ta = new FakeTextArea()
  ta.value = 'line1\nline2\nline3'
  
  // 第一行中段
  ta.selectionStart = 3
  assert.equal(isCaretOnFirstLine(ta), true)
  assert.equal(isCaretOnLastLine(ta), false)

  // 第二行中段
  ta.selectionStart = 8
  assert.equal(isCaretOnFirstLine(ta), false)
  assert.equal(isCaretOnLastLine(ta), false)

  // 第三行中段
  ta.selectionStart = 15
  assert.equal(isCaretOnFirstLine(ta), false)
  assert.equal(isCaretOnLastLine(ta), true)
})

test('contenteditable (Lexical 段落模型): 修复多段落无 br 导致的致命误判', () => {
  const host = new FakeElement()
  const p1 = new FakeElement()
  p1.nodeName = 'P'
  p1.textContent = '段落一'
  
  const p2 = new FakeElement()
  p2.nodeName = 'P'
  p2.textContent = '段落二'

  host.appendChild(p1)
  host.appendChild(p2)

  // 模拟光标停在第二段中：此时绝不应该判定为第一行！
  let activeAnchor: FakeNode = p2
  let activeOffset = 2

  ;(globalThis as any).document = {
    getSelection: () => ({
      rangeCount: 1,
      anchorNode: activeAnchor,
      anchorOffset: activeOffset,
      isCollapsed: true,
      getRangeAt: () => ({})
    }),
    createRange: () => ({
      setStart: () => {},
      setEnd: () => {},
      intersectsNode: () => false,
      commonAncestorContainer: host
    }),
    createTreeWalker: () => ({
      nextNode: () => null
    })
  }

  // 光标在第二段：不能是第一行！
  assert.equal(isCaretOnFirstLine(host), false, '第二段光标绝不能被误判为第一行！')
  assert.equal(isCaretOnLastLine(host), true, '第二段光标应正确判定为末行')

  // 光标切回第一段
  activeAnchor = p1
  assert.equal(isCaretOnFirstLine(host), true, '第一段光标应正确判定为首行')
  assert.equal(isCaretOnLastLine(host), false, '第一段光标绝不能被判定为末行')
})

test('contenteditable: 空输入框（仅含一个占位段落）', () => {
  const host = new FakeElement()
  const pEmpty = new FakeElement()
  pEmpty.nodeName = 'P'
  host.appendChild(pEmpty)

  ;(globalThis as any).document = {
    getSelection: () => ({
      rangeCount: 1,
      anchorNode: host,
      anchorOffset: 0,
      isCollapsed: true
    }),
    createRange: () => ({
      setStart: () => {},
      setEnd: () => {},
      intersectsNode: () => false,
      commonAncestorContainer: host
    }),
    createTreeWalker: () => ({
      nextNode: () => null
    })
  }

  assert.equal(isCaretOnFirstLine(host), true)
  assert.equal(isCaretOnLastLine(host), true)
})
test('contenteditable: 当 anchorNode 为 host 且 anchorOffset > 0 时，指向后续段落，绝不是第一行', () => {
  const host = new FakeElement()
  const p1 = new FakeElement()
  p1.nodeName = 'P'
  p1.textContent = '段落一'
  const p2 = new FakeElement()
  p2.nodeName = 'P'
  p2.textContent = '段落二'
  host.appendChild(p1)
  host.appendChild(p2)

  // anchorNode 是 host，offset 是 1（指向 p2）
  ;(globalThis as any).document = {
    getSelection: () => ({
      rangeCount: 1,
      anchorNode: host,
      anchorOffset: 1,
      isCollapsed: true,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }),
      }),
    }),
    createRange: () => ({
      setStart: () => {},
      setEnd: () => {},
      intersectsNode: () => false,
      commonAncestorContainer: host,
      getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }),
      collapse: () => {},
      selectNodeContents: () => {},
    }),
    createTreeWalker: () => ({
      nextNode: () => null,
    }),
  }

  assert.equal(isCaretOnFirstLine(host), false, 'anchorOffset > 0 指向第 2 段时绝不能被误判为第一行！')
  assert.equal(isCaretOnLastLine(host), true, 'anchorOffset 为最后一个子节点时应为末行')
})

test('contenteditable: 几何检测（视觉自动换行，无换行符但有视觉行高差）', () => {
  const host = new FakeElement()
  const p1 = new FakeElement()
  p1.nodeName = 'P'
  p1.textContent = '长文本在输入框内产生了多行视觉折行...'
  host.appendChild(p1)

  // 模拟光标在第二行（top: 50, bottom: 70），首行高度为（top: 20, bottom: 40）
  ;(globalThis as any).document = {
    getSelection: () => ({
      rangeCount: 1,
      anchorNode: p1,
      anchorOffset: 20,
      isCollapsed: true,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 50, bottom: 70, height: 20 }),
      }),
    }),
    createRange: () => {
      let isFirst = true
      return {
        setStart: () => {},
        setEnd: () => {},
        intersectsNode: () => false,
        commonAncestorContainer: host,
        selectNodeContents: () => {},
        collapse: (toStart: boolean) => { isFirst = toStart },
        getBoundingClientRect: () => isFirst ? { top: 20, bottom: 40, height: 20 } : { top: 50, bottom: 70, height: 20 },
      }
    },
    createTreeWalker: () => ({
      nextNode: () => null,
    }),
  }

  assert.equal(isCaretOnFirstLine(host), false, '光标视觉位置在第二行时，绝不能被误判为第一行！')
  assert.equal(isCaretOnLastLine(host), true, '光标视觉位置在末行时应为末行')
})

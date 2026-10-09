import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PromptHistoryEngine,
  type EngineClock,
  type HistoryRecord,
  type PromptHistoryConfig,
  type StorageDriver,
} from '../src/client/history-engine.ts'

class MockStorage implements StorageDriver {
  records: HistoryRecord[] = []
  load(): readonly HistoryRecord[] {
    return this.records
  }
  save(records: readonly HistoryRecord[]): void {
    this.records = [...records]
  }
}

class MockClock implements EngineClock {
  private mono: number = 1000
  private wall: number = 1700000000000

  monotonicNow(): number {
    return this.mono
  }
  wallClockNow(): number {
    return this.wall
  }
  advance(ms: number): void {
    this.mono += ms
    this.wall += ms
  }
}

const baseConfig: PromptHistoryConfig = {
  historyEnabled: true,
  globalHistory: false,
  maxHistoryItems: 5,
  doubleEsc: true,
  fuzzyMatch: true,
  ignoreLeadingSpace: true,
}

test('1. 双击 Esc 800ms 临界点判定：799ms 触发清空，801ms 退化为重新提示', () => {
  const clock = new MockClock()
  const storage = new MockStorage()
  const engine = new PromptHistoryEngine(baseConfig, storage, clock)

  // 第一次 Esc：非空草稿，应提示 esc.again，不消费事件
  const first = engine.onKeyDown({
    key: 'Escape',
    currentDraft: 'my prompt',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(first.handled, false)
  assert.deepEqual(first.action, { type: 'flash-hint', hintKey: 'esc.again' })

  // 步进 799ms (在 800ms 内)：第二次 Esc，应消费事件并清空草稿
  clock.advance(799)
  const second = engine.onKeyDown({
    key: 'Escape',
    currentDraft: 'my prompt',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(second.handled, true)
  assert.deepEqual(second.action, { type: 'set-draft', text: '', caret: 'start' })
  // 并且被清空的草稿存入了历史
  assert.equal(engine.getHistory().length, 1)
  assert.equal(engine.getHistory()[0].text, 'my prompt')

  // 超时测试：再次输入，第一次 Esc 后等待 801ms
  engine.onKeyDown({
    key: 'Escape',
    currentDraft: 'another prompt',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  clock.advance(801)
  const timeoutEsc = engine.onKeyDown({
    key: 'Escape',
    currentDraft: 'another prompt',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  // 801ms 已超时，退化为重新提示初次按键
  assert.equal(timeoutEsc.handled, false)
  assert.deepEqual(timeoutEsc.action, { type: 'flash-hint', hintKey: 'esc.again' })
})

test('2. 任意非 Esc 键打断待定状态（Primed Reset）', () => {
  const clock = new MockClock()
  const engine = new PromptHistoryEngine(baseConfig, new MockStorage(), clock)

  // 第一次 Esc
  engine.onKeyDown({
    key: 'Escape',
    currentDraft: 'hello',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })

  // 用户按下了普通字符 'a'
  clock.advance(100)
  const keyA = engine.onKeyDown({
    key: 'a',
    currentDraft: 'helloa',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(keyA.handled, false)

  // 紧接着在 800ms 内再次按 Esc：由于被打断，依然只能算作第一次按键！
  clock.advance(100)
  const nextEsc = engine.onKeyDown({
    key: 'Escape',
    currentDraft: 'helloa',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(nextEsc.handled, false)
  assert.deepEqual(nextEsc.action, { type: 'flash-hint', hintKey: 'esc.again' })
})

test('3. 多行光标边界穿透：光标不在首行时 Up 键不拦截', () => {
  const engine = new PromptHistoryEngine(baseConfig, new MockStorage(), new MockClock())
  engine.ingestMessages([{ seq: 1, text: 'old cmd', time: 100 }])

  const res = engine.onKeyDown({
    key: 'ArrowUp',
    currentDraft: 'line1\nline2',
    isCaretOnFirstLine: false, // 光标在第二行
    isCaretOnLastLine: true,
  })
  assert.equal(res.handled, false, '多行光标不在首行时必须放行给宿主移动光标')
})

test('4. Claude Code 风格上下键浏览与到底不环绕', () => {
  const engine = new PromptHistoryEngine(baseConfig, new MockStorage(), new MockClock())
  engine.ingestMessages([
    { seq: 1, text: 'cmd 1 (oldest)', time: 100 },
    { seq: 2, text: 'cmd 2', time: 200 },
    { seq: 3, text: 'cmd 3 (newest)', time: 300 },
  ])

  // 初始草稿为 'typing...'
  // 第 1 次 Up：展示最新一条 cmd 3
  const up1 = engine.onKeyDown({
    key: 'ArrowUp',
    currentDraft: 'typing...',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(up1.handled, true)
  assert.deepEqual(up1.action, { type: 'set-draft', text: 'cmd 3 (newest)', caret: 'start' })

  // 第 2 次 Up：展示 cmd 2
  const up2 = engine.onKeyDown({
    key: 'ArrowUp',
    currentDraft: 'cmd 3 (newest)',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(up2.handled, true)
  assert.deepEqual(up2.action, { type: 'set-draft', text: 'cmd 2', caret: 'start' })

  // 第 3 次 Up：展示最旧一条 cmd 1
  const up3 = engine.onKeyDown({
    key: 'ArrowUp',
    currentDraft: 'cmd 2',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(up3.handled, true)
  assert.deepEqual(up3.action, { type: 'set-draft', text: 'cmd 1 (oldest)', caret: 'start' })

  // 第 4 次 Up：已到最旧一条，不环绕，保持原样
  const up4 = engine.onKeyDown({
    key: 'ArrowUp',
    currentDraft: 'cmd 1 (oldest)',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(up4.handled, true)
  assert.deepEqual(up4.action, { type: 'none' })

  // 5. Down 键逐步退回，最终恢复原始草稿
  const down1 = engine.onKeyDown({
    key: 'ArrowDown',
    currentDraft: 'cmd 1 (oldest)',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(down1.handled, true)
  assert.deepEqual(down1.action, { type: 'set-draft', text: 'cmd 2', caret: 'end' })

  const down2 = engine.onKeyDown({
    key: 'ArrowDown',
    currentDraft: 'cmd 2',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(down2.handled, true)
  assert.deepEqual(down2.action, { type: 'set-draft', text: 'cmd 3 (newest)', caret: 'end' })

  // 归零：恢复最初保存的 'typing...'
  const down3 = engine.onKeyDown({
    key: 'ArrowDown',
    currentDraft: 'cmd 3 (newest)',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(down3.handled, true)
  assert.deepEqual(down3.action, { type: 'set-draft', text: 'typing...', caret: 'end' })
  assert.equal(engine.getMode(), 'idle')
})

test('6. 用户手动编辑草稿丢弃浏览态', () => {
  const engine = new PromptHistoryEngine(baseConfig, new MockStorage(), new MockClock())
  engine.ingestMessages([{ seq: 1, text: 'recalled text', time: 100 }])

  // 按 Up 召回
  engine.onKeyDown({
    key: 'ArrowUp',
    currentDraft: 'draft',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(engine.getMode(), 'browsing')

  // 回填后草稿同步变化
  engine.onDraftChange('recalled text')
  assert.equal(engine.getMode(), 'browsing')

  // 用户修改了文字
  engine.onDraftChange('recalled text with my edits')
  assert.equal(engine.getMode(), 'idle', '用户手动编辑后必须脱离浏览态')
})

test('7. 空输入框双击 Esc 唤起搜索面板、输入法差量搜索与 Esc 还原', () => {
  const clock = new MockClock()
  const engine = new PromptHistoryEngine(baseConfig, new MockStorage(), clock)
  engine.ingestMessages([
    { seq: 1, text: 'deploy production', time: 100 },
    { seq: 2, text: 'build package', time: 200 },
  ])

  // 空草稿第一次 Esc
  engine.onKeyDown({
    key: 'Escape',
    currentDraft: '',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  clock.advance(200)

  // 空草稿第二次 Esc：唤起搜索面板
  const openRes = engine.onKeyDown({
    key: 'Escape',
    currentDraft: '',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(openRes.handled, true)
  assert.equal(openRes.action.type, 'show-panel')
  assert.equal(engine.getMode(), 'searching')

  // 差量搜索：输入 'dpl' 模糊匹配
  const searchAction = engine.onDraftChange('dpl')
  assert.equal(searchAction.type, 'show-panel')
  if (searchAction.type === 'show-panel') {
    assert.equal(searchAction.snapshot.query, 'dpl')
    // 模糊匹配命中 'deploy production'
    assert.equal(searchAction.snapshot.total, 1)
  }

  // 取消搜索：恢复原始草稿
  const cancelRes = engine.onKeyDown({
    key: 'Escape',
    currentDraft: 'dpl',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(cancelRes.handled, true)
  assert.deepEqual(cancelRes.action, { type: 'set-draft', text: '', caret: 'end' })
  assert.equal(engine.getMode(), 'idle')
})

test('8. 跨会话容量 FIFO 截断与消息流去重', () => {
  const storage = new MockStorage()
  const engine = new PromptHistoryEngine(
    { ...baseConfig, maxHistoryItems: 3, globalHistory: true },
    storage,
    new MockClock()
  )

  // 灌入 4 条消息（超出 cap=3）
  engine.ingestMessages([
    { seq: 1, text: 'm1', time: 10 },
    { seq: 2, text: 'm2', time: 20 },
    { seq: 3, text: 'm3', time: 30 },
    { seq: 4, text: 'm4', time: 40 },
  ])

  const history = engine.getHistory()
  assert.equal(history.length, 3)
  assert.deepEqual(history.map(h => h.text), ['m2', 'm3', 'm4'], '最旧的 m1 应被 FIFO 丢弃')
  // 持久化存储同步更新
  assert.equal(storage.records.length, 3)
})

test('9. ignoreLeadingSpace 隐私特性：前导空格提示词不记录入历史', () => {
  const engine = new PromptHistoryEngine(
    { ...baseConfig, ignoreLeadingSpace: true },
    new MockStorage(),
    new MockClock()
  )

  // 消息流包含敏感 prompt（前导空格）
  engine.ingestMessages([
    { seq: 1, text: ' sk-secret-token-12345', time: 100 },
    { seq: 2, text: 'public prompt', time: 200 },
  ])

  assert.equal(engine.getHistory().length, 1)
  assert.equal(engine.getHistory()[0].text, 'public prompt', '带前导空格的敏感词绝不进入历史')

  // 双击 Esc 清空带前导空格的草稿时，也不录入历史
  const clock = new MockClock()
  const cleanEngine = new PromptHistoryEngine(
    { ...baseConfig, ignoreLeadingSpace: true },
    new MockStorage(),
    clock
  )
  cleanEngine.onKeyDown({
    key: 'Escape',
    currentDraft: ' temp-secret',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  clock.advance(100)
  cleanEngine.onKeyDown({
    key: 'Escape',
    currentDraft: ' temp-secret',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(cleanEngine.getHistory().length, 0, '双击清空的前导空格草稿同样不入历史')
})

test('10. switchSession 会话切换重置所有瞬态状态', () => {
  const engine = new PromptHistoryEngine(baseConfig, new MockStorage(), new MockClock())
  engine.ingestMessages([{ seq: 1, text: 'msg', time: 100 }])

  // 进入浏览态
  engine.onKeyDown({
    key: 'ArrowUp',
    currentDraft: 'typing',
    isCaretOnFirstLine: true,
    isCaretOnLastLine: true,
  })
  assert.equal(engine.getMode(), 'browsing')

  // 切换会话
  engine.switchSession('sess-new')
  assert.equal(engine.getMode(), 'idle')
  // 非全局历史下历史被清空
  assert.equal(engine.getHistory().length, 0)
})

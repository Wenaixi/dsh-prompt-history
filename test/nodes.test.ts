import test from 'node:test'
import assert from 'node:assert/strict'
import { promptMessage, nodeSeq, nodeTime } from '../src/client/nodes.ts'

test('nodes: parses standard DSH 0.2.0-rc.2 UserMessageNode', () => {
  const node = {
    kind: 'user',
    seq: 42,
    time: 1729000000000,
    content: [
      { type: 'text', text: '请帮我写一个测试' },
    ],
    source: null,
  }
  const result = promptMessage(node)
  assert.deepEqual(result, {
    kind: 'user',
    seq: 42,
    text: '请帮我写一个测试',
    time: 1729000000000,
  })
})

test('nodes: parses standard DSH 0.2.0-rc.2 SteeringMessageNode', () => {
  const node = {
    kind: 'steering',
    seq: 50,
    time: 1729000005000,
    content: [
      { type: 'text', text: '  立刻停止当前任务  ' },
    ],
    source: null,
  }
  const result = promptMessage(node)
  assert.deepEqual(result, {
    kind: 'steering',
    seq: 50,
    text: '立刻停止当前任务',
    time: 1729000005000,
  })
})

test('nodes: concats multiple text blocks within content', () => {
  const node = {
    kind: 'user',
    seq: 60,
    time: 1729000010000,
    content: [
      { type: 'text', text: '第一行内容\n' },
      { type: 'other', ignored: true },
      { type: 'text', text: '第二行内容' },
    ],
  }
  const result = promptMessage(node)
  assert.deepEqual(result, {
    kind: 'user',
    seq: 60,
    text: '第一行内容\n第二行内容',
    time: 1729000010000,
  })
})

test('nodes: ignores assistant, turn-error, compaction, and other non-prompt nodes', () => {
  assert.equal(promptMessage({ kind: 'assistant', seq: 1, content: [{ type: 'text', text: 'hi' }] }), null)
  assert.equal(promptMessage({ kind: 'turn-error', seq: 2 }), null)
  assert.equal(promptMessage({ kind: 'compaction', seq: 3 }), null)
  assert.equal(promptMessage(null), null)
  assert.equal(promptMessage(undefined), null)
})

test('nodes: ignores empty or whitespace-only prompts', () => {
  assert.equal(promptMessage({ kind: 'user', seq: 1, content: [{ type: 'text', text: '   \n  \t  ' }] }), null)
  assert.equal(promptMessage({ kind: 'user', seq: 2, content: [] }), null)
  assert.equal(promptMessage({ kind: 'user', seq: 3, content: null }), null)
})

test('nodes: nodeSeq and nodeTime extraction and edge cases', () => {
  assert.equal(nodeSeq({ seq: 100 }), 100)
  assert.equal(nodeSeq({ seq: -1 }), -1)
  assert.equal(nodeSeq({ seq: NaN }), 0)
  assert.equal(nodeSeq({}), 0)

  assert.equal(nodeTime({ time: 1700000000000 }), 1700000000000)
  assert.equal(nodeTime({ time: 0 }), 0)
  assert.equal(nodeTime({ time: -10 }), 0)
  assert.equal(nodeTime({}), 0)
})

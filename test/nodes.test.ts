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

test('nodes: parses chatNode wrapped UserMessageNode with node.data', () => {
  const wrapped = {
    key: 'msg-1',
    kind: 'user',
    anchorSeq: 101,
    data: {
      kind: 'user',
      seq: 101,
      time: 1729000020000,
      content: [{ type: 'text', text: '包装节点中的问题' }],
    },
  }
  const result = promptMessage(wrapped)
  assert.deepEqual(result, {
    kind: 'user',
    seq: 101,
    text: '包装节点中的问题',
    time: 1729000020000,
  })
})

test('nodes: parses slash command node with name and args', () => {
  const cmdNode = {
    kind: 'command',
    anchorSeq: 102,
    data: {
      kind: 'command',
      seq: 102,
      time: 1729000030000,
      commandId: 'cmd-1',
      name: 'plan',
      args: '实现全域无损历史加载',
    },
  }
  const result = promptMessage(cmdNode)
  assert.deepEqual(result, {
    kind: 'command',
    seq: 102,
    text: '/plan 实现全域无损历史加载',
    time: 1729000030000,
  })
})

test('nodes: parses slash command node with name only', () => {
  const cmdNode = {
    kind: 'command',
    seq: 103,
    time: 1729000040000,
    name: 'help',
    args: null,
  }
  const result = promptMessage(cmdNode)
  assert.deepEqual(result, {
    kind: 'command',
    seq: 103,
    text: '/help',
    time: 1729000040000,
  })
})

test('nodes: parses question-reply and command-input nodes', () => {
  const questionReply = {
    kind: 'question-reply',
    anchorSeq: 104,
    data: {
      seq: 104,
      time: 1729000050000,
      text: '是的，请继续执行方案 A',
    },
  }
  const cmdInput = {
    kind: 'command-input',
    seq: 105,
    time: 1729000060000,
    text: 'goal create 探索高级思路',
  }
  assert.deepEqual(promptMessage(questionReply), {
    kind: 'question-reply',
    seq: 104,
    text: '是的，请继续执行方案 A',
    time: 1729000050000,
  })
  assert.deepEqual(promptMessage(cmdInput), {
    kind: 'command-input',
    seq: 105,
    text: 'goal create 探索高级思路',
    time: 1729000060000,
  })
})

test('nodes: parses content as raw string or block with direct text', () => {
  const rawStringNode = {
    kind: 'user',
    seq: 106,
    time: 1729000070000,
    content: '纯文本提示词',
  }
  const directTextBlockNode = {
    kind: 'user',
    seq: 107,
    time: 1729000080000,
    content: [{ text: '无 type 字段但有 text 的块' }],
  }
  assert.deepEqual(promptMessage(rawStringNode), {
    kind: 'user',
    seq: 106,
    text: '纯文本提示词',
    time: 1729000070000,
  })
  assert.deepEqual(promptMessage(directTextBlockNode), {
    kind: 'user',
    seq: 107,
    text: '无 type 字段但有 text 的块',
    time: 1729000080000,
  })
})

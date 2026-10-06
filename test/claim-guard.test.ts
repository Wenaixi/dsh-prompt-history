import test from 'node:test'
import assert from 'node:assert/strict'
import { hasInlineSlash } from '../src/client/claim-guard.ts'

test('认领后的行内斜杠命中', () => {
  assert.equal(hasInlineSlash('/plan /ds', 9), true)
  assert.equal(hasInlineSlash('/plan /dsh-plugin-dev', 21), true)
  assert.equal(hasInlineSlash('/plan 备注 /ds', 13), true)
  assert.equal(hasInlineSlash('  /ds', 5), true)
  assert.equal(hasInlineSlash('hello /ds', 9), true)
})

test('认领令牌本身与纯文本参数不命中', () => {
  assert.equal(hasInlineSlash('/plan', 5), false)
  assert.equal(hasInlineSlash('/plan ', 6), false)
  assert.equal(hasInlineSlash('/plan off', 10), false)
})

test('光标之后的斜杠不算数', () => {
  assert.equal(hasInlineSlash('/plan /ds', 6), false)
  assert.equal(hasInlineSlash('/plan /ds', 0), false)
})

test('中文句子里的路径：光标离开该段就不命中', () => {
  assert.equal(hasInlineSlash('看看 /a/b 这个路径', 20), false)
  assert.equal(hasInlineSlash('看看 /a/b', 9), true)
})

test('负数与超界光标被夹到合法区间', () => {
  assert.equal(hasInlineSlash('/plan /ds', -3), false)
  assert.equal(hasInlineSlash('/plan /ds', 999), true)
})

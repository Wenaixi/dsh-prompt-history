import test from 'node:test'
import assert from 'node:assert/strict'
import { DOUBLE_ESCAPE_MS, isDoubleEscape, matchesOf, nextIndex } from '../src/client/history-model.ts'

test('an empty query returns every distinct entry, newest first', () => {
  assert.deepEqual(matchesOf(['a', 'b', 'a', 'c'], ''), [3, 2, 1])
})

test('keeps only the newest occurrence of a duplicated entry', () => {
  assert.deepEqual(matchesOf(['same', 'other', 'same'], ''), [2, 1])
})

test('filters by substring and skips empty entries', () => {
  assert.deepEqual(matchesOf(['deploy now', '', 'please deploy now', 'other'], 'deploy'), [2, 0])
  assert.deepEqual(matchesOf(['deploy now'], 'absent'), [])
})

test('moves the highlight and wraps at both ends', () => {
  assert.equal(nextIndex(0, 1, 3), 1)
  assert.equal(nextIndex(2, 1, 3), 0)
  assert.equal(nextIndex(0, -1, 3), 2)
})

test('lands on an edge when the highlight was unset or stale', () => {
  assert.equal(nextIndex(-1, 1, 3), 2)
  assert.equal(nextIndex(9, 1, 3), 2)
  assert.equal(nextIndex(-1, -1, 3), 0)
  assert.equal(nextIndex(0, 1, 0), -1)
})

test('detects a double Escape inside the window and rejects one outside it', () => {
  assert.equal(isDoubleEscape(1000, 1000 + DOUBLE_ESCAPE_MS), true)
  assert.equal(isDoubleEscape(1000, 1000 + DOUBLE_ESCAPE_MS + 1), false)
})

test('needs a first press and rejects a non-monotonic gap', () => {
  assert.equal(isDoubleEscape(0, 500), false)
  assert.equal(isDoubleEscape(1000, 999), false)
  assert.equal(isDoubleEscape(1000, 1001, 2000), true)
})

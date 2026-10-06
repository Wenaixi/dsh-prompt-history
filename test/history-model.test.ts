import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DOUBLE_ESCAPE_MS, atStep, clampIndex, downStep, fuzzyMatchesOf, isDoubleEscape,
  isSubsequence, matchesOf, relativeAgeOf, upStep,
} from '../src/client/history-model.ts'

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

test('clamps the highlight at both ends instead of wrapping', () => {
  assert.equal(clampIndex(0, 1, 3), 1)
  assert.equal(clampIndex(2, 1, 3), 2)
  assert.equal(clampIndex(0, -1, 3), 0)
  assert.equal(clampIndex(1, -1, 3), 0)
})

test('lands on an edge when the highlight was unset or stale', () => {
  // 越界 current 直接参与 clamp：9+1 → 夹回 2；-1-1 → 夹回 0。
  assert.equal(clampIndex(-1, 1, 3), 0)
  assert.equal(clampIndex(9, 1, 3), 2)
  assert.equal(clampIndex(-1, -1, 3), 0)
  assert.equal(clampIndex(0, 1, 0), -1)
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

test('Up advances one step at a time and stops at the oldest entry', () => {
  assert.equal(upStep(0, 3), 1)
  assert.equal(upStep(1, 3), 2)
  assert.equal(upStep(2, 3), 3)
  // 已到最旧：保持原值，不环绕回最新（Claude Code 越界回滚）。
  assert.equal(upStep(3, 3), 3)
  assert.equal(upStep(0, 0), 0)
})

test('Down steps back toward the live draft and exits at one', () => {
  assert.equal(downStep(3), 2)
  assert.equal(downStep(2), 1)
  assert.equal(downStep(1), 0)
  assert.equal(downStep(0), 0)
})

test('maps the browse step to a history index, newest first', () => {
  assert.equal(atStep(1, 4), 3)
  assert.equal(atStep(4, 4), 0)
  assert.equal(atStep(0, 4), -1)
  assert.equal(atStep(5, 4), -1)
})

test('detects a character subsequence, case-insensitively', () => {
  assert.equal(isSubsequence('deploy now', 'dpl'), true)
  assert.equal(isSubsequence('Deploy Now', 'dpl'), true)
  assert.equal(isSubsequence('deploy now', 'dnw'), true)
  assert.equal(isSubsequence('deploy now', 'nowx'), false)
  assert.equal(isSubsequence('abc', 'cba'), false)
})

test('fuzzy matching puts exact hits before subsequence hits, newest first', () => {
  // 'bt-two'(4) 与 'bt-one'(1) 精确命中在前，'beta-two'(3) 子序列命中在后。
  assert.deepEqual(fuzzyMatchesOf(['alpha', 'bt-one', 'other', 'beta-two', 'bt-two'], 'bt'), [4, 1, 3])
  assert.deepEqual(fuzzyMatchesOf(['alpha', 'beta-two'], 'absent'), [])
  assert.deepEqual(fuzzyMatchesOf(['a', 'b', 'a'], ''), [2, 1])
})

test('formats relative ages like Claude Code', () => {
  const now = 1_000_000_000_000
  assert.deepEqual(relativeAgeOf(now - 30_000, now), { value: 0, unit: 'now' })
  assert.deepEqual(relativeAgeOf(now - 5 * 60_000, now), { value: 5, unit: 'min' })
  assert.deepEqual(relativeAgeOf(now - 3 * 3_600_000, now), { value: 3, unit: 'hour' })
  assert.deepEqual(relativeAgeOf(now - 2 * 86_400_000, now), { value: 2, unit: 'day' })
  assert.equal(relativeAgeOf(now - 40 * 86_400_000, now), null)
  assert.equal(relativeAgeOf(0, now), null)
  assert.equal(relativeAgeOf(now + 10_000, now), null)
})

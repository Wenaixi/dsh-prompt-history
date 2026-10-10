import test from 'node:test'
import assert from 'node:assert/strict'
import {
  splitHighlighted,
  formatPreview,
  calculatePanelTop,
  HistoryOverlayController,
} from '../src/client/history-overlay.ts'

test('splitHighlighted: empty query returns whole text unmatched', () => {
  const result = splitHighlighted('hello world', '')
  assert.deepEqual(result, [{ text: 'hello world', match: false }])
})

test('splitHighlighted: empty text returns single empty segment', () => {
  const result = splitHighlighted('', 'foo')
  assert.deepEqual(result, [{ text: '', match: false }])
})

test('splitHighlighted: case-insensitive matching and multiple occurrences', () => {
  const result = splitHighlighted('Hello HELLO hello', 'hello')
  assert.equal(result.length, 5)
  assert.equal(result[0].text, 'Hello')
  assert.equal(result[0].match, true)
  assert.equal(result[1].text, ' ')
  assert.equal(result[1].match, false)
  assert.equal(result[2].text, 'HELLO')
  assert.equal(result[2].match, true)
  assert.equal(result[3].text, ' ')
  assert.equal(result[3].match, false)
  assert.equal(result[4].text, 'hello')
  assert.equal(result[4].match, true)
})

test('splitHighlighted: needle at the beginning, middle, and end', () => {
  const result = splitHighlighted('prefix-git-commit-git-suffix', 'git')
  assert.equal(result.filter(r => r.match).length, 2)
  assert.equal(result.map(r => r.text).join(''), 'prefix-git-commit-git-suffix')
})

test('formatPreview: single-line text returns 1 line with 0 more', () => {
  const { lines, moreCount } = formatPreview('single line')
  assert.deepEqual(lines, ['single line'])
  assert.equal(moreCount, 0)
})

test('formatPreview: exactly 6 lines returns 6 lines with 0 more', () => {
  const text = '1\n2\n3\n4\n5\n6'
  const { lines, moreCount } = formatPreview(text, 6)
  assert.equal(lines.length, 6)
  assert.equal(moreCount, 0)
})

test('formatPreview: 8 lines returns 6 lines with 2 more', () => {
  const text = '1\n2\n3\n4\n5\n6\n7\n8'
  const { lines, moreCount } = formatPreview(text, 6)
  assert.equal(lines.length, 6)
  assert.deepEqual(lines, ['1', '2', '3', '4', '5', '6'])
  assert.equal(moreCount, 2)
})

test('calculatePanelTop: null anchor defaults to 8', () => {
  assert.equal(calculatePanelTop(null, 240, 800), 8)
})

test('calculatePanelTop: sits above composer when space permits', () => {
  // composer at top: 500, bottom: 560; panel height: 200
  // top = 500 - 200 - 6 = 294
  const top = calculatePanelTop({ top: 500, bottom: 560 }, 200, 800)
  assert.equal(top, 294)
})

test('calculatePanelTop: flips below composer when above is cramped', () => {
  // composer at top: 100, bottom: 160; panel height: 200
  // above = 100 - 200 - 6 = -106 (< 8)
  // flips below: bottom + 6 = 160 + 6 = 166
  const top = calculatePanelTop({ top: 100, bottom: 160 }, 200, 800)
  assert.equal(top, 166)
})

test('calculatePanelTop: clamps to bottom of viewport', () => {
  // composer at bottom: 750, panel height: 200, viewport: 800
  // max allowable top = 800 - 200 - 8 = 592
  const top = calculatePanelTop({ top: 50, bottom: 750 }, 200, 800)
  assert.equal(top, 592)
})

test('HistoryOverlayController: initial state and idempotent teardown', () => {
  const controller = new HistoryOverlayController()
  assert.equal(controller.isOpen(), false)
  // Calling hide or destroy before mount is safe and idempotent
  controller.hide()
  controller.destroy()
  assert.equal(controller.isOpen(), false)
})

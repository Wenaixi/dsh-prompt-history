import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PREFS, normalizePrefs, parseLegacyPrefs, planLegacyMigration, prefsOps,
  type PluginPrefs,
} from '../src/client/prefs-model.ts'

test('uses defaults for an empty legacy value', () => {
  assert.deepEqual(parseLegacyPrefs(undefined), DEFAULT_PREFS)
})

test('migrates valid fields independently and maps copyOnSelect', () => {
  assert.deepEqual(parseLegacyPrefs(JSON.stringify({
    copyOnSelect: true,
    rightClickPaste: false,
    globalHistory: true,
  })), {
    copyMode: 'auto',
    rightClickPaste: false,
    historyEnabled: true,
    historyGesture: 'both',
    globalHistory: true,
  } satisfies PluginPrefs)
})

test('prefers an explicit valid copy mode over the legacy flag', () => {
  assert.equal(parseLegacyPrefs(JSON.stringify({ copyMode: 'toolbar', copyOnSelect: true })).copyMode, 'toolbar')
})

test('normalizes the history gesture field by field', () => {
  assert.equal(normalizePrefs({ historyGesture: 'esc' }).historyGesture, 'esc')
  assert.equal(normalizePrefs({ historyGesture: 'ctrlR' }).historyGesture, 'ctrlR')
  assert.equal(normalizePrefs({ historyGesture: 'nonsense' }).historyGesture, 'both')
  assert.equal(parseLegacyPrefs(JSON.stringify({ historyGesture: 'both' })).historyGesture, 'both')
})

test('keeps the off copy mode instead of normalizing it away', () => {
  assert.equal(parseLegacyPrefs(JSON.stringify({ copyMode: 'off' })).copyMode, 'off')
  assert.equal(normalizePrefs({ copyMode: 'off' }).copyMode, 'off')
})

test('falls back safely for malformed JSON and invalid values', () => {
  assert.deepEqual(parseLegacyPrefs('{'), DEFAULT_PREFS)
  assert.deepEqual(parseLegacyPrefs(JSON.stringify({ copyMode: 'nonsense', rightClickPaste: 1 })), DEFAULT_PREFS)
})

test('normalizes a host value field by field without inheriting copyOnSelect', () => {
  assert.deepEqual(normalizePrefs({ copyOnSelect: true }), {
    copyMode: 'toolbar',
    rightClickPaste: true,
    historyEnabled: true,
    historyGesture: 'both',
    globalHistory: false,
  } satisfies PluginPrefs)
})

test('normalizes non-object host values to the defaults', () => {
  assert.deepEqual(normalizePrefs(undefined), DEFAULT_PREFS)
  assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS)
  assert.deepEqual(normalizePrefs('toolbar'), DEFAULT_PREFS)
})

test('writes every field as one set operation in a fixed order', () => {
  assert.deepEqual(prefsOps({ copyMode: 'off', rightClickPaste: false, historyEnabled: false, historyGesture: 'esc', globalHistory: true }), [
    { op: 'set', path: ['copyMode'], value: 'off' },
    { op: 'set', path: ['rightClickPaste'], value: false },
    { op: 'set', path: ['historyEnabled'], value: false },
    { op: 'set', path: ['historyGesture'], value: 'esc' },
    { op: 'set', path: ['globalHistory'], value: true },
  ])
})

test('plans one-time migration only while the host has no user layer', () => {
  const raw = JSON.stringify({ copyOnSelect: true })
  assert.deepEqual(planLegacyMigration(undefined, raw), [
    { op: 'set', path: ['copyMode'], value: 'auto' },
    { op: 'set', path: ['rightClickPaste'], value: true },
    { op: 'set', path: ['historyEnabled'], value: true },
    { op: 'set', path: ['historyGesture'], value: 'both' },
    { op: 'set', path: ['globalHistory'], value: false },
  ])
  // 已有用户层说明用户或迁移已写过，旧的 localStorage 不得再覆盖。
  assert.equal(planLegacyMigration({ globalHistory: false }, raw), undefined)
  assert.equal(planLegacyMigration(undefined, null), undefined)
})

test('treats an empty user layer as never written', () => {
  // 宿主对没有用户覆盖的命名空间返回空对象，不是 undefined；空对象同样是「未写过」。
  const raw = JSON.stringify({ globalHistory: true })
  assert.deepEqual(planLegacyMigration({}, raw), [
    { op: 'set', path: ['copyMode'], value: 'toolbar' },
    { op: 'set', path: ['rightClickPaste'], value: true },
    { op: 'set', path: ['historyEnabled'], value: true },
    { op: 'set', path: ['historyGesture'], value: 'both' },
    { op: 'set', path: ['globalHistory'], value: true },
  ])
})

test('does not migrate when any field is user-overridden', () => {
  const raw = JSON.stringify({ globalHistory: true })
  assert.equal(planLegacyMigration({ copyMode: 'toolbar' }, raw), undefined)
})

test('refuses to migrate unparsable or non-object legacy payloads', () => {
  assert.equal(planLegacyMigration(undefined, '{'), undefined)
  assert.equal(planLegacyMigration(undefined, JSON.stringify('toolbar')), undefined)
  assert.equal(planLegacyMigration(undefined, JSON.stringify([])), undefined)
})
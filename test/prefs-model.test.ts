import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PREFS, parseLegacyPrefs, type PluginPrefs } from '../src/client/prefs-model.ts'

test('uses defaults for an empty legacy value', () => {
  assert.deepEqual(parseLegacyPrefs(undefined), DEFAULT_PREFS)
})

test('migrates valid fields independently and maps copyOnSelect', () => {
  assert.deepEqual(parseLegacyPrefs(JSON.stringify({
    copyOnSelect: true,
    rightClickPaste: false,
    globalHistory: true,
    tocVisible: 'invalid',
  })), {
    copyMode: 'auto',
    rightClickPaste: false,
    globalHistory: true,
    tocVisible: true,
  } satisfies PluginPrefs)
})

test('prefers an explicit valid copy mode over the legacy flag', () => {
  assert.equal(parseLegacyPrefs(JSON.stringify({ copyMode: 'toolbar', copyOnSelect: true })).copyMode, 'toolbar')
})

test('falls back safely for malformed JSON and invalid values', () => {
  assert.deepEqual(parseLegacyPrefs('{'), DEFAULT_PREFS)
  assert.deepEqual(parseLegacyPrefs(JSON.stringify({ copyMode: 'off', rightClickPaste: 1 })), DEFAULT_PREFS)
})

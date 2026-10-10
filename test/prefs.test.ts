import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PREFS, MAX_HISTORY_MAX, MAX_HISTORY_MIN, normalizePrefs, parseLegacyPrefs,
  planLegacyMigration, prefsOps, draftDiffOps, prefsEqual,
  analyzeConfigHealth, extractValidConfig, generateHealingOps, safeParseAndExtract,
  type PluginPrefs,
} from '../src/client/prefs.ts'

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
    doubleEsc: true,
    maxHistoryItems: 100,
    relativeTime: true,
    fuzzyMatch: true,
    globalHistory: true,
    ignoreLeadingSpace: false,
  } satisfies PluginPrefs)
})

test('prefers an explicit valid copy mode over the legacy flag', () => {
  assert.equal(parseLegacyPrefs(JSON.stringify({ copyMode: 'toolbar', copyOnSelect: true })).copyMode, 'toolbar')
})

test('normalizes the boolean prefs field by field', () => {
  assert.equal(normalizePrefs({ doubleEsc: false }).doubleEsc, false)
  assert.equal(normalizePrefs({ relativeTime: false }).relativeTime, false)
  assert.equal(normalizePrefs({ fuzzyMatch: false }).fuzzyMatch, false)
  assert.equal(normalizePrefs({ doubleEsc: 'yes' }).doubleEsc, true)
  assert.equal(normalizePrefs({ historyEnabled: 1 }).historyEnabled, true)
})

test('clamps maxHistoryItems into the allowed range', () => {
  assert.equal(MAX_HISTORY_MIN, 10)
  assert.equal(MAX_HISTORY_MAX, 1000)
  assert.equal(normalizePrefs({ maxHistoryItems: 200 }).maxHistoryItems, 200)
  assert.equal(normalizePrefs({ maxHistoryItems: 5 }).maxHistoryItems, MAX_HISTORY_MIN)
  assert.equal(normalizePrefs({ maxHistoryItems: 999999 }).maxHistoryItems, MAX_HISTORY_MAX)
  assert.equal(normalizePrefs({ maxHistoryItems: '100' }).maxHistoryItems, 100)
  assert.equal(normalizePrefs({ maxHistoryItems: 12.9 }).maxHistoryItems, 12)
  assert.equal(parseLegacyPrefs(JSON.stringify({ maxHistoryItems: 500 })).maxHistoryItems, 500)
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
    doubleEsc: true,
    maxHistoryItems: 100,
    relativeTime: true,
    fuzzyMatch: true,
    globalHistory: false,
    ignoreLeadingSpace: false,
  } satisfies PluginPrefs)
})

test('normalizes non-object host values to the defaults', () => {
  assert.deepEqual(normalizePrefs(undefined), DEFAULT_PREFS)
  assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS)
  assert.deepEqual(normalizePrefs('toolbar'), DEFAULT_PREFS)
})

test('writes every field as one set operation in a fixed order', () => {
  assert.deepEqual(prefsOps({
    copyMode: 'off', rightClickPaste: false, historyEnabled: false, doubleEsc: false,
    maxHistoryItems: 50, relativeTime: false, fuzzyMatch: false, globalHistory: true,
    ignoreLeadingSpace: false,
  }), [
    { op: 'set', path: ['copyMode'], value: 'off' },
    { op: 'set', path: ['rightClickPaste'], value: false },
    { op: 'set', path: ['historyEnabled'], value: false },
    { op: 'set', path: ['doubleEsc'], value: false },
    { op: 'set', path: ['maxHistoryItems'], value: 50 },
    { op: 'set', path: ['relativeTime'], value: false },
    { op: 'set', path: ['fuzzyMatch'], value: false },
    { op: 'set', path: ['globalHistory'], value: true },
    { op: 'set', path: ['ignoreLeadingSpace'], value: false },
  ])
})

test('plans one-time migration only while the host has no user layer', () => {
  const raw = JSON.stringify({ copyOnSelect: true })
  assert.deepEqual(planLegacyMigration(undefined, raw), [
    { op: 'set', path: ['copyMode'], value: 'auto' },
    { op: 'set', path: ['rightClickPaste'], value: true },
    { op: 'set', path: ['historyEnabled'], value: true },
    { op: 'set', path: ['doubleEsc'], value: true },
    { op: 'set', path: ['maxHistoryItems'], value: 100 },
    { op: 'set', path: ['relativeTime'], value: true },
    { op: 'set', path: ['fuzzyMatch'], value: true },
    { op: 'set', path: ['globalHistory'], value: false },
    { op: 'set', path: ['ignoreLeadingSpace'], value: false },
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
    { op: 'set', path: ['doubleEsc'], value: true },
    { op: 'set', path: ['maxHistoryItems'], value: 100 },
    { op: 'set', path: ['relativeTime'], value: true },
    { op: 'set', path: ['fuzzyMatch'], value: true },
    { op: 'set', path: ['globalHistory'], value: true },
    { op: 'set', path: ['ignoreLeadingSpace'], value: false },
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

test('writes only the changed fields between draft and current', () => {
  const current: PluginPrefs = {
    copyMode: 'toolbar', rightClickPaste: true, historyEnabled: true, doubleEsc: true,
    maxHistoryItems: 100, relativeTime: true, fuzzyMatch: true, globalHistory: false,
  }
  const draft: PluginPrefs = { ...current, copyMode: 'auto', historyEnabled: false }
  assert.deepEqual(draftDiffOps(draft, current), [
    { op: 'set', path: ['copyMode'], value: 'auto' },
    { op: 'set', path: ['historyEnabled'], value: false },
  ])
})

test('draftDiffOps returns nothing when the draft equals the current value', () => {
  const current: PluginPrefs = {
    copyMode: 'off', rightClickPaste: false, historyEnabled: false, doubleEsc: false,
    maxHistoryItems: 50, relativeTime: false, fuzzyMatch: false, globalHistory: true,
  }
  assert.deepEqual(draftDiffOps(current, current), [])
})

test('prefsEqual compares every field', () => {
  const a: PluginPrefs = {
    copyMode: 'toolbar', rightClickPaste: true, historyEnabled: true, doubleEsc: true,
    maxHistoryItems: 100, relativeTime: true, fuzzyMatch: true, globalHistory: false,
  }
  assert.equal(prefsEqual(a, { ...a }), true)
  assert.equal(prefsEqual(a, { ...a, globalHistory: true }), false)
})

test('analyzeConfigHealth reports healthy for a complete valid config', () => {
  const health = analyzeConfigHealth({
    copyMode: 'toolbar',
    rightClickPaste: true,
    historyEnabled: true,
    doubleEsc: true,
    maxHistoryItems: 100,
    relativeTime: true,
    fuzzyMatch: true,
    globalHistory: false,
    ignoreLeadingSpace: false,
  })
  assert.equal(health.status, 'healthy')
  assert.equal(health.isComplete, true)
  assert.equal(health.missingKeys.length, 0)
  assert.equal(health.unknownKeys.length, 0)
  assert.equal(health.invalidKeys.length, 0)
})

test('analyzeConfigHealth detects missing keys and marks degraded', () => {
  const health = analyzeConfigHealth({
    copyMode: 'toolbar',
    rightClickPaste: true,
    // 缺少其余 7 个字段
  })
  assert.equal(health.status, 'degraded')
  assert.equal(health.isComplete, false)
  assert.equal(health.missingKeys.includes('ignoreLeadingSpace'), true)
  assert.equal(health.missingKeys.includes('maxHistoryItems'), true)
})

test('analyzeConfigHealth detects dirty obsolete keys from userLayer and marks corrupted', () => {
  const raw = {
    ...DEFAULT_PREFS,
    tocVisible: true,
    historyGesture: 'swipe',
  }
  const health = analyzeConfigHealth(raw, { tocVisible: true })
  assert.equal(health.status, 'corrupted')
  assert.equal(health.unknownKeys.includes('tocVisible'), true)
  assert.equal(health.unknownKeys.includes('historyGesture'), true)
})

test('extractValidConfig salvages valid fields while healing corrupted or missing fields', () => {
  const corrupted = {
    copyMode: 'auto',
    rightClickPaste: false,
    historyEnabled: 'yes-please', // 类型错误，应被修复为默认值 true
    maxHistoryItems: '500', // 字符串数字，应安全转换为数值 500
    // 缺少 doubleEsc, relativeTime, fuzzyMatch, globalHistory, ignoreLeadingSpace
    obsoleteGhostKey: 12345, // 脏键，应被自动过滤不进入 prefs
  }

  const result = extractValidConfig(corrupted)
  assert.equal(result.prefs.copyMode, 'auto')
  assert.equal(result.prefs.rightClickPaste, false)
  assert.equal(result.prefs.historyEnabled, true) // 默认值回退
  assert.equal(result.prefs.maxHistoryItems, 500) // 成功转换
  assert.equal(result.prefs.doubleEsc, true) // 默认值补齐
  assert.equal(result.prefs.ignoreLeadingSpace, false) // 默认值补齐
  assert.equal('obsoleteGhostKey' in result.prefs, false) // 脏键被安全清洗
  assert.equal(result.salvagedCount >= 3, true)
  assert.equal(result.repairs.length > 0, true)
})

test('extractValidConfig migrates legacy copyOnSelect when copyMode is missing', () => {
  const result = extractValidConfig({ copyOnSelect: true })
  assert.equal(result.prefs.copyMode, 'auto')
})

test('generateHealingOps produces full set operations and unsets dirty keys from userLayer', () => {
  const userLayer = {
    historyGesture: 'pinch',
    tocVisible: false,
    copyMode: 'auto',
  }
  const cleanPrefs: PluginPrefs = { ...DEFAULT_PREFS, copyMode: 'auto' }
  const ops = generateHealingOps(userLayer, cleanPrefs)

  // 必须对 2 个脏键生成 unset
  const unsets = ops.filter(op => op.op === 'unset')
  assert.equal(unsets.length, 2)
  assert.deepEqual(unsets.map(op => op.path[0]).sort(), ['historyGesture', 'tocVisible'].sort())

  // 必须对 9 个标准字段生成 set
  const sets = ops.filter(op => op.op === 'set')
  assert.equal(sets.length, 9)
  assert.equal(sets.find(op => op.path[0] === 'copyMode')?.value, 'auto')
})

test('safeParseAndExtract handles invalid JSON gracefully', () => {
  const res = safeParseAndExtract('{ bad json :::')
  assert.equal(res.success, false)
  assert.deepEqual(res.result.prefs, DEFAULT_PREFS)
  assert.equal(res.health.status, 'corrupted')
})

test('safeParseAndExtract extracts and diagnoses valid JSON', () => {
  const json = JSON.stringify({ copyMode: 'off', rightClickPaste: false })
  const res = safeParseAndExtract(json)
  assert.equal(res.success, true)
  assert.equal(res.result.prefs.copyMode, 'off')
  assert.equal(res.result.prefs.rightClickPaste, false)
  assert.equal(res.health.status, 'degraded') // 缺少其它字段
})

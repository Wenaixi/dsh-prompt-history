/**
 * 插件详情页的配置卡：自绘外壳 + 操作即写 + 配置自愈维护。
 *
 * 采用四大精细化功能分区（剪贴板联动、历史回溯、历史搜索、健康自愈维护）。
 * 保存语义为「写即生效」，且自带强力配置自愈重构引擎与容灾提取工具。
 */
import React, { useState } from 'react'
import { Button, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PrefsCardSnapshot } from './card-controller.ts'
import type { CopyMode, PluginPrefs } from './prefs.ts'
import type { PromptHistoryKey } from './locales.ts'

export type SettingsCardProps = PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'dsh-prompt-history'>
  & {
    readonly usePrefsCard: <S>(select: (snapshot: PrefsCardSnapshot) => S, equal?: (a: S, b: S) => boolean) => S
    readonly edit: <F extends keyof PluginPrefs>(field: F, next: PluginPrefs[F]) => void
    readonly resetAll: () => void
    readonly healAndRegenerate: () => Promise<boolean>
    readonly exportConfigJson: () => string
    readonly importAndHeal: (text: string) => Promise<boolean>
  }

/** 复制方式的三个候选值，按「什么都不做 → 手动 → 自动」排列。 */
const COPY_MODES: readonly { value: CopyMode; label: PromptHistoryKey; hint: PromptHistoryKey }[] = [
  { value: 'off', label: 'copyMode.off', hint: 'copyMode.off.hint' },
  { value: 'toolbar', label: 'copyMode.toolbar', hint: 'copyMode.toolbar.hint' },
  { value: 'auto', label: 'copyMode.auto', hint: 'copyMode.auto.hint' },
]

/** 历史条数上限的档位，按从小到大排列。 */
const MAX_HISTORY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 500, label: '500' },
  { value: 1000, label: '1000' },
]

/** 一个开关行：标题 + 说明 + 开关。 */
function ToggleRow(props: {
  title: string
  hint: string
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}): JSX.Element {
  return (
    <div className="dsh-ph-row">
      <div className="dsh-ph-rowText">
        <p className="dsh-ph-rowTitle">{props.title}</p>
        <p className="dsh-ph-rowHint">{props.hint}</p>
      </div>
      <Switch
        checked={props.checked}
        onChange={props.onChange}
        label={props.title}
        disabled={props.disabled}
        className="dsh-ph-rowControl"
      />
    </div>
  )
}

/**
 * 三个一键预设档位。
 *
 * 只列出「与默认值不同」的字段：预设应用时其余字段回落到默认值，
 * 这样同一份定义既用于匹配判定又用于写入，不会两处漂移。
 */
type PresetId = 'minimal' | 'standard' | 'full'
interface PresetDef {
  readonly id: PresetId
  readonly labelKey: PromptHistoryKey
  readonly hintKey: PromptHistoryKey
  readonly prefs: PluginPrefs
}

const PRESET_DEFAULTS: PluginPrefs = {
  copyMode: 'toolbar',
  rightClickPaste: true,
  historyEnabled: true,
  doubleEsc: true,
  maxHistoryItems: 100,
  relativeTime: true,
  fuzzyMatch: true,
  globalHistory: false,
  ignoreLeadingSpace: false,
}

const PRESETS: readonly PresetDef[] = [
  {
    id: 'minimal',
    labelKey: 'settings.preset.minimal',
    hintKey: 'settings.preset.minimal.hint',
    prefs: {
      ...PRESET_DEFAULTS,
      doubleEsc: false,
      relativeTime: false,
      fuzzyMatch: false,
      rightClickPaste: false,
      copyMode: 'off',
    },
  },
  {
    id: 'standard',
    labelKey: 'settings.preset.standard',
    hintKey: 'settings.preset.standard.hint',
    prefs: PRESET_DEFAULTS,
  },
  {
    id: 'full',
    labelKey: 'settings.preset.full',
    hintKey: 'settings.preset.full.hint',
    prefs: {
      ...PRESET_DEFAULTS,
      globalHistory: true,
      ignoreLeadingSpace: true,
    },
  },
]

/** 与某个预设逐字段比对；全部相等才算命中。 */
function matchesPreset(prefs: PluginPrefs, def: PresetDef): boolean {
  return (Object.keys(def.prefs) as (keyof PluginPrefs)[]).every((key) => prefs[key] === def.prefs[key])
}

/**
 * 当前配置命中的预设 id；不匹配任何预设时返回 null。
 *
 * 界面上 null 会显示「自定义」段，而不是把指示器滑出轨道（SegmentedControl
 * 的 value 不在 options 里会让滑块越界且全段失去键盘可达性）。
 */
function currentPresetOf(prefs: PluginPrefs): PresetId | null {
  const hit = PRESETS.find((def) => matchesPreset(prefs, def))
  return hit === undefined ? null : hit.id
}

/** array.Set 语义的批量写入：一次调用改多个字段。 */
function applyPresetTo(edit: <F extends keyof PluginPrefs>(field: F, next: PluginPrefs[F]) => void, def: PresetDef): void {
  for (const key of Object.keys(def.prefs) as (keyof PluginPrefs)[]) {
    edit(key, def.prefs[key])
  }
}

/** 一组设置：标题 + 若干行。行与行之间只用细分隔线。 */
function Group(props: { title: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="dsh-ph-group">
      <h3 className="dsh-ph-groupTitle">{props.title}</h3>
      {props.hint === undefined ? null : <p className="dsh-ph-groupHint">{props.hint}</p>}
      <div className="dsh-ph-groupBody">{props.children}</div>
    </section>
  )
}

/** 单选块：几块并列的面板，每块自带标题与说明。 */
function ChoiceRow(props: {
  title: string
  hint: string
  value: string
  disabled: boolean
  options: readonly { value: string; label: string; hint: string }[]
  onChange: (next: string) => void
}): JSX.Element {
  return (
    <div className="dsh-ph-row dsh-ph-rowColumn">
      <div className="dsh-ph-rowText">
        <p className="dsh-ph-rowTitle">{props.title}</p>
        <p className="dsh-ph-rowHint">{props.hint}</p>
      </div>
      <div className="dsh-ph-options" role="radiogroup" aria-label={props.title}>
        {props.options.map((option) => {
          const selected = props.value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? 'dsh-ph-option isSelected' : 'dsh-ph-option'}
              disabled={props.disabled}
              onClick={() => props.onChange(option.value)}
            >
              <span className="dsh-ph-optionTitle">{option.label}</span>
              {option.hint ? <span className="dsh-ph-optionHint">{option.hint}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SettingsCardSlot(props: SettingsCardProps): JSX.Element | null {
  const { t } = props
  if (props.view !== 'page') return null

  const snapshot = props.usePrefsCard((state) => state)
  const [healNotice, setHealNotice] = useState<string | null>(null)

  if (!snapshot.available) {
    return <p className="dsh-ph-notice" role="status">{t('settings.unavailable')}</p>
  }

  const locked = !snapshot.writable
  const value = snapshot.values

  const copyOptions = COPY_MODES.map((mode) => ({
    value: mode.value,
    label: t(mode.label),
    hint: t(mode.hint),
  }))

  // 预设档位：命中的预设高亮；都不命中时选中常驻的「自定义」段。
  // SegmentedControl 的 value 必须恒在 options 内，否则指示器会滑出轨道
  // 且全段失去键盘可达性（见 client-i18n-pitfalls 铁律 8）。
  const presetHit = currentPresetOf(value)
  const presetOptions = [
    ...PRESETS.map((def) => ({ value: def.id as string, label: t(def.labelKey) })),
    { value: 'custom', label: t('settings.preset.custom') },
  ]
  const presetValue = presetHit ?? 'custom'
  const presetHint = presetHit === null
    ? t('settings.preset.custom.hint')
    : t(PRESETS.find((def) => def.id === presetHit)!.hintKey)

  const applyPreset = (id: string) => {
    if (locked) return
    const def = PRESETS.find((candidate) => candidate.id === id)
    if (def === undefined) return  // 「自定义」段不写入任何值
    applyPresetTo(props.edit, def)
  }

  const handleHeal = async () => {
    setHealNotice(null)
    const success = await props.healAndRegenerate()
    if (success) {
      setHealNotice(t('settings.health.healed'))
      setTimeout(() => setHealNotice(null), 4000)
    }
  }

  return (
    <div className="dsh-ph-settings">
      {locked ? <p className="dsh-ph-notice" role="status">{t('settings.readOnly')}</p> : null}

      {/* 保存失败容灾横幅 */}
      {snapshot.failed ? (
        <div className="dsh-ph-failed-banner" role="alert">
          <span>{t('settings.health.saveFailedNotice')}</span>
          <button
            type="button"
            className="dsh-ph-inline-link"
            onClick={handleHeal}
            disabled={locked || snapshot.healing}
          >
            {t('settings.health.saveFailedHeal')}
          </button>
        </div>
      ) : null}

      {/* 自愈成功临时反馈 */}
      {healNotice ? (
        <div className="dsh-ph-success-banner" role="status">
          <span>{healNotice}</span>
        </div>
      ) : null}

      {/* 预设档位：一键套用常用组合。上方必须有可见标题——SegmentedControl
          的 label 只进 aria 树，视觉上不渲染（铁律 9）。 */}
      <section className="dsh-ph-group">
        <h3 className="dsh-ph-groupTitle">{t('settings.preset.label')}</h3>
        <div className="dsh-ph-preset">
          <SegmentedControl
            id="dsh-ph-preset"
            options={presetOptions}
            value={presetValue}
            disabled={locked}
            onChange={applyPreset}
            label={t('settings.preset.label')}
          />
        </div>
        <p className="dsh-ph-groupHint">{presetHint}</p>
      </section>

      {/* 分组一：找回之前说过的话 */}
      <Group title={t('settings.group.recall')} hint={t('settings.group.recall.hint')}>
        <ToggleRow
          title={t('settings.row.history')}
          hint={t('settings.row.history.hint')}
          checked={value.historyEnabled}
          disabled={locked}
          onChange={(next) => props.edit('historyEnabled', next)}
        />
        <ToggleRow
          title={t('settings.row.global')}
          hint={t('settings.row.global.hint')}
          checked={value.globalHistory}
          disabled={locked}
          onChange={(next) => props.edit('globalHistory', next)}
        />
        <ChoiceRow
          title={t('settings.row.maxHistory')}
          hint={t('settings.row.maxHistory.hint')}
          value={String(value.maxHistoryItems)}
          options={MAX_HISTORY_OPTIONS.map((option) => ({ value: String(option.value), label: option.label, hint: '' }))}
          disabled={locked}
          onChange={(next) => props.edit('maxHistoryItems', Number(next))}
        />
      </Group>

      {/* 分组二：快速翻找 */}
      <Group title={t('settings.group.find')} hint={t('settings.group.find.hint')}>
        <ToggleRow
          title={t('settings.row.doubleEsc')}
          hint={t('settings.row.doubleEsc.hint')}
          checked={value.doubleEsc}
          disabled={locked}
          onChange={(next) => props.edit('doubleEsc', next)}
        />
        <ToggleRow
          title={t('settings.row.fuzzy')}
          hint={t('settings.row.fuzzy.hint')}
          checked={value.fuzzyMatch}
          disabled={locked}
          onChange={(next) => props.edit('fuzzyMatch', next)}
        />
        <ToggleRow
          title={t('settings.row.relativeTime')}
          hint={t('settings.row.relativeTime.hint')}
          checked={value.relativeTime}
          disabled={locked}
          onChange={(next) => props.edit('relativeTime', next)}
        />
      </Group>

      {/* 分组三：复制与粘贴 */}
      <Group title={t('settings.group.clipboard')} hint={t('settings.group.clipboard.hint')}>
        <ChoiceRow
          title={t('settings.row.copy')}
          hint={t('settings.row.copy.hint')}
          value={value.copyMode}
          options={copyOptions}
          disabled={locked}
          onChange={(next) => props.edit('copyMode', next as CopyMode)}
        />
        <ToggleRow
          title={t('settings.row.paste')}
          hint={t('settings.row.paste.hint')}
          checked={value.rightClickPaste}
          disabled={locked}
          onChange={(next) => props.edit('rightClickPaste', next)}
        />
      </Group>

      {/* 高级设置：少用项收进可展开区 */}
      <details className="dsh-ph-group dsh-ph-advanced">
        <summary className="dsh-ph-groupTitle dsh-ph-advancedSummary">
          {t('settings.advanced.title')}
        </summary>
        <p className="dsh-ph-groupHint">{t('settings.advanced.hint')}</p>
        <div className="dsh-ph-groupBody">
          <ToggleRow
            title={t('settings.row.ignoreSpace')}
            hint={t('settings.row.ignoreSpace.hint')}
            checked={value.ignoreLeadingSpace}
            disabled={locked}
            onChange={(next) => props.edit('ignoreLeadingSpace', next)}
          />
        </div>
      </details>

      {/* 底部重置操作 */}
      <div className="dsh-ph-foot">
        <Button variant="outline" size="sm" onClick={props.resetAll} disabled={locked}>
          {t('settings.reset')}
        </Button>
      </div>
    </div>
  )
}

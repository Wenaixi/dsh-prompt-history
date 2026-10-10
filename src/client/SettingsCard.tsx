/**
 * 插件详情页的配置卡：自绘外壳 + 操作即写 + 配置自愈维护。
 *
 * 采用四大精细化功能分区（剪贴板联动、历史回溯、历史搜索、健康自愈维护）。
 * 保存语义为「写即生效」，且自带强力配置自愈重构引擎与容灾提取工具。
 */
import React, { useState } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
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

/** 一组设置：标题 + 若干行。行与行之间只用细分隔线。 */
function Group(props: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="dsh-ph-group">
      <h3 className="dsh-ph-groupTitle">{props.title}</h3>
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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [importText, setImportText] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [healNotice, setHealNotice] = useState<string | null>(null)

  if (!snapshot.available) {
    return <p className="dsh-ph-notice" role="status">{t('settings.unavailable')}</p>
  }

  const locked = !snapshot.writable
  const value = snapshot.values
  const health = snapshot.health

  const copyOptions = COPY_MODES.map((mode) => ({
    value: mode.value,
    label: t(mode.label),
    hint: t(mode.hint),
  }))

  const handleHeal = async () => {
    setHealNotice(null)
    const success = await props.healAndRegenerate()
    if (success) {
      setHealNotice(t('settings.health.healed'))
      setTimeout(() => setHealNotice(null), 4000)
    }
  }

  const handleCopyJson = () => {
    try {
      void navigator.clipboard.writeText(props.exportConfigJson())
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2500)
    } catch {
      // 容灾忽略复制异常
    }
  }

  const handleImportAndHeal = async () => {
    if (!importText.trim()) return
    const success = await props.importAndHeal(importText)
    if (success) {
      setImportText('')
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

      {/* 分组一：复制与剪贴板 */}
      <Group title={t('settings.group.clipboard')}>
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

      {/* 分组二：历史回溯与快捷手势 */}
      <Group title={t('settings.group.history')}>
        <ToggleRow
          title={t('settings.row.history')}
          hint={t('settings.row.history.hint')}
          checked={value.historyEnabled}
          disabled={locked}
          onChange={(next) => props.edit('historyEnabled', next)}
        />
        <ToggleRow
          title={t('settings.row.doubleEsc')}
          hint={t('settings.row.doubleEsc.hint')}
          checked={value.doubleEsc}
          disabled={locked}
          onChange={(next) => props.edit('doubleEsc', next)}
        />
        <ToggleRow
          title={t('settings.row.ignoreSpace')}
          hint={t('settings.row.ignoreSpace.hint')}
          checked={value.ignoreLeadingSpace}
          disabled={locked}
          onChange={(next) => props.edit('ignoreLeadingSpace', next)}
        />
        <ToggleRow
          title={t('settings.row.global')}
          hint={t('settings.row.global.hint')}
          checked={value.globalHistory}
          disabled={locked}
          onChange={(next) => props.edit('globalHistory', next)}
        />
      </Group>

      {/* 分组三：历史搜索面板 */}
      <Group title={t('settings.group.search')}>
        <ChoiceRow
          title={t('settings.row.maxHistory')}
          hint={t('settings.row.maxHistory.hint')}
          value={String(value.maxHistoryItems)}
          options={MAX_HISTORY_OPTIONS.map((option) => ({ value: String(option.value), label: option.label, hint: '' }))}
          disabled={locked}
          onChange={(next) => props.edit('maxHistoryItems', Number(next))}
        />
        <ToggleRow
          title={t('settings.row.relativeTime')}
          hint={t('settings.row.relativeTime.hint')}
          checked={value.relativeTime}
          disabled={locked}
          onChange={(next) => props.edit('relativeTime', next)}
        />
        <ToggleRow
          title={t('settings.row.fuzzy')}
          hint={t('settings.row.fuzzy.hint')}
          checked={value.fuzzyMatch}
          disabled={locked}
          onChange={(next) => props.edit('fuzzyMatch', next)}
        />
      </Group>

      {/* 分组四：配置健康与自愈维护 */}
      <Group title={t('settings.group.maintenance')}>
        <div className="dsh-ph-health-row">
          <div className={`dsh-ph-health-box ${health.status === 'healthy' ? 'isHealthy' : 'isWarning'}`}>
            <span className={`dsh-ph-health-dot ${health.status === 'healthy' ? 'isHealthy' : 'isWarning'}`} />
            <div className="dsh-ph-health-info">
              <span className="dsh-ph-health-title">
                {health.status === 'healthy'
                  ? t('settings.health.healthy')
                  : health.status === 'corrupted'
                    ? t('settings.health.corrupted')
                    : t('settings.health.degraded')}
              </span>
              <span className="dsh-ph-health-desc">
                {health.status === 'healthy' ? t('settings.health.healthy.desc') : health.summary}
              </span>
            </div>
            {health.status !== 'healthy' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleHeal}
                disabled={locked || snapshot.healing}
                className="dsh-ph-heal-btn"
              >
                {snapshot.healing ? t('settings.health.healing') : t('settings.health.healBtn')}
              </Button>
            ) : null}
          </div>
        </div>

        {/* 高级工具折叠区 */}
        <div className="dsh-ph-adv-container">
          <button
            type="button"
            className="dsh-ph-adv-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>{showAdvanced ? '▼' : '▶'}</span>
            <span>{t('settings.tools.advancedTitle')}</span>
          </button>

          {showAdvanced ? (
            <div className="dsh-ph-adv-pane">
              <div className="dsh-ph-adv-actions">
                <Button variant="outline" size="sm" onClick={handleCopyJson}>
                  {copyFeedback ? t('settings.tools.exported') : t('settings.tools.export')}
                </Button>
                {health.status === 'healthy' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleHeal}
                    disabled={locked || snapshot.healing}
                  >
                    {snapshot.healing ? t('settings.health.healing') : t('settings.health.healBtn')}
                  </Button>
                ) : null}
              </div>

              <div className="dsh-ph-import-box">
                <textarea
                  className="dsh-ph-textarea"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={t('settings.tools.importPlaceholder')}
                  disabled={locked || snapshot.healing}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImportAndHeal}
                  disabled={locked || snapshot.healing || !importText.trim()}
                >
                  {t('settings.tools.importHeal')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Group>

      {/* 底部重置操作 */}
      <div className="dsh-ph-foot">
        <Button variant="outline" size="sm" onClick={props.resetAll} disabled={locked}>
          {t('settings.reset')}
        </Button>
      </div>
    </div>
  )
}

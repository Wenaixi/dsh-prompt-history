/**
 * 插件详情页的配置卡：自绘外壳 + 操作即写。
 *
 * 没有保存按钮：每次操作（开关、单选、恢复默认）都立即写宿主，写入由宿主
 * ConfigForm 排队并做 revision 栅栏，被拒时宿主回读、UI 自动回落到真值。
 * 组件只接收 slot props 与注册方 inject 注入的数据面，不接触 ctx。
 */
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PrefsCardSnapshot } from './card-controller.ts'
import type { CopyMode, PluginPrefs } from './prefs-model.ts'
import type { PromptHistoryKey } from './locales.ts'

export type SettingsCardProps = PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'dsh-prompt-history'>
  & {
    readonly usePrefsCard: <S>(select: (snapshot: PrefsCardSnapshot) => S, equal?: (a: S, b: S) => boolean) => S
    readonly edit: <F extends keyof PluginPrefs>(field: F, next: PluginPrefs[F]) => void
    readonly resetAll: () => void
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

/** 一个开关行：标题 + 说明 + 开关。标题在左，说明紧随其下，开关固定在右侧。 */
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

/** 一组设置：标题 + 若干行。行与行之间只用细分隔线，不套第二层卡片。 */
function Group(props: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="dsh-ph-group">
      <h3 className="dsh-ph-groupTitle">{props.title}</h3>
      <div className="dsh-ph-groupBody">{props.children}</div>
    </section>
  )
}

/**
 * 单选块：几块并列的面板，每块自带标题与说明。选中块用宿主强调色描边。
 * 用 role=radiogroup / radio 而不是原生 radio，是为了同时承载说明文字。
 */
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
              <span className="dsh-ph-optionHint">{option.hint}</span>
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
  return (
    <div className="dsh-ph-settings">
      {locked ? <p className="dsh-ph-notice" role="status">{t('settings.readOnly')}</p> : null}
      {snapshot.failed ? <p className="dsh-ph-failed" role="status">{t('settings.saveFailed')}</p> : null}
      <Group title={t('settings.group.input')}>
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
        <ToggleRow
          title={t('settings.row.global')}
          hint={t('settings.row.global.hint')}
          checked={value.globalHistory}
          disabled={locked}
          onChange={(next) => props.edit('globalHistory', next)}
        />
      </Group>
      <Group title={t('settings.group.copy')}>
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
      <div className="dsh-ph-foot">
        <Button variant="outline" size="sm" onClick={props.resetAll} disabled={locked}>
          {t('settings.reset')}
        </Button>
      </div>
    </div>
  )
}

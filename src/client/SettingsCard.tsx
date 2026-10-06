/**
 * 插件详情页的配置卡：官方 SettingsForm 外壳 + staged 草稿，一次保存写宿主。
 *
 * 数据面完全来自宿主：SettingsCardController 把 ConfigForm 快照投影成
 * SettingsForm 外壳需要的状态，编辑只改草稿，Save 才一次 mutate 写宿主。
 * 组件只接收 slot props 与注册方 inject 注入的数据面，不接触 ctx。
 */
import { Button, SettingsForm, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PrefsCardSnapshot } from './card-controller.ts'
import type { CopyMode, HistoryGesture, PluginPrefs } from './prefs-model.ts'
import type { PromptHistoryKey } from './locales.ts'

export type SettingsCardProps = PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'dsh-prompt-history'>
  & {
    readonly usePrefsCard: <S>(select: (snapshot: PrefsCardSnapshot) => S, equal?: (a: S, b: S) => boolean) => S
    readonly edit: <F extends keyof PluginPrefs>(field: F, next: PluginPrefs[F]) => void
    readonly resetAll: () => void
    readonly save: () => void
    readonly discard: () => void
  }

/** 复制方式的三个候选值，按「什么都不做 → 手动 → 自动」排列。 */
const COPY_MODES: readonly { value: CopyMode; label: PromptHistoryKey; hint: PromptHistoryKey }[] = [
  { value: 'off', label: 'copyMode.off', hint: 'copyMode.off.hint' },
  { value: 'toolbar', label: 'copyMode.toolbar', hint: 'copyMode.toolbar.hint' },
  { value: 'auto', label: 'copyMode.auto', hint: 'copyMode.auto.hint' },
]

/** 打开历史列表的手势三选，按「最小惊讶 → 最大宽容」排列。 */
const HISTORY_GESTURES: readonly { value: HistoryGesture; label: PromptHistoryKey; hint: PromptHistoryKey }[] = [
  { value: 'ctrlR', label: 'historyGesture.ctrlR', hint: 'historyGesture.ctrlR.hint' },
  { value: 'esc', label: 'historyGesture.esc', hint: 'historyGesture.esc.hint' },
  { value: 'both', label: 'historyGesture.both', hint: 'historyGesture.both.hint' },
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
  const locked = snapshot.saving || !snapshot.writable
  const value = snapshot.values
  const copyOptions = COPY_MODES.map((mode) => ({
    value: mode.value,
    label: t(mode.label),
    hint: t(mode.hint),
  }))
  const gestureOptions = HISTORY_GESTURES.map((gesture) => ({
    value: gesture.value,
    label: t(gesture.label),
    hint: t(gesture.hint),
  }))
  const labels = {
    unavailable: t('settings.unavailable'),
    readOnly: t('settings.readOnly'),
    saveFailed: t('settings.saveFailed'),
    save: t('settings.save'),
    saving: t('settings.saving'),
  }
  return (
    <SettingsForm labels={labels} state={snapshot} onSave={props.save} onDiscard={props.discard}>
      {snapshot.conflicted ? (
        <p className="dsh-ph-conflict" role="status">{t('settings.conflict')}</p>
      ) : null}
      <Group title={t('settings.group.input')}>
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
          title={t('settings.row.gesture')}
          hint={t('settings.row.gesture.hint')}
          value={value.historyGesture}
          options={gestureOptions}
          disabled={locked}
          onChange={(next) => props.edit('historyGesture', next as HistoryGesture)}
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
        <span className="dsh-ph-footHint">{t('settings.draftHint')}</span>
        <Button variant="outline" size="sm" onClick={props.resetAll} disabled={locked}>
          {t('settings.reset')}
        </Button>
      </div>
    </SettingsForm>
  )
}

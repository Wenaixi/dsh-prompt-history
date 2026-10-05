/**
 * 插件详情页的配置卡：五项设置，每项一行标题加一行说明。
 *
 * 数据面完全来自宿主：ConfigForm 的快照是唯一真值，写入走 form.set / form.mutate，
 * 不自建任何 HTTP 端点。组件只接收 slot props 与注册方 inject 注入的表单。
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DEFAULT_PREFS, normalizePrefs, planLegacyMigration, prefsOps,
  type CopyMode, type HistoryGesture, type PluginPrefs,
} from './prefs-model.ts'
import type { PromptHistoryKey } from './locales.ts'

/** 旧版浏览器配置载荷的键，只用于一次性迁移读取。 */
const LEGACY_STORAGE_KEY = 'dsh-prompt-history.prefs'

export type SettingsCardProps = PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'dsh-prompt-history'>
  & { readonly hostForm?: ConfigForm<Record<string, unknown>> }

type Translate = (key: PromptHistoryKey) => string

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

function readLegacyRaw(): string | null {
  try { return localStorage.getItem(LEGACY_STORAGE_KEY) } catch { return null }
}

function removeLegacyRaw(): void {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { /* 隐私模式不可写，迁移结果已在宿主。 */ }
}

/**
 * 订阅表单快照。
 *
 * 必须用箭头函数包一层：把 form.getSnapshot 直接交给 useSyncExternalStore 会丢
 * 掉 this，表单内部读 this.store 时抛 TypeError，配置区整块渲染失败。
 */
function useFormSnapshot(form: ConfigForm<Record<string, unknown>>): ConfigFormSnapshot<Record<string, unknown>> {
  const get = () => form.getSnapshot()
  return useSyncExternalStore((listener) => form.subscribe(listener), get, get)
}

/**
 * 一个开关行：标题 + 说明 + 开关。标题在左，说明紧随其下，开关固定在右侧。
 * 开关的 label 用短标题，保证无障碍名称简短；说明由行本身承载，供读屏与视觉共用。
 */
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
 * 一组设置：标题 + 若干行。行与行之间只用细分隔线，不套第二层卡片，
 * 避免在宿主已经画好的 section 里再造一叠盒子。
 */
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
  // 组合包配置区不传 slot 自带 form，注册方 inject 的宿主表单是唯一的数据面。
  const form = props.hostForm
  if (form === undefined) return null
  return <SettingsCard form={form} t={t} />
}

function SettingsCard({ form, t }: {
  form: ConfigForm<Record<string, unknown>>
  t: Translate
}): JSX.Element {
  const snapshot = useFormSnapshot(form)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const migrated = useRef(false)

  const value = snapshot.status === 'ready' && snapshot.value !== undefined
    ? normalizePrefs(snapshot.value)
    : DEFAULT_PREFS
  const loading = snapshot.status === 'loading'
  const locked = busy || loading || !snapshot.writable

  // 一次性迁移：宿主 user 层为空说明这份命名空间从未被写过，旧 localStorage
  // 可以安全作为初值提交；成功后删除旧载荷，宿主配置从此是唯一真源。
  useEffect(() => {
    if (snapshot.status !== 'ready' || migrated.current) return
    migrated.current = true
    const ops = planLegacyMigration(snapshot.user, readLegacyRaw())
    if (ops === undefined) return
    setBusy(true)
    void form.mutate(ops).then((accepted) => {
      setBusy(false)
      // 表单已把宿主答案折进镜像；载荷已删，再读即宿主真值。
      if (accepted) removeLegacyRaw()
      else setFailed(true)
    }).catch(() => { setBusy(false); setFailed(true) })
  }, [form, snapshot.status, snapshot.user])

  const settle = useCallback((accepted: boolean) => {
    setBusy(false)
    // 表单已把宿主答案折进镜像，成功与否以 accepted 与新快照为准。
    if (!accepted) setFailed(true)
  }, [])

  const writeBool = useCallback((field: keyof PluginPrefs, next: boolean) => {
    setBusy(true)
    setFailed(false)
    void form.set(field, next).then(settle).catch(() => { setBusy(false); setFailed(true) })
  }, [form, settle])

  const writeMode = useCallback((next: CopyMode) => {
    setBusy(true)
    setFailed(false)
    void form.set('copyMode', next).then(settle).catch(() => { setBusy(false); setFailed(true) })
  }, [form, settle])

  const writeGesture = useCallback((next: HistoryGesture) => {
    setBusy(true)
    setFailed(false)
    void form.set('historyGesture', next).then(settle).catch(() => { setBusy(false); setFailed(true) })
  }, [form, settle])

  const reset = useCallback(() => {
    if (!globalThis.confirm(t('settings.confirmReset'))) return
    setBusy(true)
    setFailed(false)
    // 恢复默认是一次整段写入；revision 留空表示无条件，由宿主 schema 兜底校验。
    void form.mutate(prefsOps(DEFAULT_PREFS)).then(settle).catch(() => { setBusy(false); setFailed(true) })
  }, [form, settle, t])

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

  return (
    <div className="dsh-ph-card">
      <Group title={t('settings.group.input')}>
        <ToggleRow
          title={t('settings.row.history')}
          hint={t('settings.row.history.hint')}
          checked={value.historyEnabled}
          disabled={locked}
          onChange={(next) => writeBool('historyEnabled', next)}
        />
        <ToggleRow
          title={t('settings.row.global')}
          hint={t('settings.row.global.hint')}
          checked={value.globalHistory}
          disabled={locked}
          onChange={(next) => writeBool('globalHistory', next)}
        />
        <ChoiceRow
          title={t('settings.row.gesture')}
          hint={t('settings.row.gesture.hint')}
          value={value.historyGesture}
          options={gestureOptions}
          disabled={locked}
          onChange={(next) => writeGesture(next as HistoryGesture)}
        />
      </Group>
      <Group title={t('settings.group.copy')}>
        <ChoiceRow
          title={t('settings.row.copy')}
          hint={t('settings.row.copy.hint')}
          value={value.copyMode}
          options={copyOptions}
          disabled={locked}
          onChange={(next) => writeMode(next as CopyMode)}
        />
        <ToggleRow
          title={t('settings.row.paste')}
          hint={t('settings.row.paste.hint')}
          checked={value.rightClickPaste}
          disabled={locked}
          onChange={(next) => writeBool('rightClickPaste', next)}
        />
      </Group>
      <Group title={t('settings.group.toc')}>
        <ToggleRow
          title={t('settings.row.toc')}
          hint={t('settings.row.toc.hint')}
          checked={value.tocVisible}
          disabled={locked}
          onChange={(next) => writeBool('tocVisible', next)}
        />
      </Group>
      <div className="dsh-ph-foot">
        <span className="dsh-ph-footStatus" role="status">
          {failed ? t('settings.saveFailed') : snapshot.writable ? '' : t('settings.readOnly')}
        </span>
        <Button variant="outline" size="sm" onClick={reset} disabled={locked}>
          {t('settings.reset')}
        </Button>
      </div>
    </div>
  )
}
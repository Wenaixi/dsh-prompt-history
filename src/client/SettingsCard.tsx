import { useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigPageForm } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { Button, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { DEFAULT_PREFS, parseLegacyPrefs, type CopyMode, type PluginPrefs } from './prefs-model.ts'
import { setPrefs } from './prefs.ts'
import type { PromptHistoryKey } from './locales.ts'

export type SettingsCardProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<'dsh-prompt-history'>

const STORAGE_KEY = 'dsh-prompt-history.prefs'
const COPY_MODES: readonly { value: CopyMode; label: PromptHistoryKey }[] = [
  { value: 'toolbar', label: 'copyMode.toolbar' },
  { value: 'auto', label: 'copyMode.auto' },
]

function readLegacy(): PluginPrefs | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? undefined : parseLegacyPrefs(raw)
  } catch { return undefined }
}

function useForm(form: ConfigPageForm | undefined): PluginPrefs | undefined {
  const value = form?.state.value
  if (value === undefined) return undefined
  const candidate = value as Partial<PluginPrefs>
  return {
    copyMode: candidate.copyMode === 'auto' || candidate.copyMode === 'toolbar' ? candidate.copyMode : DEFAULT_PREFS.copyMode,
    rightClickPaste: typeof candidate.rightClickPaste === 'boolean' ? candidate.rightClickPaste : DEFAULT_PREFS.rightClickPaste,
    globalHistory: typeof candidate.globalHistory === 'boolean' ? candidate.globalHistory : DEFAULT_PREFS.globalHistory,
    tocVisible: typeof candidate.tocVisible === 'boolean' ? candidate.tocVisible : DEFAULT_PREFS.tocVisible,
  }
}

function SettingsCard({ form, t }: { form: ConfigPageForm; t: (key: PromptHistoryKey) => string }): JSX.Element {
  const hostPrefs = useForm(form)
  const [draft, setDraft] = useState<PluginPrefs | undefined>(hostPrefs)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationDone, setMigrationDone] = useState(false)

  useEffect(() => {
    if (hostPrefs !== undefined && !saving) { setDraft(hostPrefs); setPrefs(hostPrefs) }
  }, [hostPrefs, saving])

  useEffect(() => {
    if (hostPrefs !== undefined || migrating || migrationDone) return
    const legacy = readLegacy()
    if (legacy === undefined) return
    setMigrating(true)
    void form.mutate(Object.entries(legacy).map(([field, value]) => ({ op: 'set' as const, path: [field], value: value as boolean | CopyMode })), form.state.revision).then((accepted) => {
      setMigrationDone(true)
      setMigrating(false)
      if (accepted) setPrefs(legacy)
      else setError(true)
    }).catch(() => { setMigrating(false); setError(true) })
  }, [form, hostPrefs, migrating, migrationDone])

  const value = draft ?? DEFAULT_PREFS
  const update = <K extends keyof PluginPrefs>(key: K, next: PluginPrefs[K]) => {
    setDraft({ ...value, [key]: next })
    setError(false)
  }
  const options = useMemo(() => COPY_MODES.map(({ value: optionValue, label }) => ({ value: optionValue, label: t(label) })), [t])
  const save = () => {
    setSaving(true)
    setError(false)
    void form.mutate(Object.entries(value).map(([field, fieldValue]) => ({ op: 'set' as const, path: [field], value: fieldValue as boolean | CopyMode })), form.state.revision).then((accepted) => {
      setSaving(false)
      if (accepted) setPrefs(value)
      else setError(true)
    }).catch(() => { setSaving(false); setError(true) })
  }
  const reset = () => {
    if (!globalThis.confirm(t('settings.confirmReset'))) return
    setDraft({ ...DEFAULT_PREFS })
    setError(false)
  }
  return (
    <div className="dsh-ph-card">
      <p className="dsh-ph-card-note">{t('settings.note')}</p>
      <section className="dsh-ph-card-section">
        <h3>{t('settings.copyGroup')}</h3>
        <SegmentedControl id="dsh-ph-copy-mode" value={value.copyMode} options={options} onChange={(next) => update('copyMode', next)} label={t('settings.copyLabel')} disabled={saving || migrating} />
        <Switch checked={value.rightClickPaste} onChange={(next) => update('rightClickPaste', next)} label={t('paste.toggle')} disabled={saving || migrating} />
      </section>
      <section className="dsh-ph-card-section">
        <h3>{t('settings.historyGroup')}</h3>
        <Switch checked={value.globalHistory} onChange={(next) => update('globalHistory', next)} label={t('history.global')} disabled={saving || migrating} />
        <Switch checked={value.tocVisible} onChange={(next) => update('tocVisible', next)} label={t('toc.toggle')} disabled={saving || migrating} />
      </section>
      {error && <p role="alert">{t('settings.saveFailed')}</p>}
      {migrating && <p role="status">{t('settings.migrating')}</p>}
      <div className="dsh-ph-card-actions">
        <Button variant="ghost" size="sm" onClick={reset} disabled={saving || migrating}>{t('settings.reset')}</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving || migrating || form.state.writable === false}>{saving ? t('settings.saving') : t('settings.save')}</Button>
      </div>
    </div>
  )
}

export function SettingsCardSlot(props: SettingsCardProps): JSX.Element | null {
  if (props.view !== 'page' || props.form === undefined) return null
  return <SettingsCard form={props.form} t={props.t} />
}

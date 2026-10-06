/**
 * 插件配置卡的状态控制器：把宿主的 ConfigForm 投影成官方 SettingsForm 的草稿模型。
 *
 * 形态仿官方 dsh-client-ui-settings-subagent 的 card controller：自己持有草稿、
 * 用快照 revision 做冲突栅栏、保存时一次 mutate、按代际抑制迟到的回执。
 * 官方 SettingsFormModel 只服务文本/数字字段，本插件五个字段全是开关/单选，
 * 因此不套官方模型，只套官方外壳 SettingsForm（packages/client/ui-settings/… 0.2.0-rc.2）。
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_PREFS, draftDiffOps, normalizePrefs, planLegacyMigration, prefsEqual,
  type PluginPrefs,
} from './prefs-model.ts'

/** 旧版浏览器配置载荷的键，只用于一次性迁移读取。 */
const LEGACY_STORAGE_KEY = 'dsh-prompt-history.prefs'

function readLegacyRaw(): string | null {
  try { return localStorage.getItem(LEGACY_STORAGE_KEY) } catch { return null }
}

function removeLegacyRaw(): void {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { /* 隐私模式不可写，迁移结果已在宿主。 */ }
}

/** 一条偏好字段名。 */
export type PrefField = keyof PluginPrefs

/** 设置卡组件消费的快照：官方 SettingsForm 需要的外壳 + 各字段当前值。 */
export interface PrefsCardSnapshot extends SettingsFormShell {
  /** 展示值：草稿优先，没有草稿时读宿主当前值。 */
  values: PluginPrefs
  /** 草稿期间宿主文档被别处改动：保存被拒绝，显示冲突提示。 */
  conflicted: boolean
  /** 一次性旧配置迁移是否已尝试（含已判定无需迁移）。 */
  migrated: boolean
}

/** 注册方 inject 给设置卡组件的数据面；hooks 成员由渲染器映射成 usePrefsCard。 */
export interface SettingsCardFace {
  hooks: {
    prefsCard: HostObservable<PrefsCardSnapshot>
  }
  edit: <F extends PrefField>(field: F, next: PluginPrefs[F]) => void
  resetAll: () => void
  save: () => void
  discard: () => void
}

/** 最小快照源：getSnapshot/subscribe 满足插槽 hooks 契约，set 用于发布新快照。 */
function createObservable<T>(init: T): HostObservable<T> & { set(next: T): void } {
  let state = init
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      state = next
      for (const listener of [...listeners]) {
        try { listener() } catch { /* 单个监听器异常不应阻塞其他监听器。 */ }
      }
    },
  }
}

/** 宿主表单快照的偏好值投影；未就绪时返回默认值。 */
function currentPrefsOf(scope: ConfigForm<Record<string, unknown>>): PluginPrefs {
  const snapshot = scope.getSnapshot()
  return snapshot.status === 'ready' && snapshot.value !== undefined
    ? normalizePrefs(snapshot.value)
    : { ...DEFAULT_PREFS }
}

export class SettingsCardController {
  private readonly scope: ConfigForm<Record<string, unknown>>
  private readonly store = createObservable<PrefsCardSnapshot>({
    available: false, writable: false, dirty: false, invalid: false,
    saving: false, failed: false, values: { ...DEFAULT_PREFS }, conflicted: false, migrated: false,
  })
  /** 正在编辑的草稿；undefined 表示未开始编辑，展示宿主当前值。 */
  private draft: PluginPrefs | undefined
  /** 草稿建立时的命名空间修订号，保存时作为 expectedRevision 栅栏。 */
  private draftRevision: number | undefined
  private saving = false
  private failed = false
  private conflicted = false
  private migrated = false
  /** 代际计数：dispose 后抑制任何迟到的保存/迁移回执。 */
  private generation = 0
  private readonly unsubscribe: () => void

  constructor(scope: ConfigForm<Record<string, unknown>>) {
    this.scope = scope
    this.store.set(this.projection())
    this.unsubscribe = scope.subscribe(() => {
      this.maybeMigrate()
      this.detectConflict()
      this.publish()
    })
    this.maybeMigrate()
  }

  /** 注册方在插槽注册时调用，拿到组件数据面。 */
  inject(): SettingsCardFace {
    return {
      hooks: { prefsCard: this.store },
      edit: (field, next) => this.edit(field, next),
      resetAll: () => this.resetAll(),
      save: () => { void this.runSave() },
      discard: () => this.discard(),
    }
  }

  /** 停订阅并抑制迟到的异步回执。 */
  dispose(): void {
    this.generation += 1
    this.unsubscribe()
  }

  /** 修改一个字段：只改草稿，不写宿主。 */
  edit<F extends PrefField>(field: F, next: PluginPrefs[F]): void {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status !== 'ready' || !snapshot.writable || this.saving) return
    this.beginDraft()
    this.draft = { ...this.draft!, [field]: next }
    this.failed = false
    this.publish()
  }

  /** 全部恢复默认：草稿置为 schema 默认值，保存时只写有差异的字段。 */
  resetAll(): void {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status !== 'ready' || !snapshot.writable || this.saving) return
    this.beginDraft()
    this.draft = { ...DEFAULT_PREFS }
    this.failed = false
    this.publish()
  }

  /** 放弃草稿，回到宿主当前值。 */
  discard(): void {
    if (this.saving) return
    this.clearDraft()
    this.publish()
  }

  private async runSave(): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status !== 'ready' || !snapshot.writable || this.saving) return
    const draft = this.draft ?? currentPrefsOf(this.scope)
    const ops = draftDiffOps(draft, currentPrefsOf(this.scope))
    if (ops.length === 0) {
      // 草稿与当前一致：没有可写的东西，清掉草稿即可。
      this.clearDraft()
      this.publish()
      return
    }
    if (this.draft !== undefined && this.draftRevision !== undefined
      && snapshot.revision !== this.draftRevision) {
      // 编辑期间文档被别处改动：拒绝保存，提示用户放弃草稿。
      this.conflicted = true
      this.publish()
      return
    }
    const generation = this.generation
    this.saving = true
    this.failed = false
    this.publish()
    let accepted: boolean
    try {
      accepted = await this.scope.mutate(ops, this.draftRevision)
    } catch {
      if (generation !== this.generation) return
      this.saving = false
      this.failed = true
      this.publish()
      return
    }
    if (generation !== this.generation) return
    this.saving = false
    // 宿主已把答案折进镜像：读回与草稿逐字段比对判定是否真的落盘。
    const landed = prefsEqual(currentPrefsOf(this.scope), draft)
    this.failed = !accepted || !landed
    if (!this.failed) this.clearDraft()
    this.publish()
  }

  /** 一次性旧配置迁移：宿主 user 层为空时才把旧 localStorage 作为初值提交。 */
  private maybeMigrate(): void {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status !== 'ready' || this.migrated) return
    this.migrated = true
    const ops = planLegacyMigration(snapshot.user, readLegacyRaw())
    if (ops === undefined) return
    const generation = this.generation
    this.saving = true
    this.failed = false
    this.publish()
    void this.scope.mutate(ops).then((accepted) => {
      if (generation !== this.generation) return
      this.saving = false
      if (accepted) removeLegacyRaw()
      else this.failed = true
      this.publish()
    }).catch(() => {
      if (generation !== this.generation) return
      this.saving = false
      this.failed = true
      this.publish()
    })
  }

  /** 草稿期间宿主文档修订号前进：视草稿与当前值是否一致决定清草稿或标冲突。 */
  private detectConflict(): void {
    if (this.saving || this.draft === undefined || this.draftRevision === undefined) return
    const snapshot = this.scope.getSnapshot()
    if (snapshot.revision !== this.draftRevision) {
      if (prefsEqual(this.draft, currentPrefsOf(this.scope))) this.clearDraft()
      else this.conflicted = true
    }
  }

  private beginDraft(): void {
    if (this.draft === undefined) {
      this.draft = currentPrefsOf(this.scope)
      this.draftRevision = this.scope.getSnapshot().revision
    }
  }

  private clearDraft(): void {
    this.draft = undefined
    this.draftRevision = undefined
    this.failed = false
    this.conflicted = false
  }

  private projection(): PrefsCardSnapshot {
    const snapshot = this.scope.getSnapshot()
    const current = currentPrefsOf(this.scope)
    const draft = this.draft
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: draft !== undefined && !prefsEqual(draft, current),
      // 冲突时表单无效：官方 SettingsForm 的 Save 会被禁用，防止覆盖他人改动。
      invalid: this.conflicted,
      saving: this.saving,
      failed: this.failed,
      values: draft ?? current,
      conflicted: this.conflicted,
      migrated: this.migrated,
    }
  }

  private publish(): void {
    this.store.set(this.projection())
  }
}

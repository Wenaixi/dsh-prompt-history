/**
 * 插件配置卡的状态控制器：把宿主的 ConfigForm 投影成设置卡快照。
 *
 * 保存语义是「写即生效」：每次操作（开关、单选、恢复默认）都立即走
 * ConfigForm.mutate 写宿主，不经过 staged 草稿，也没有保存按钮。
 * 宿主表单自带写入队列与 revision 栅栏：连点操作按序排队、写被拒时
 * recover 重读回滚到宿主真值。插件层只负责把宿主快照投影成 UI 状态，
 * 并用代际计数抑制卸载后的迟到回执。
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_PREFS, draftDiffOps, normalizePrefs, planLegacyMigration,
  type PluginPrefs, type PrefOp,
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

/** 设置卡组件消费的快照：UI 值直接来自宿主快照，不做本地草稿。 */
export interface PrefsCardSnapshot {
  /** 宿主是否对本插件提供这份命名空间。 */
  available: boolean
  /** 宿主文档是否接受写入；只读部署时控件禁用。 */
  writable: boolean
  /** 最近一次自动保存是否未被宿主接受（或传输失败）。 */
  failed: boolean
  /** 一次性旧配置迁移是否已尝试（含已判定无需迁移）。 */
  migrated: boolean
  /** 宿主当前偏好值；写失败回滚后即为回落值。 */
  values: PluginPrefs
}

/** 注册方 inject 给设置卡组件的数据面；hooks 成员由渲染器映射成 usePrefsCard。 */
export interface SettingsCardFace {
  hooks: {
    prefsCard: HostObservable<PrefsCardSnapshot>
  }
  edit: <F extends PrefField>(field: F, next: PluginPrefs[F]) => void
  resetAll: () => void
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
    available: false, writable: false, failed: false, migrated: false,
    values: { ...DEFAULT_PREFS },
  })
  private failed = false
  private migrated = false
  /** 代际计数：dispose 后抑制任何迟到的写入/迁移回执。 */
  private generation = 0
  private readonly unsubscribe: () => void

  constructor(scope: ConfigForm<Record<string, unknown>>) {
    this.scope = scope
    this.store.set(this.projection())
    this.unsubscribe = scope.subscribe(() => {
      this.maybeMigrate()
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
    }
  }

  /** 停订阅并抑制迟到的异步回执。 */
  dispose(): void {
    this.generation += 1
    this.unsubscribe()
  }

  /** 修改一个字段：立即写宿主，不经过草稿。 */
  edit<F extends PrefField>(field: F, next: PluginPrefs[F]): void {
    if (!this.writableNow()) return
    this.failed = false
    this.publish()
    void this.write([{ op: 'set', path: [field], value: next }])
  }

  /** 全部恢复默认：立即写回 schema 默认值，只写有差异的字段。 */
  resetAll(): void {
    if (!this.writableNow()) return
    this.failed = false
    this.publish()
    void this.write(draftDiffOps(DEFAULT_PREFS, currentPrefsOf(this.scope)))
  }

  private writableNow(): boolean {
    const snapshot = this.scope.getSnapshot()
    return snapshot.status === 'ready' && snapshot.writable
  }

  /** 一次宿主写入：失败只标记 failed，宿主镜像会自动 recover 回读回落。 */
  private async write(ops: PrefOp[]): Promise<void> {
    if (ops.length === 0) return
    const generation = this.generation
    let accepted: boolean
    try {
      accepted = await this.scope.mutate(ops)
    } catch {
      if (generation !== this.generation) return
      this.failed = true
      this.publish()
      return
    }
    if (generation !== this.generation) return
    this.failed = !accepted
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
    this.failed = false
    this.publish()
    void this.scope.mutate(ops).then((accepted) => {
      if (generation !== this.generation) return
      if (accepted) removeLegacyRaw()
      else this.failed = true
      this.publish()
    }).catch(() => {
      if (generation !== this.generation) return
      this.failed = true
      this.publish()
    })
  }

  private projection(): PrefsCardSnapshot {
    const snapshot = this.scope.getSnapshot()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      failed: this.failed,
      migrated: this.migrated,
      values: currentPrefsOf(this.scope),
    }
  }

  private publish(): void {
    this.store.set(this.projection())
  }
}

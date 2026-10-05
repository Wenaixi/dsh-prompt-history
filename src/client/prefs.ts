/**
 * 客户端偏好快照：宿主配置表单的投影，功能组件只读这里。
 *
 * 唯一真源是宿主的 ConfigForm（configForms.get(NS)）。apply 里拿到表单后调用
 * bindHostForm，prefs 立即变成宿主快照的投影并订阅其后继变化；表单未就绪时
 * 保持默认值，绝不从旧 localStorage 自行取值，旧载荷只由配置卡做一次性迁移。
 */
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_PREFS, normalizePrefs, type PluginPrefs } from './prefs-model.ts'

export type { CopyMode, PluginPrefs } from './prefs-model.ts'

let prefs: PluginPrefs = { ...DEFAULT_PREFS }
const listeners = new Set<() => void>()

function publish(next: PluginPrefs): void {
  prefs = next
  for (const fn of [...listeners]) {
    try { fn() } catch { /* 单个监听器异常不应阻塞其他监听器。 */ }
  }
}

/** 当前偏好快照；宿主表单未就绪时返回默认值。 */
export function getPrefs(): PluginPrefs { return prefs }

/** 订阅偏好变化，返回取消订阅的函数。 */
export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * 把偏好快照接到宿主表单上：读取初始值并订阅其后继快照。
 *
 * @param form - 宿主为本插件命名空间提供的配置表单。
 * @returns 取消订阅的函数，供 apply 用 ctx.effect 托管。
 */
export function bindHostForm(form: ConfigForm<Record<string, unknown>>): () => void {
  const derive = (snapshot: ConfigFormSnapshot<Record<string, unknown>>): PluginPrefs =>
    snapshot.status === 'ready' && snapshot.value !== undefined
      ? normalizePrefs(snapshot.value)
      : { ...DEFAULT_PREFS }
  publish(derive(form.getSnapshot()))
  return form.subscribe(() => publish(derive(form.getSnapshot())))
}
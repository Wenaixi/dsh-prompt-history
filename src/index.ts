/**
 * dsh-prompt-history 的 Host 半侧。
 *
 * 浏览器半侧通过 package.json 的 exports["./client"] 交付，由 Loader 挂在与
 * 本条目同名的行上；这里只负责声明宿主可见的配置 schema。
 *
 * Settings 命名空间就是 Loader 条目 id（dsh-settings 取 entry.options.id），
 * 而 cordis.patch.yml 里的行 id 为 dsh-prompt-history，所以不需要在此注册命名
 * 空间：宿主会把这个条目的 volatile 字段投影成一份表单。
 */

import type { Context } from '@deepseek-ai/cordis'
// 仅类型：把可选的 ctx.settings（SettingsForms）服务合并进 Context。
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** 插件的用户配置，字段名与浏览器半侧的 PluginPrefs 一一对应。 */
export interface Config {
  /** 选中文本之后的复制行为：off / toolbar / auto。 */
  copyMode: 'off' | 'toolbar' | 'auto'
  /** 输入框上右键是否直接粘贴。 */
  rightClickPaste: boolean
  /** 上下键历史是否启用。 */
  historyEnabled: boolean
  /** 上下键历史是否跨会话保留。 */
  globalHistory: boolean
  /** 是否显示聊天目录把手。 */
  tocVisible: boolean
}

/**
 * 配置 schema。
 *
 * 四个字段都必须标记 volatile：Settings 只把 volatile 字段投影成表单，
 * 普通字段无法从插件详情页写入。默认值必须与 cordis.patch.yml 里写的
 * config 逐字段一致，否则 config-editor 会判定配置被更高层覆盖而拒绝写入。
 */
export const Config = z.object({
  copyMode: z.union(['off', 'toolbar', 'auto']).default('toolbar').volatile(),
  rightClickPaste: z.boolean().default(true).volatile(),
  historyEnabled: z.boolean().default(true).volatile(),
  globalHistory: z.boolean().default(false).volatile(),
  tocVisible: z.boolean().default(true).volatile(),
})

export function apply(ctx: Context, _config: Config): void {
  // 自带配置页面的插件必须显式声明不自动生成页面，否则宿主会再造一份，
  // 配置入口出现两份。settings 服务是可选的：缺失时插件其余能力照常运行。
  ctx.inject(['settings'], (sctx) => {
    ctx.effect(() => sctx.settings.configure({ auto: false }, ctx.fiber))
  })
}
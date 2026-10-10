/**
 * Prompt-history plugin browser half: composer history plus the plugin-detail
 * configuration card.
 *
 * 配置通路完全走官方组合，不自建任何 HTTP 端点：
 *   设置卡 -> ConfigForm(Host 表单) -> remote.settings -> 宿主 ctx.settings -> profile patch
 * configForms 是可选服务，用 ctx.inject 动态获取：宿主没有配置服务时静默降级，
 * 输入历史、复制引用与右键粘贴照常工作，只是没有配置入口。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: SlotMap merges for the mounted slots plus the `configForms` service.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { InputHistory } from './InputHistory.tsx'
import { SettingsCardSlot } from './SettingsCard.tsx'
import { SettingsCardController } from './card-controller.ts'
import { NS, en, zh } from './locales.ts'
import { setTranslator } from './i18n.ts'
import { bindHostForm } from './prefs.ts'
import { hasInlineSlash } from './claim-guard.ts'

/** 宿主 Settings 命名空间：等于 Loader 条目 id，与 cordis.patch.yml 的行 id 一致。 */
const HOST_NS = NS
/** 插槽匹配键：plugins.bundle.config 按包名渲染（plugin-manager 的 configured 判定）。 */
const PKG = '@wenaixi/dsh-prompt-history'

/** 客户端必需服务：slot 注册与文案。configForms 是可选的，见 apply。 */
export const inject = ['slots', 'locale']

const SETTINGS_CSS = [
  // 外壳由本插件自绘（unavailable/readOnly/保存失败与自愈提示都在这里渲染），
  // 行内布局、单选块与健康维护区域也在这里。颜色、圆角、间距一律走宿主 token，浅色/深色自动跟随。
  '.dsh-ph-notice{margin:0 0 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);}',
  '.dsh-ph-failed-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;margin-bottom:14px;background:var(--dsw-alias-state-error-subtle);border:.5px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-md);font-size:13px;line-height:1.4;color:var(--dsw-alias-label-primary);}',
  '.dsh-ph-success-banner{display:flex;align-items:center;padding:8px 12px;margin-bottom:14px;background:var(--dsw-alias-state-success-subtle);border:.5px solid var(--dsw-alias-state-success-primary);border-radius:var(--dsw-radius-md);font-size:13px;color:var(--dsw-alias-state-success-primary);}',
  '.dsh-ph-inline-link{color:var(--dsw-alias-state-business-primary);text-decoration:underline;cursor:pointer;background:none;border:none;padding:0;font:inherit;font-weight:500;}',
  '.dsh-ph-group{display:flex;flex-direction:column;gap:4px;margin-top:18px;}',
  '.dsh-ph-group:first-child{margin-top:0;}',
  '.dsh-ph-groupTitle{margin:0;font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-secondary);}',
  '.dsh-ph-groupBody{display:flex;flex-direction:column;}',
  '.dsh-ph-row{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.dsh-ph-groupBody>.dsh-ph-row:first-child{border-top:.5px solid var(--dsw-alias-border-l2);}',
  '.dsh-ph-row:last-child{border-bottom:none;}',
  '.dsh-ph-rowColumn{flex-direction:column;align-items:stretch;gap:12px;}',
  '.dsh-ph-rowText{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1;}',
  '.dsh-ph-rowTitle{margin:0;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);}',
  '.dsh-ph-rowHint{margin:0;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-tertiary);}',
  '.dsh-ph-rowControl{flex:none;margin-top:2px;}',
  '.dsh-ph-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
  '.dsh-ph-option{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;}',
  '.dsh-ph-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);}',
  '.dsh-ph-option.isSelected{border-color:var(--dsw-alias-state-business-primary);box-shadow:inset 0 0 0 .5px var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-2);}',
  '.dsh-ph-option:disabled{opacity:.5;cursor:default;}',
  '.dsh-ph-optionTitle{font-size:13.5px;font-weight:500;line-height:20px;}',
  '.dsh-ph-optionHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);}',
  '.dsh-ph-health-row{margin:10px 0 6px;}',
  '.dsh-ph-health-box{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);}',
  '.dsh-ph-health-box.isHealthy{border-color:var(--dsw-alias-state-success-primary);}',
  '.dsh-ph-health-box.isWarning{border-color:var(--dsw-alias-state-warning-primary);background:var(--dsw-alias-state-warning-subtle);}',
  '.dsh-ph-health-dot{width:8px;height:8px;border-radius:50%;flex:none;}',
  '.dsh-ph-health-dot.isHealthy{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 6px var(--dsw-alias-state-success-primary);}',
  '.dsh-ph-health-dot.isWarning{background:var(--dsw-alias-state-warning-primary);box-shadow:0 0 6px var(--dsw-alias-state-warning-primary);}',
  '.dsh-ph-health-info{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}',
  '.dsh-ph-health-title{font-size:13.5px;font-weight:500;color:var(--dsw-alias-label-primary);}',
  '.dsh-ph-health-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.4;}',
  '.dsh-ph-heal-btn{flex:none;}',
  '.dsh-ph-adv-container{margin-top:8px;}',
  '.dsh-ph-adv-toggle{display:flex;align-items:center;gap:6px;background:none;border:none;padding:6px 0;color:var(--dsw-alias-label-secondary);font-size:12.5px;cursor:pointer;}',
  '.dsh-ph-adv-toggle:hover{color:var(--dsw-alias-label-primary);}',
  '.dsh-ph-adv-pane{margin-top:8px;padding:12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);display:flex;flex-direction:column;gap:12px;}',
  '.dsh-ph-adv-actions{display:flex;gap:8px;align-items:center;}',
  '.dsh-ph-import-box{display:flex;flex-direction:column;gap:8px;align-items:flex-end;}',
  '.dsh-ph-textarea{box-sizing:border-box;width:100%;min-height:56px;padding:8px 10px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-mono, monospace);font-size:12px;line-height:1.4;resize:vertical;}',
  '.dsh-ph-foot{display:flex;align-items:center;justify-content:flex-end;gap:16px;margin-top:16px;}',
].join('')

/** 宿主每会话一个触发控制器；这里只用到补全管线的 track 入口。 */
interface TriggerPatch {
  track: (draft: string, caret: number, guard: { tier: string } | null | undefined, draftRev: number) => void
}

/** 已补装 track 补丁的控制器，防止同一会话重复包装。 */
const patched = new WeakSet<object>()
const ORIG_TRACK = Symbol.for('dsh.ph.origTrack')

export function apply(ctx: ClientContext): void {
  const style = document.createElement('style')
  style.dataset.pluginCss = 'dsh-ph-settings'
  style.textContent = SETTINGS_CSS
  ctx.effect(() => {
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'dsh-prompt-history: settings styles')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-prompt-history: dictionaries')
  setTranslator(ctx.locale.bind(NS))
  ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
    { name: 'conversation.input.right', id: 'dsh-prompt-history' },
    InputHistory,
  )), 'dsh-prompt-history: composer input slot')

  // 配置卡只在宿主真的提供这份命名空间时注册：宿主没有 settings 服务时，
  // 页面里就不会出现一个点开是空的配置区。
  ctx.inject(['configForms'], (raw) => {
    const forms = raw.configForms
    if (typeof forms?.get !== 'function' || typeof forms.whileServed !== 'function') return
    ctx.effect(() => forms.whileServed([HOST_NS], () => {
      const form = forms.get<Record<string, unknown>>(HOST_NS)
      // 功能组件与设置卡共享同一份宿主快照，写入即时反映到输入行为。
      ctx.effect(() => bindHostForm(form), 'dsh-prompt-history: host preferences')
      // 设置卡没有保存按钮：操作即写，写入由宿主 ConfigForm 排队与做 revision 栅栏。
      const controller = new SettingsCardController(form)
      ctx.effect(() => () => controller.dispose(), 'dsh-prompt-history: config card controller')
      return ctx.slots.register(
        { name: 'plugins.bundle.config', key: PKG, locale: NS, inject: () => controller.inject() },
        SettingsCardSlot,
      )
    }), 'dsh-prompt-history: plugin config card')
  })

  // 认领态行内斜杠补全：宿主 detectTrigger 在 guard.tier === "claimed" 时硬跳过所有
  // "/"（前导命令已认领草稿，后续斜杠一律按参数文本处理）。这让 "/plan /skill" 这类
  // 命令参数里的技能补全静默失效。这里把守卫放宽：光标位于行内斜杠时降级为 plain，
  // 让宿主补全管线照常跑。前导位置（"/plan " 本身）不受影响，仍走原认领语义。
  // ponytail: 依赖 sessionOf().track 这条内部路径，宿主重构触发控制器时静默失效
  // （退回裸宿主行为，不报错）；升级 DSH 后重跑隔离实例的 "/plan /ds" 验收即可确认。
  ctx.inject(['inputTriggers'], (raw) => {
    const service = (raw as unknown as Record<string, unknown>).inputTriggers as
      | { sessionOf?: (scope: unknown) => TriggerPatch | undefined }
      | undefined
    const resolve = service?.sessionOf
    if (typeof resolve !== 'function') return
    // 包一层 sessionOf：每个会话控制器首次取到时补装 track 补丁，卸载时全面还原会话与宿主服务。
    ctx.effect(() => {
      let active = true
      const live = new Set<WeakRef<object>>()
      service!.sessionOf = (scope: unknown): TriggerPatch | undefined => {
        const controller = resolve.call(service, scope)
        if (controller === undefined || typeof controller.track !== 'function') return controller
        const c = controller as unknown as Record<symbol, unknown> & { track: unknown }
        if (!c[ORIG_TRACK]) {
          c[ORIG_TRACK] = controller.track
          live.add(new WeakRef(controller))
          const origTrack = c[ORIG_TRACK] as TriggerPatch['track']
          controller.track = (draft, caret, guard, draftRev) => {
            // 行内斜杠（光标前最近一个空白之后有 "/"）才放宽；无斜杠的前导认领照旧。
            if (active && guard?.tier === 'claimed' && hasInlineSlash(draft, caret)) {
              return origTrack.call(controller, draft, caret, { ...guard, tier: 'plain' }, draftRev)
            }
            return origTrack.call(controller, draft, caret, guard, draftRev)
          }
        }
        return controller
      }
      return () => {
        active = false
        service!.sessionOf = resolve
        for (const r of live) {
          const c = r.deref() as (Record<symbol, unknown> & { track: unknown }) | undefined
          if (c && c[ORIG_TRACK]) {
            c.track = c[ORIG_TRACK]
            delete c[ORIG_TRACK]
          }
        }
        live.clear()
      }
    }, 'dsh-prompt-history: input triggers patch')
  })
}

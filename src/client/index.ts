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

/** 宿主 Settings 命名空间：等于 Loader 条目 id，与 cordis.patch.yml 的行 id 一致。 */
const HOST_NS = NS
/** 插槽匹配键：plugins.bundle.config 按包名渲染（plugin-manager 的 configured 判定）。 */
const PKG = '@wenaixi/dsh-prompt-history'

/** 客户端必需服务：slot 注册与文案。configForms 是可选的，见 apply。 */
export const inject = ['slots', 'locale']

const SETTINGS_CSS = [
  // 外壳由本插件自绘（unavailable/readOnly/保存失败提示都在这里渲染），
  // 行内布局与单选块也在这里。颜色、圆角、间距一律走宿主 token，浅色/深色自动跟随。
  '.dsh-ph-notice{margin:0 0 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);}',
  '.dsh-ph-failed{color:var(--dsw-alias-state-error-primary);}',
  '.dsh-ph-group{display:flex;flex-direction:column;gap:4px;margin-top:16px;}',
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
  '.dsh-ph-foot{display:flex;align-items:center;justify-content:flex-end;gap:16px;margin-top:16px;}',
].join('')

export function apply(ctx: ClientContext): void {
  const style = document.createElement('style')
  style.dataset.pluginCss = 'dsh-ph-settings'
  style.textContent = SETTINGS_CSS
  document.head.appendChild(style)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-prompt-history: dictionaries')
  setTranslator(ctx.locale.bind(NS))
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
    { name: 'conversation.input.right', id: 'dsh-prompt-history' },
    InputHistory,
  ))
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

  // 修复宿主缺陷：解除 claimed 状态下对行内斜杠技能补全（如 /plan /dsh-plugin-dev）的强力压制。
  // 宿主底层 detectTrigger 在 guard.tier === 'claimed' 时硬编码跳过所有 '/'，导致前导命令参数里的技能无法弹出补全；
  // 此处在控制器 track 时拦截，当处于 claimed 但光标处检测到行内斜杠触发时，将 tier 放宽为 plain。
  ctx.inject(['inputTriggers'], (raw) => {
    const service = (raw as unknown as Record<string, unknown>).inputTriggers as {
      sessionOf?: (actx: unknown) => { track?: (draft: string, caret: number, guard: { tier: string } | null | undefined, draftRev: number) => void; __dshPhUnsuppressed?: boolean }
    } | undefined
    if (typeof service?.sessionOf !== 'function') return
    const rawSessionOf = service.sessionOf.bind(service)
    service.sessionOf = (actx: unknown) => {
      const controller = rawSessionOf(actx)
      if (controller && typeof controller.track === 'function' && !controller.__dshPhUnsuppressed) {
        controller.__dshPhUnsuppressed = true
        const rawTrack = controller.track.bind(controller)
        controller.track = (draft: string, caret: number, guard: { tier: string } | null | undefined, draftRev: number) => {
          if (guard?.tier === 'claimed') {
            const before = draft.slice(0, caret)
            const lastSpace = before.lastIndexOf(' ')
            if (lastSpace !== -1 && before.slice(lastSpace).includes('/')) {
              guard = { ...guard, tier: 'plain' }
            }
          }
          return rawTrack(draft, caret, guard, draftRev)
        }
      }
      return controller
    }
  })
}

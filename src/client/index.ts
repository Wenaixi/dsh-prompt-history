/**
 * Prompt-history plugin browser half: composer history plus the plugin-detail
 * configuration card.
 *
 * 配置通路完全走官方组合，不自建任何 HTTP 端点：
 *   设置卡 -> ConfigForm(Host 表单) -> remote.settings -> 宿主 ctx.settings -> profile patch
 * configForms 是可选服务，用 ctx.inject 动态获取：宿主没有配置服务时静默降级，
 * 输入历史、复制引用、右键粘贴与 Chat TOC 照常工作，只是没有配置入口。
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
import { NS, en, zh } from './locales.ts'
import { setTranslator } from './i18n.ts'
import { bindRootContext } from './sessionCtx.ts'
import { bindHostForm } from './prefs.ts'

/** 宿主 Settings 命名空间：等于 Loader 条目 id，与 cordis.patch.yml 的行 id 一致。 */
const HOST_NS = NS

/** 客户端必需服务：slot 注册与文案。configForms 是可选的，见 apply。 */
export const inject = ['slots', 'locale']

const SETTINGS_CSS = [
  // 宿主已经画好 section 容器与排版节奏，这里只负责行与行之间的节奏；
  // 颜色、圆角、间距一律走宿主 token，浅色/深色自动跟随。
  '.dsh-ph-card{display:flex;flex-direction:column;gap:20px;max-width:560px;}',
  '.dsh-ph-group{display:flex;flex-direction:column;gap:4px;}',
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
  '.dsh-ph-rowBadge{flex:none;margin-top:2px;padding:2px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;}',
  '.dsh-ph-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
  '.dsh-ph-option{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;}',
  '.dsh-ph-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);}',
  '.dsh-ph-option.isSelected{border-color:var(--dsw-alias-state-business-primary);box-shadow:inset 0 0 0 .5px var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-2);}',
  '.dsh-ph-option:disabled{opacity:.5;cursor:default;}',
  '.dsh-ph-optionTitle{font-size:13.5px;font-weight:500;line-height:20px;}',
  '.dsh-ph-optionHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);}',
  '.dsh-ph-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;}',
  '.dsh-ph-footStatus{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);}',
  // Chat TOC 面板与把手：与设置区无关，沿用既有样式。
  '.dsh-ph-toc-grip{position:fixed;z-index:2147483000;width:20px;height:52px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-specific-menu);background:color-mix(in srgb,var(--dsw-specific-menu) 88%,#000);box-shadow:0 1px 4px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1;cursor:pointer;opacity:.65;transition:opacity .15s;display:flex;align-items:center;justify-content:center;padding:0;}',
  '.dsh-ph-toc-grip:hover{opacity:1;background:var(--dsw-alias-bg-layer-2);}',
  '.dsh-ph-toc{position:fixed;z-index:2147483000;width:300px;max-height:min(60vh,480px);display:flex;flex-direction:column;padding:8px;border-radius:12px;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 8px 28px rgba(0,0,0,.25);box-sizing:border-box;}',
  '.dsh-ph-toc-title{margin:0 4px 6px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);flex-shrink:0;}',
  '.dsh-ph-toc-list{overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;box-sizing:border-box;min-height:0;flex:1 1 auto;overscroll-behavior:contain;}',
  '.dsh-ph-toc-item{flex-shrink:0;display:flex;align-items:center;gap:8px;width:100%;height:28px;text-align:left;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;box-sizing:border-box;}',
  '.dsh-ph-toc-item:hover{background:var(--dsw-alias-bg-layer-2);}',
  '.dsh-ph-toc-idx{flex:none;min-width:24px;text-align:right;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;line-height:1;}',
  '.dsh-ph-toc-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4;}',
  '.dsh-ph-toc-tip{position:fixed;z-index:2147483001;max-width:min(420px,calc(100vw - 24px));max-height:min(40vh,300px);overflow-y:auto;padding:8px 10px;border-radius:8px;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 6px 20px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;pointer-events:none;box-sizing:border-box;}',
  '.dsh-ph-toc-resize{position:absolute;right:3px;bottom:3px;width:14px;height:14px;cursor:se-resize;border-radius:3px;opacity:.55;}',
].join('')

export function apply(ctx: ClientContext): void {
  const style = document.createElement('style')
  style.dataset.pluginCss = 'dsh-ph-settings'
  style.textContent = SETTINGS_CSS
  document.head.appendChild(style)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-prompt-history: dictionaries')
  setTranslator(ctx.locale.bind(NS))
  bindRootContext(ctx)
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
      return ctx.slots.register(
        { name: 'plugins.bundle.config', key: 'dsh-prompt-history', locale: NS, inject: () => ({ hostForm: form }) },
        SettingsCardSlot,
      )
    }), 'dsh-prompt-history: plugin config card')
  })
}
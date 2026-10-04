/**
 * Prompt-history plugin browser half: composer history plus the plugin-detail
 * configuration card.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { InputHistory } from './InputHistory.tsx'
import { SettingsCardSlot } from './SettingsCard.tsx'
import { NS, en, zh } from './locales.ts'
import { setTranslator } from './i18n.ts'
import { bindRootContext } from './sessionCtx.ts'

export const inject = ['slots', 'locale']

const SETTINGS_CSS = [
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
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
    { name: 'plugins.bundle.config', key: 'dsh-prompt-history', locale: NS },
    SettingsCardSlot,
  ))
}

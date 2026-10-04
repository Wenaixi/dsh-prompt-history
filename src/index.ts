/**
 * dsh-prompt-history, node half. The Host schema exposes the preferences to
 * the plugin appears in the host cordis.yml / Loader; the browser half ships
 * via exports["./client"], discovered through the package.json dsh.client
 * declaration.
 */

import z from '@deepseek-ai/schemastery'

export interface Config {
  copyMode: 'toolbar' | 'auto'
  rightClickPaste: boolean
  globalHistory: boolean
  tocVisible: boolean
}

export const Config = z.object({
  copyMode: z.union(['toolbar', 'auto']).default('toolbar').volatile(),
  rightClickPaste: z.boolean().default(true).volatile(),
  globalHistory: z.boolean().default(false).volatile(),
  tocVisible: z.boolean().default(true).volatile(),
})

export function apply(): void {}

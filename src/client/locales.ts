/**
 * dsh-prompt-history 的界面文案（zh/en）。当前语言跟随 DSH 应用语言，
 * `en` 由 `zh` 的键集合约束，保证两种语言不会漏项。
 *
 * 文案成对出现：标题是设置项的名字，说明回答「它做什么、什么时候用」。
 * 标题必须短，长句不再塞进开关的标签里。
 */

/** 本插件的 locale 命名空间。 */
export const NS = 'dsh-prompt-history'

/** zh 字典：键集合的权威来源。 */
const zh = {
  'settings.group.input': '输入历史',
  'settings.group.copy': '复制与粘贴',
  'settings.group.toc': '会话目录',
  'settings.row.history': '上下键历史',
  'settings.row.history.hint': '在输入框里按 ↑ 调出上一条提问、↓ 调出下一条；先打字再按 ↑，只在以这串字开头的历史里找。再按一次 Ctrl+R 可以按任意关键词倒着搜。',
  'settings.row.copy': '选中文本后',
  'settings.row.copy.hint': '在输入框里选中文本之后，复制和引用怎么触发。',
  'copyMode.off': '什么都不做',
  'copyMode.off.hint': '选中文字不会有任何反应，也不显示复制按钮；右键粘贴和手动 Ctrl+C 照常可用。',
  'copyMode.toolbar': '弹出工具栏',
  'copyMode.toolbar.hint': '选中文本后浮出一排按钮，点复制或引用。',
  'copyMode.auto': '选中即复制',
  'copyMode.auto.hint': '选中文本稳定后立刻写入剪贴板，不再显示工具栏。',
  'settings.row.paste': '右键直接粘贴',
  'settings.row.paste.hint': '在输入框上右键即粘贴剪贴板内容，不弹出浏览器右键菜单。',
  'settings.row.global': '跨会话记忆',
  'settings.row.global.hint': '上下键历史在会话之间保留，最多记住 200 条。',
  'settings.row.toc': '会话目录',
  'settings.row.toc.hint': '在对话左侧显示可拖动的目录把手，点击条目跳到对应提问。',
  'settings.alwaysOn': '始终开启',
  'settings.reset': '恢复默认',
  'settings.confirmReset': '把全部设置恢复为默认值？',
  'settings.saveFailed': '保存失败，请检查连接后重试。',
  'settings.readOnly': '当前配置文档为只读，改动不会被保存。',
  'toolbar.copy': '复制',
  'toolbar.quote': '引用',
  'pill.copied': '已复制',
  'pill.quoted': '已引用',
  'toc.title': '会话目录',
  'toc.aria': '会话目录（可拖动）',
  'toc.resize': '拖动右下角调整面板大小',
  'search.noMatch': '无匹配',
} as const

/** en 字典：键集合必须与 zh 完全一致。 */
const en: Record<keyof typeof zh, string> = {
  'settings.group.input': 'Input history',
  'settings.group.copy': 'Copy and paste',
  'settings.group.toc': 'Conversation directory',
  'settings.row.history': 'Up/Down history',
  'settings.row.history.hint': 'Press Up in the input box to recall the previous prompt, Down for the next one. Type something first and Up then only matches history starting with that text. Press Ctrl+R again to search backwards by any keyword.',
  'settings.row.copy': 'After selecting text',
  'settings.row.copy.hint': 'What happens when you select text inside the input box.',
  'copyMode.off': 'Nothing',
  'copyMode.off.hint': 'Selecting text does nothing and no buttons appear; right-click paste and manual Ctrl+C keep working.',
  'copyMode.toolbar': 'Show a toolbar',
  'copyMode.toolbar.hint': 'A small toolbar appears on the selection with copy and quote.',
  'copyMode.auto': 'Copy immediately',
  'copyMode.auto.hint': 'The selection goes to the clipboard as soon as it settles; no toolbar.',
  'settings.row.paste': 'Right-click paste',
  'settings.row.paste.hint': 'Right-clicking the input box pastes the clipboard directly, without the browser context menu.',
  'settings.row.global': 'Cross-session memory',
  'settings.row.global.hint': 'The Up/Down history survives a session switch, up to 200 entries.',
  'settings.row.toc': 'Conversation directory',
  'settings.row.toc.hint': 'Show a draggable grip on the left edge of the chat; click an entry to jump to that prompt.',
  'settings.alwaysOn': 'Always on',
  'settings.reset': 'Restore defaults',
  'settings.confirmReset': 'Restore every setting to its default?',
  'settings.saveFailed': 'Save failed. Check the connection and try again.',
  'settings.readOnly': 'This configuration document is read-only; changes will not be saved.',
  'toolbar.copy': 'Copy',
  'toolbar.quote': 'Quote',
  'pill.copied': 'Copied',
  'pill.quoted': 'Quoted',
  'toc.title': 'Conversation TOC',
  'toc.aria': 'Conversation TOC (draggable)',
  'toc.resize': 'Drag the corner to resize',
  'search.noMatch': 'no match',
}

/** 本插件全部文案键的联合类型。 */
export type PromptHistoryKey = keyof typeof zh

/** 把命名空间并入 slot 的 locale 表，提供带类型的 t 与 bind。 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-prompt-history': PromptHistoryKey
  }
}

export { zh, en }
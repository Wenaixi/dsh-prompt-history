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
  'settings.row.gesture': '打开历史列表',
  'settings.row.gesture.hint': '决定用什么键调出全部历史列表。列表里打字过滤、↑↓ 选择、Enter 回填、Esc 取消。',
  'historyGesture.ctrlR': '只用 Ctrl+R',
  'historyGesture.ctrlR.hint': '终端里的老习惯；双击 Esc 完全不响应。',
  'historyGesture.esc': '只用双击 Esc',
  'historyGesture.esc.hint': '在输入框为空时连按两次 Esc（800 毫秒内）；Ctrl+R 不响应。',
  'historyGesture.both': '两者都要',
  'historyGesture.both.hint': 'Ctrl+R 与双击 Esc 都打开同一个列表。用 vi 模式的人若被误触困扰，可改成只留 Ctrl+R。',
  'settings.reset': '恢复默认',
  'settings.saveFailed': '本部署没有接受这些值，已保留供你修改。',
  'settings.readOnly': '本部署的设置为只读。',
  'settings.unavailable': '该插件当前未加载，暂时无法配置。',
  'toolbar.copy': '复制',
  'toolbar.quote': '引用',
  'pill.copied': '已复制',
  'pill.quoted': '已引用',
  'search.noMatch': '无匹配',
  'history.hint': '↑↓ 选择 · Enter 回填 · Esc 取消',
  'history.noMatch': '没有匹配的历史',
} as const

/** en 字典：键集合必须与 zh 完全一致。 */
const en: Record<keyof typeof zh, string> = {
  'settings.group.input': 'Input history',
  'settings.group.copy': 'Copy and paste',
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
  'settings.row.gesture': 'Open history list',
  'settings.row.gesture.hint': 'Which key opens the full history list. In the list you can type to filter, move with Up/Down, fill with Enter, and cancel with Esc.',
  'historyGesture.ctrlR': 'Ctrl+R only',
  'historyGesture.ctrlR.hint': 'The familiar terminal habit; double Escape does nothing.',
  'historyGesture.esc': 'Double Escape only',
  'historyGesture.esc.hint': 'Press Esc twice within 800 ms while the input box is empty; Ctrl+R does nothing.',
  'historyGesture.both': 'Both',
  'historyGesture.both.hint': 'Ctrl+R and double Escape open the same list. Switch to Ctrl+R only if double Escape gets in your way.',
  'settings.reset': 'Restore defaults',
  'settings.saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
  'settings.readOnly': 'This deployment stores settings read-only.',
  'settings.unavailable': 'This plugin is not loaded, so it cannot be configured right now.',
  'toolbar.copy': 'Copy',
  'toolbar.quote': 'Quote',
  'pill.copied': 'Copied',
  'pill.quoted': 'Quoted',
  'search.noMatch': 'no match',
  'history.hint': 'Up/Down to move · Enter to fill · Esc to cancel',
  'history.noMatch': 'No matching prompt',
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
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
  'settings.group.clipboard': '复制与剪贴板',
  'settings.group.history': '历史回溯与快捷手势',
  'settings.group.search': '历史搜索面板',
  'settings.group.maintenance': '配置健康与自愈维护',
  'settings.health.healthy': '配置健康',
  'settings.health.healthy.desc': '全部 9 项参数完整健康，与宿主标准完全一致。',
  'settings.health.degraded': '配置存在残缺',
  'settings.health.corrupted': '配置损坏或含废弃键',
  'settings.health.healBtn': '一键自愈并重新生成配置',
  'settings.health.healing': '正在自愈重构中...',
  'settings.health.healed': '配置已成功自愈并重新写入宿主！',
  'settings.health.saveFailedNotice': '保存被宿主拒绝，通常是因为配置残缺或残留了旧版本的废弃键。',
  'settings.health.saveFailedHeal': '立即自愈修复',
  'settings.tools.export': '复制配置 (JSON)',
  'settings.tools.exported': '已复制配置到剪贴板',
  'settings.tools.importPlaceholder': '在此粘贴损坏或待提取的配置文本或 JSON 片段...',
  'settings.tools.importHeal': '从文本安全提取并重新生成',
  'settings.tools.advancedTitle': '高级维护与配置提取',
  'settings.group.input': '输入历史',
  'settings.group.copy': '复制与粘贴',
  'settings.row.history': '上下键历史',
  'settings.row.history.hint': '在输入框里按 ↑ 从最近一条提问逐条往回、↓ 往更新方向走；回到原位恢复开始浏览前那一行。光标在输入框为空时按 ↑ 也可直接调出历史。',
  'settings.row.doubleEsc': '双击 Esc',
  'settings.row.doubleEsc.hint': '输入框有内容时连按两次 Esc（800 毫秒内）把草稿存入历史后清空；为空时打开历史列表。关闭后 Esc 完全交还宿主。',
  'settings.row.maxHistory': '历史条数上限',
  'settings.row.maxHistory.hint': '上下键历史与历史列表最多记住多少条；超出后最旧的被丢弃。',
  'settings.row.relativeTime': '显示相对时间',
  'settings.row.relativeTime.hint': '历史列表每行开头显示「5 分钟前 / 3 小时前」这类相对时间。',
  'settings.row.fuzzy': '模糊匹配',
  'settings.row.fuzzy.hint': '历史列表过滤时，除了按包含匹配，还允许字符子序列模糊匹配（例如搜「dpl」也能找到「deploy now」）。',
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
  'settings.row.global.hint': '上下键历史在会话之间保留，最多记住「历史条数上限」条。',
  'settings.row.ignoreSpace': '前导空格忽略历史',
  'settings.row.ignoreSpace.hint': '以空格开头的提问不记录到历史中（对齐 Bash ignorespace），适合临时或敏感指令。',
  'settings.reset': '恢复默认',
  'settings.saveFailed': '本部署没有接受这些值，已保留供你修改。',
  'settings.readOnly': '本部署的设置为只读。',
  'settings.unavailable': '该插件当前未加载，暂时无法配置。',
  'toolbar.copy': '复制',
  'toolbar.quote': '引用',
  'pill.copied': '已复制',
  'pill.quoted': '已引用',
  'search.noMatch': '无匹配',
  'history.title': '搜索提问',
  'history.hint': '↑↓ 导航 · Enter 使用 · Esc 取消',
  'history.noMatch': '没有匹配的历史',
  'history.relative.now': '刚刚',
  'history.relative.m': '分钟前',
  'history.relative.h': '小时前',
  'history.relative.d': '天前',
  'history.moreLines': '更多行',
  'esc.again': '再按一次 Esc 清空输入',
} as const

/** en 字典：键集合必须与 zh 完全一致。 */
const en: Record<keyof typeof zh, string> = {
  'settings.group.clipboard': 'Copy & Clipboard',
  'settings.group.history': 'History & Shortcuts',
  'settings.group.search': 'History Search Palette',
  'settings.group.maintenance': 'Configuration Health & Self-Healing',
  'settings.health.healthy': 'Config Healthy',
  'settings.health.healthy.desc': 'All 9 parameters are complete, valid, and aligned with host schema.',
  'settings.health.degraded': 'Config Incomplete',
  'settings.health.corrupted': 'Config Corrupted or Contains Obsolete Keys',
  'settings.health.healBtn': 'Heal & Regenerate Configuration',
  'settings.health.healing': 'Healing and regenerating...',
  'settings.health.healed': 'Configuration successfully healed and regenerated!',
  'settings.health.saveFailedNotice': 'Host rejected settings update, likely due to missing fields or obsolete keys.',
  'settings.health.saveFailedHeal': 'Auto-heal now',
  'settings.tools.export': 'Copy Config (JSON)',
  'settings.tools.exported': 'Config copied to clipboard',
  'settings.tools.importPlaceholder': 'Paste corrupted text or JSON snippet here to extract...',
  'settings.tools.importHeal': 'Extract & Regenerate from Text',
  'settings.tools.advancedTitle': 'Advanced Maintenance & Config Extraction',
  'settings.group.input': 'Input history',
  'settings.group.copy': 'Copy and paste',
  'settings.row.history': 'Up/Down history',
  'settings.row.history.hint': 'Press Up with the caret on the first line to walk back through prompts one by one from the most recent, Down to walk forward; reaching the bottom restores the line you were typing before browsing.',
  'settings.row.doubleEsc': 'Double Escape',
  'settings.row.doubleEsc.hint': 'With text in the box, pressing Esc twice within 800 ms saves the draft to history and clears the input; with an empty box it opens the history list. Off hands Escape back to the Host.',
  'settings.row.maxHistory': 'Max history entries',
  'settings.row.maxHistory.hint': 'How many prompts the Up/Down history and the history list remember at most; older entries are dropped.',
  'settings.row.relativeTime': 'Relative time',
  'settings.row.relativeTime.hint': 'Show a "5m ago / 3h ago" relative timestamp at the start of each history-list row.',
  'settings.row.fuzzy': 'Fuzzy match',
  'settings.row.fuzzy.hint': 'Besides substring matches, the history-list filter also allows character-subsequence matches (e.g. "dpl" finds "deploy now").',
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
  'settings.row.global.hint': 'The Up/Down history survives a session switch, keeping up to the max-history limit.',
  'settings.row.ignoreSpace': 'Ignore Leading Space',
  'settings.row.ignoreSpace.hint': 'Prompts starting with a space are not saved to history (like Bash ignorespace), ideal for temporary or sensitive commands.',
  'settings.reset': 'Restore defaults',
  'settings.saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
  'settings.readOnly': 'This deployment stores settings read-only.',
  'settings.unavailable': 'This plugin is not loaded, so it cannot be configured right now.',
  'toolbar.copy': 'Copy',
  'toolbar.quote': 'Quote',
  'pill.copied': 'Copied',
  'pill.quoted': 'Quoted',
  'search.noMatch': 'no match',
  'history.title': 'Search prompts',
  'history.hint': 'Up/Down to move · Enter to use · Esc to cancel',
  'history.noMatch': 'No matching prompt',
  'history.relative.now': 'just now',
  'history.relative.m': 'min ago',
  'history.relative.h': 'hr ago',
  'history.relative.d': 'd ago',
  'history.moreLines': 'more lines',
  'esc.again': 'Esc again to clear',
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
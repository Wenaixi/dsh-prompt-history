# Changelog

本仓库的版本历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [2.2.2] - 2026-10-06

### 修复

- **解除前导命令认领态下行内斜杠技能补全压制**：`/plan` 这类带参命令在按空格后被宿主认领，输入框进入 `claimed` 阶段，其底层 `detectTrigger` 有一行硬编码 `if (guard.tier === "claimed") continue`，把后续所有斜杠一律当成命令参数文本，导致 `/plan /dsh-plugin-dev`、`/plan /browser-harness` 敲不出任何补全（主症状）。插件注入 `inputTriggers` 服务并包装每会话控制器的 `track`：只要光标位于「段前有正文的行内斜杠」，就把守卫降级回 `plain` 让宿主补全管线照常跑。判定逻辑收敛在 `claim-guard.ts` 的 `hasInlineSlash`（纯函数，5 项单测），边界语义：
  - `/plan /ds`、`/plan /dsh-plugin-dev` 命中 → 正常弹补全；
  - `/plan`、`/plan `、`/plan off` 不命中 → 认领令牌与纯文本参数不受影响；
  - 行内斜杠是否是真触发符仍由宿主 `boundaryOk` 裁决，URL、`//` 照旧被抑制。
- **建议菜单让位选择器增强**：`OPEN_MENU` 扩为 `[role="listbox"], [data-trigger-menu]`，在宿主菜单骨架屏尚未挂载 listbox 的加载窗口期同样让位，消除按键抢占。

### 验收

隔离实例 `prompt-history-e2e-v3` + 本机 Chrome/CDP，12 项全绿（主症状、六个边界、前导技能与命令菜单未回归、URL 不误触发、双击 Esc 开面板与清空、方向键历史往返、无控制台错误），并在修复前的 `34a60e5` 源码上做对照确认症状可复现（焐热命令目录后 `/plan /ds` 的 listbox 为 0）。

## [2.2.1] - 2026-10-06

### 修复

- **双击 Esc 关闭时 Esc 让位宿主**：`doubleEsc=false` 时连按 Esc 不再被插件消费，宿主自行关闭其浮层/菜单。
- **宽屏历史面板右侧完整预览**：窗口 ≥1000px 时在列表右侧显示高亮条目的完整内容（最多 6 行，超出显示 `… +N more lines`），对齐 Claude Code `HistorySearchDialog` 的 preview。

## [2.2.0] - 2026-10-06

### 变更

- **移除 Ctrl+R 手势**：历史列表入口仅剩「输入框为空时双击 Esc」；Ctrl+R 交还浏览器（恢复原生刷新）。删除 `historyGesture` 字段与相关文案。**已有用户升级需在 `cordis.patch.yml` 里删除 `historyGesture` 行**（同 tocVisible 先例，否则配置写入会被宿主以未知键拒绝）。
- **双击 Esc 独立开关（默认开）**：新增 `doubleEsc`。开：非空草稿双击清空并存入历史、空草稿双击开历史列表；关：Esc 完全交还宿主。
- **历史面板对齐 Claude Code**：行首相对时间（`relativeTime`，默认开，条目带源事件时间戳）；过滤支持包含 + 字符子序列模糊（`fuzzyMatch`，默认开，复刻 `isSubsequence`，exact 在前 fuzzy 在后）；高亮两端夹取不环绕（复刻 FuzzyPicker `clamp`）；宽窗口（≥1000px）右侧显示选中条目完整内容预览；列表最新在顶。
- **历史条数上限可调**：新增 `maxHistoryItems`（默认 100，档位 50/100/200/500/1000），历史环与列表统一按此裁剪。

### 修复

- 历史条目从纯字符串改为 `{ text, time }`：跨会话 localStorage 环保留时间戳，旧纯字符串条目兼容显示为无相对时间。
- 相对时间格式化为 `5m / 3h / 2d` 短格式（Claude Code `formatRelativeTimeAgo` 近似）。

## [2.1.0] - 2026-10-06

### 变更

- **复刻 Claude Code 的上下键历史与双击 Esc 语义**：↑/↓ 从 bash 前缀搜索改为顺序浏览（↑ 从最新一条逐条回退、到底不环绕；↑ 回填光标签行首、↓/恢复草稿光标行尾；多行输入只在光标处于首/末行时才接管方向键，行号按 Lexical 的 `<br>` 结构计算）。双击 Esc 改为草稿非空时第一次提示、第二次存入历史后清空输入框（空草稿仍是打开历史列表）。
- **去掉设置保存按钮，改动自动保存**：配置卡不再使用官方 `SettingsForm` 外壳与 staged 草稿，开关、单选与「恢复默认」点击即写入宿主；失败时显示提示并回落到宿主真值。删除 `save/saving/conflict/draftHint` 文案键。
- **README 精简为双语文档**：主 README 改为英文，新增 `README.zh.md` 中文版；移除 `README.en.md` / `README.es.md` / `README.pt.md` 并同步 `package.json` 的 `files` 清单。

### 修复

- **Lexical 多行输入的首/末行判定**：Lexical 的换行是 `<br>` 而非 `\n`，旧实现按换行符判断会把多行草稿误判成单行，导致光标停在第二行按 ↑ 也直接进历史。改为按「host 开头到光标锚点的 `<br>` 数」计算行号；空输入框的占位 `<br>` 不计为第二行。

## [2.0.2] - 2026-10-06

### 修复

- **设置界面迁移到官方 SettingsForm 体系**：`plugins.bundle.config` 配置卡改用官方 `SettingsForm` 外壳（不可用提示、只读横幅、保存失败提示、Save/Saving、离开即丢弃草稿），保存语义改为 staged 草稿 + 一次保存。新增 `SettingsCardController`（仿官方 `dsh-client-ui-settings-subagent` 控制器）：用快照 `revision` 做冲突栅栏、保存后回读逐字段比对确认落盘、代际计数抑制卸载后的迟到回执。文案键对齐官方模板句式。
- **修复 2.0.1 客户端从未加载成功**：tsdown 产物注册 id 仍是旧名 `dsh-prompt-history`，与改名后的包名 `@wenaixi/dsh-prompt-history` 不一致，client-modules 报 `loaded without registering`，整条 client bundle 无法激活。产物 id 与 `plugins.bundle.config` 插槽 key 一并修正为包名（plugin-manager 按 `entry.options.key` 与 `pkg.name` 比对决定是否渲染配置区）。
- **设置写入文档对齐**：`cordis.patch.yml` 与 schema 默认值逐字段一致（config-editor 深比较判定）。
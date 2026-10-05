# 历史列表选择器：调研结论与实现计划

日期：2026-10-05　状态：调研完成，未动手实现

## 一、结论先行

1. Claude Code 的双击 Esc 不是历史列表，是 **rewind 回滚菜单**（MessageSelector）：选中一条用户提问后回滚对话、可选一并回滚代码。
2. Claude Code 的「输入历史文本列表」挂在 **Ctrl+R**，且只在 fullscreen 渲染下才是带上下移动的搜索对话框。
3. 双击 Esc 在 Claude Code 里是**硬编码**的，不走它的可配置键位系统。
4. 浏览器里「双击 Esc 显示全部历史」可以做，但会与三处现有 Esc 语义冲突，且中文输入法会吃掉第二次 Esc。

## 二、已查证的事实与来源

### 2.1 双击 Esc 的语义

- 打开 rewind / 消息选择器，等价命令 /rewind。来源：
  - https://github.com/anthropics/claude-code/issues/43717
  - https://kentgigger.com/posts/claude-code-escape-escape-shortcut
  - https://www.buildthisnow.com/blog/guide/mechanics/claude-code-checkpoints-rewind
- 该行为**无法通过 keybindings.json 重绑定或关闭**（issue #43717 原文：「This behavior is hardcoded and cannot be rebound or disabled through keybindings.json」）。
- 菜单内容（还原源码 src/commands/rewind/rewind.ts）：只是调用 context.openMessageSelector()，本身不做任何事。

### 2.2 Rito-w/ClaudeCode 还原源码里与本需求相关的文件（已实际读取）

| 路径 | 职责 | 关键事实 |
|---|---|---|
| src/commands/rewind/rewind.ts | /rewind 命令 | 调 openMessageSelector()，返回 skip 不追加消息 |
| src/components/MessageSelector.tsx | 那个列表本体 | `const MAX_VISIBLE_MESSAGES = 7`；把当前提问作为一个虚拟项追加在末尾；`selectedIndex` 初始为最后一项；选中项始终居中显示；逐项显示 `#序号 时间 摘要` |
| src/history.ts | 历史读写 | `MAX_HISTORY_ITEMS = 100`；全局 history.jsonl 跨项目共享；`getHistory()` 当前会话条目优先、其余会话按新到旧；`getTimestampedHistory()` 给 Ctrl+R 选择器用，按 display 去重、最新优先、只暴露 display + timestamp，粘贴内容延迟解析 |
| src/components/PromptInput/HistorySearchInput.tsx | Ctrl+R 搜索输入 | 提示文案是 `search prompts:` / `no matching prompt:` |
| src/keybindings/defaultBindings.ts | 默认键位 | Chat 上下文 `escape: 'chat:cancel'`；**没有 escape escape 绑定**。HistorySearch 上下文：`ctrl+r`=next、`escape`=accept、`tab`=accept、`ctrl+c`=cancel、`enter`=execute |
| src/keybindings/KeybindingProviderSetup.tsx | 键位调度 | `const CHORD_TIMEOUT_MS = 1000`，和弦超时 1000ms |
| src/keybindings/resolver.ts | 和弦状态机 | 按下 escape 立即取消待定和弦（chord_cancelled） |
| src/keybindings/parser.ts | 键位解析 | 支持 `escape escape` 这种空格分隔的多键和弦写法 |

结论：双击 Esc 不走上面的和弦系统（defaultBindings 里没有该绑定），因此它的判定代码在别处，本次未定位到——不编造。

### 2.3 Ctrl+R 历史搜索对话框的官方规格

来源：https://code.claude.com/docs/en/interactive-mode （官方文档，已抓取原文）

> Press `Ctrl+R` to interactively search through your command history. In fullscreen rendering, `Ctrl+R` opens a search dialog instead: type to filter, press `Up` and `Down` to move through matches, and press `Ctrl+S` to cycle the scope through this session, this project, and all projects. Press `Enter` or `Tab` to place a match in the prompt input, or `Esc` to cancel.

补充规格：
- 列表**最新优先**，重复内容折叠为最新那次。
- 命中项里**高亮搜索词**。
- 接受或取消**立即生效**，即使历史还在加载。
- classic 渲染是单行内联搜索；fullscreen 才是对话框。
- 相关回归记录：https://github.com/anthropics/claude-code/issues/55364 （从扁平搜索变成项目内选择器被当回归）、https://github.com/anthropics/claude-code/issues/70584 （即使范围选 everywhere 也只暴露最近约 18 小时约 150 条）。

### 2.4 别人怎么实现双击 Esc（带具体数字，可直接对标）

| 实现 | 判定条件 | 时间窗 | 第一次按键 | 第二次按键 |
|---|---|---|---|---|
| pi rewind 扩展（对标 Claude Code） | 智能体空闲 + 编辑器为空 + 没有对话框 | **500 ms** | 透传，不吞 | 消费（否则会立刻关掉刚打开的选择器） |
| Codex 中断确认 | 回合运行中 | 约 **2 秒**；按任意其他键清空待定状态 | 提示 `esc again` | 确认中断 |
| Claude Code 键位系统的和弦 | 通用和弦 | **1000 ms** | 进入待定 | 匹配则执行，超时则取消 |
| fzf ESC 判定 | 终端转义序列解析 | `$ESCDELAY`，fzf 曾把它降到 50 ms | — | — |

来源：
- https://cdn.jsdelivr.net/npm/@bachi/pi-coder@2.1.0/extensions/rewind/README.md
- https://github.com/openai/codex/pull/8760
- https://github.com/Rito-w/ClaudeCode/blob/main/src/keybindings/KeybindingProviderSetup.tsx
- https://github.com/junegunn/fzf/commit/43425158f4fbb961d5c365d39664912a7ebf9342

### 2.5 fzf 的对照

- `CTRL-R` 调历史命令，`CTRL-T` 调文件路径——**两个不同数据集用两个键**，不是同一个键的两种模式。
- 在 CTRL-R 里再按一次 CTRL-R 是「切换按时间排序 / 按相关度排序」，不是「切到全量列表」。
- 来源：https://junegunn.github.io/fzf/shell-integration/

## 三、我们的现状（已在隔离实例上实测）

实测 profile：`prompt-history-e2e-v3`，DSH 0.2.0-rc.2，端口 18793。

| 能力 | 实测结果 |
|---|---|
| ↑ 调出历史 | 工作。第 1/2/3 个会话分别召回 38 / 867 / 30 字 |
| Ctrl+R 反向搜索 | 工作，浮层 `.dsh-ph-search` 计数为 1 |
| 会话目录 | 工作，7 至 9 个条目 |
| 目录点击跳转 | 工作，`scrollTop` 从 4294 变 332 |
| 控制台 | 干净，无报错 |
| `data-chat-anchor-key` | **不稳定**：同一实例不同会话分别是 1024 个与 0 个 |

宿主原语已确认够用，不需要新增任何依赖（来自 `@deepseek-ai/dsh-client-ui-primitives` 的类型声明）：
- `Menu`：portal 定位（每帧重测锚点）、↑↓/Home/End、Enter/Tab 选中、Escape 关闭、外部点击关闭、IME 守卫、模态让位、`selection='fill'` 做高亮。
- `Tooltip`：长提示文本的完整展示。
- 没有 listbox 原语，也没有虚拟列表——两者都能不引依赖地绕开。

## 四、浏览器里复刻的三处硬冲突

1. **中文输入法吃掉按键**。组字中的 Esc 语义是「取消候选 / 撤销组字」，此时 `event.isComposing === true` 或 `keyCode === 229`。必须无条件让给输入法，否则会出现「打中文按 Esc 弹出历史面板」的严重事故。
2. **Esc 已有三个消费者**，全在 document 捕获阶段：
   - 复制工具栏关闭（InputHistory.tsx 复制监听）；
   - 会话目录关闭（ChatToc.tsx 打开时）；
   - 反向搜索中按 Esc 是「放弃搜索并还原草稿」，不是关闭面板。
   加上宿主自己的弹层关闭，双击 Esc 必须做优先级仲裁，否则会出现「Esc 被面板吃掉、工具栏不关」。
3. **语义方向相反**。终端里 Esc 是「打断」；浏览器里 Esc 是「关闭当前层」。把「显示历史」挂在双击 Esc 上，等于要求用户在一个「关闭」键上做「打开」，与浏览器肌肉记忆相悖。

## 五、可选方案（按推荐度排序）

### 方案 A（推荐）：Ctrl+R 直接升级为全量列表选择器

- 第一次 Ctrl+R 打开列表，焦点留在输入框，浮层不吃键。
- 继续打字作为过滤器（沿用现在的「包含」匹配），输入实时过滤列表。
- ↑↓ 移动高亮，Enter 回填，Esc 关闭并还原草稿，Ctrl+R 循环上一条命中（保留现有语义）。
- 悬浮提示显示「N / M 条，↑↓ 选择 · Enter 回填 · Esc 取消」。

理由：完全对齐 Claude Code fullscreen 的规格与 fzf 的 Ctrl+R 惯例，不新增手势，不与任何现有 Esc 消费者打架；用户不用改肌肉记忆。

### 方案 B：双击 Esc 打开同一个列表

在方案 A 之上再加一个手势，判定照抄 pi 的成熟做法：

- 判定：**两次 Esc 间隔 ≤ 500 ms**，且**输入框为空**、**没有对话框打开**、**不在搜索中**、**非输入法组字中**。
- 第一次 Esc 透传给宿主（关闭工具栏等），第二次 Esc 被消费。
- 必须能关掉：接一个新的设置项 `historyGesture`（`off` / `esc` / `ctrlR`），避免重蹈 Claude Code「硬编码、无法关闭」的覆辙——它的 issue #43717 就是这个后果。

### 方案 C：单键 `Ctrl+H` 或 `Alt+↑`

避开 Ctrl+R（可能被浏览器或宿主抢）与 Esc（输入法冲突），语义上「历史」也不如 `Ctrl+H` 直白。不推荐，因为它在终端里没有对应物，用户需要重新记。

## 六、阶段划分（每步都可独立验证）

| 阶段 | 内容 | 验证方式 |
|---|---|---|
| 0 | 用宿主 `Menu` 原语做一个只有 3 条假数据的列表，跑通开合与键盘 | 隔离实例截图 + 键盘操作回放 |
| 1 | 接入真实历史（复用现有 `historyRef`），列表按最新优先、重复折叠 | 打开会话后条目数与 ↑ 连按次数一致 |
| 2 | 把 Ctrl+R 从「单行内联搜索」改为「列表 + 内联过滤」 | 输入关键词后高亮与条目数正确；Esc 还原草稿 |
| 3 | 长文本单行省略 + 悬浮显示全文 | 抄 ChatToc 的「仅截断才提示」判断 |
| 4 | 可选：双击 Esc 手势 + `historyGesture` 设置项 | 连按 500 ms 内开、超过不开、输入法组字时不开 |
| 5 | 修 Escape 仲裁与浮层残留（当前 `hideSearchOverlay()` 在任何卸载路径上都没被调用） | 关闭会话后 body 上不留浮层节点 |

## 七、明确不做

- 不引第三方依赖。
- 不做跨项目历史（宿主没有这个数据源）。
- 不做虚拟滚动：历史条目实测最多几百条，先按上限裁剪。
- 不把「当前提问」做成虚拟末项（那是 rewind 的语义，不是输入历史的语义）。
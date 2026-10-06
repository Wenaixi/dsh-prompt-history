<div align="center">

# ⌨️ @wenaixi/dsh-prompt-history

**DSH Web 输入框的「Claude Code 式」提示词历史 + 终端式复制粘贴插件。**

*像在终端里一样按 ↑ —— 历史、引用、粘贴，一个插件搞定。*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](#)
[![npm version](https://img.shields.io/npm/v/@wenaixi/dsh-prompt-history)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)
[![npm downloads](https://img.shields.io/npm/dm/@wenaixi/dsh-prompt-history)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)

[English](README.md) · **简体中文**

</div>

---

## 兼容性

| 表面 | 状态 |
|---|---|
| DSH 版本 | 目标为 **0.2.0-rc.2**；客户端配置卡片使用 `plugins.bundle.config` 与 Host `Config` schema，UI 自绘外壳（改动即写，无保存按钮） |
| 平台 | Web GUI（客户端插件；设置由 DSH Host 配置持久化；跨会话历史存浏览器本地） |
| Node | `>=20` |
| 模型 | 任意（不发起模型请求 —— 纯 UI 行为） |
| 界面语言 | 中文 / English（跟随 DSH 应用语言） |

## 你能得到什么

`@wenaixi/dsh-prompt-history` 把终端的输入历史搬进 DeepSeek Harness Web 输入框：

1. **Claude Code 式方向键召回** — 光标在输入框**第一行**时按 **↑** 从最新一条提问开始**逐条往回**（每条光标停在行首）；一直翻到最旧再按 ↑ 不会环绕回最新。**↓** 往更新方向走（回填时光标停在行尾），翻到底**恢复你翻历史之前正在输入的那一行**（空输入则恢复空行）。多行草稿中，光标在第一行/最后一行之外的普通上下移行不受影响。
2. **编辑即退出** — 浏览历史时一旦动手编辑，自动回到当前行，不再继续翻。
3. **双击 Esc 打开历史列表** — 输入框为空时 800 毫秒内连按两次 Esc 调出全部历史提问的浮层列表（最新在前，重复提问只保留最新一次）。焦点留在输入框：继续打字即按「包含」+ 可选「子序列模糊」实时过滤并高亮命中词，**↑↓** 移动高亮（两端夹取不环绕）且不改动草稿，Home/End 跳首尾，**Enter 或 Tab** 把高亮那条写进草稿，**Esc** 关闭并把草稿还原成打开前那一行。每行开头显示相对时间（可关）；宽窗口（≥1000px）时右侧显示选中条目的完整内容预览。底部实时显示「命中数 / 总条数」。
4. **双击 Esc**（设置里可关，默认开）— 语义与 Claude Code 一致：草稿**非空**时第一次 Esc 提示「再按一次 Esc 清空输入」并照常透传，800 毫秒内第二次把草稿**存入历史后清空输入框**（清掉的内容随后可用 ↑ 召回）；草稿**为空**时连按两次 Esc 打开历史列表。关闭后 Esc 完全交还宿主。
5. **复制 + 引用（两种模式，设置里切换）** — 页面里任何非空选区——输入框、聊天消息、代码块等——按所选模式处理：
   - **工具栏**（默认）：选区上方出现「复制」「引用」按钮——复制点击才写剪贴板（不刷屏 Win+V）；**引用**把选中文本的**完整内容**以简约的 `>` 引用块插入输入框（标准 markdown 引用，发送时渲染为引用块）。
   - **选中即自动复制**：终端风格，选中直接写系统剪贴板。
6. **鼠标右键直接粘贴** — 在输入框上右键即粘贴剪贴板内容（和 Linux 终端一致，不弹菜单）；粘贴走与 Ctrl+V 完全一致的管线（图片与引用 chip 行为一致），execCommand 路径被限制时自动回退到 Clipboard API 手动插入。
7. **跨会话历史记忆**（设置里可开关，默认关）— 开启后 ↑/↓ 历史在会话间保持，存于浏览器本地（上限 200 条），刷新/切换会话不丢失。

纯 UI 行为：不产生会话事件、不改变 agent 循环、不发起模型请求。召回/引用的文本只会进入输入框草稿，只有**你**按 Enter 才会到达模型。

## 快速开始

```sh
# 1. 把插件装进你的 profile
dsh plugin --profile web add @wenaixi/dsh-prompt-history

# 2. 刷新页面即可使用（无需重启服务）
```

## 安装与卸载

- **npm 渠道**（已发布版本）：`dsh plugin --profile web add @wenaixi/dsh-prompt-history`
- **源码渠道**（本地开发，最新 `main`）：`dsh plugin --profile web add "github:Wenaixi/dsh-prompt-history#main"`（源码检出需先 `pnpm run build` —— 未构建的 bundle 会拒绝启动）
- **卸载**：`dsh plugin --profile web remove @wenaixi/dsh-prompt-history`

## 配置

打开 **插件 → `@wenaixi/dsh-prompt-history` → 配置**（由 DSH 宿主配置持久化到 `cordis.patch.yml`；旧版浏览器设置会在首次打开时自动迁移）。改动即时保存，不需要保存按钮——每次开关、切换单选或点「恢复默认」都立即写入宿主：

| 选项 | 默认 | 说明 |
|---|---|---|
| 选中文本后 | `弹出工具栏` | `什么都不做` / `弹出工具栏`（点击才写剪贴板）/ `选中即复制`（终端风格） |
| 上下键历史 | 开 | 关闭后全部历史行为交还宿主 |
| 双击 Esc | 开 | 关闭后 Esc 完全交还宿主（不清空也不开列表） |
| 历史条数上限 | `100` | ↑/↓ 与历史列表最多记住多少条（50 / 100 / 200 / 500 / 1000） |
| 显示相对时间 | 开 | 历史列表每行开头显示「5 分钟前 / 3 小时前」这类相对时间 |
| 模糊匹配 | 开 | 历史列表过滤时还允许字符子序列模糊匹配（例如搜「dpl」也能找到「deploy now」） |
| 跨会话记忆 | 关 | ↑/↓ 历史在会话间保持，存浏览器本地（受「条数上限」约束） |
| 右键直接粘贴 | 开 | 关闭后右键恢复浏览器原生菜单 |

## 特性

- **历史来自会话自身的消息记录**：直接读取会话快照中的用户消息节点（`user` / `steering`），随消息落地实时追加——与聊天记录严格一致，随会话持久化，刷新页面后依然可用，不需要任何配置或额外存储。开启「跨会话记忆」后改从浏览器 localStorage 播种并在每次追加时全环去重。
- **连续重复自动合并**，浏览状态跟随会话切换自动重置。
- **界面国际化**：全部文案（设置、工具栏、提示 pill、历史列表）跟随 DSH 应用语言（中文 / English）。
- client bundle 压缩后约 14 KB；依赖全部走官方 `@deepseek-ai/*` peer 依赖。

## 已知限制

- **Ctrl+R 不再绑定**：浏览器保留原生刷新；历史列表通过双击 Esc 打开（单条回顾仍可用 ↑/↓）。
- 纯文本召回：带图片/命令 chip 的消息不参与；召回内容为纯文本。
- 多行判定按逻辑行（Lexical 以 `<br>` 换行）：超长单行**视觉折行**后按 ↑ 会直接进入历史而非上移一行。

## 开发

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsc（lib/types）+ tsdown（lib/index.js / lib/invariant.js / lib/client.js）
```

浏览器半区（`src/client/`）注册在 `conversation.input.right` 槽位与插件详情页配置卡（`plugins.bundle.config`），构建产物为 DSH `__ModuleLoader__` 闭包格式，外部依赖仅 `react` 与官方 `@deepseek-ai/*` peer 包（其余由浏览器模块表提供）。配置卡自绘外壳，`SettingsCardController` 做「操作即写」：每次改动直接写宿主，失败回落宿主真值。文案字典在 `src/client/locales.ts`（`zh` 为准、`en` 键位对齐），通过 `ctx.locale.register` 注册。

## 原理

插件是一个不可见的 composer 槽位条目：挂一个 document 捕获期 keydown 监听，仅在目标为 composer 输入框、无修饰键、非输入法组合、菜单未打开、会话非忙碌时接管 ↑/↓，通过 `inputActions.setDraft` 写入历史文本。浏览位置用「已浏览条数」（`browseRef.step`）表示，配合「开始浏览前那一行」的草稿副本；↑ 只在光标位于第一行时接管，↓ 只在最后一行时接管（对齐 Claude Code `upOrHistoryUp` / `downOrHistoryDown` 的「先移光标」）。历史列表由会话快照的 `user`/`steering` 节点按 seq 去重追加，条目带源事件时间戳用于相对时间显示；过滤支持包含 + 子序列模糊（Claude Code `isSubsequence`）。多行行号按 Lexical 的 `<br>` 结构计算。

## License

[MIT](LICENSE)
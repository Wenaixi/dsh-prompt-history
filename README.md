<div align="center">

# ⌨️ @wenaixi/dsh-prompt-history

**DSH Web 输入框的「类 Linux shell」提示词历史 + 终端式复制粘贴插件。**

*像在终端里一样按 ↑ —— 历史、引用、粘贴，一个插件搞定。*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](#)
[![npm version](https://img.shields.io/npm/v/@wenaixi/dsh-prompt-history)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)
[![npm downloads](https://img.shields.io/npm/dm/@wenaixi/dsh-prompt-history)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)

[English](README.en.md) · **简体中文** · [Español](README.es.md) · [Português](README.pt.md)

</div>

---

## 兼容性

| 表面 | 状态 |
|---|---|
| DSH 版本 | 目标为 **0.2.0-rc.2**；客户端配置卡片使用 `plugins.bundle.config` 与 Host `Config` schema，UI 走官方 `SettingsForm` 体系 |
| 平台 | Web GUI（客户端插件；设置由 DSH Host 配置持久化；跨会话历史存浏览器本地） |
| Node | `>=20` |
| 模型 | 任意（不发起模型请求 —— 纯 UI 行为） |
| 界面语言 | 中文 / English（跟随 DSH 应用语言，设置页可切换） |

## 你能得到什么

`@wenaixi/dsh-prompt-history` 把终端的输入历史搬进 DeepSeek Harness Web 输入框：

1. **类 shell 的方向键召回** — 空输入时 **↑** 召回上一条发送过的消息（最新在前）；**输入前缀后按 ↑** 跳到最近一条以该前缀开头的消息（bash 的 `history-search-backward` 行为），继续按 ↑ 往前翻匹配；**↓** 向后翻（含前缀匹配的前向），翻到底时**恢复你翻历史之前正在输入的那一行**（readline 的 pending-line 行为）。
2. **编辑即退出** — 浏览历史时一旦动手编辑，自动回到当前行，不再继续翻。
3. **Ctrl+R 历史列表** — 一键调出全部历史提问的浮层列表（最新在前，重复提问只保留最新一次）。焦点留在输入框：继续打字即按「包含」实时过滤并高亮命中词，**↑↓** 移动高亮且不改动草稿，Home/End 跳首尾，**Enter 或 Tab** 把高亮那条写进草稿，**Esc** 关闭并把草稿还原成打开前那一行。底部实时显示「命中数 / 总条数」。
4. **双击 Esc 打开同一个列表**（设置里可关）— 输入框为空时 800 毫秒内连按两次 Esc 即可打开；第一次 Esc 仍然照常关闭工具栏等浮层（不吞按键），任何其他按键会取消这次待定。设置项三选：**只用 Ctrl+R** / **只用双击 Esc** / **两者都要**（默认）。
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
| 打开历史列表 | `两者都要` | `只用 Ctrl+R` / `只用双击 Esc` / `两者都要` |
| 上下键历史 | 开 | 关闭后 ↑/↓、Ctrl+R 与双击 Esc 全部交还宿主 |
| 跨会话记忆 | 关 | ↑/↓ 历史在会话间保持，存浏览器本地，上限 200 条 |
| 右键直接粘贴 | 开 | 关闭后右键恢复浏览器原生菜单 |

## 特性

- **历史来自会话自身的消息记录**：直接读取会话快照中的用户消息节点（`user` / `steering`），随消息落地实时追加——与聊天记录严格一致，随会话持久化，刷新页面后依然可用，不需要任何配置或额外存储。
- **连续重复自动合并**，浏览状态跟随会话切换自动重置。
- **界面国际化**：全部文案（设置、工具栏、提示 pill、历史列表）跟随 DSH 应用语言（中文 / English）。
- client bundle 压缩后约 12 KB；依赖全部走官方 `@deepseek-ai/*` peer 依赖。

## 已知限制

- **Ctrl+R**：输入框聚焦时 Ctrl+R 打开历史列表，**不再触发浏览器刷新**（想刷新先点一下输入框外面）。
- 纯文本召回：带图片/命令 chip 的消息不参与；召回内容为纯文本。

## 开发

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsc（lib/types）+ tsdown（lib/index.js / lib/invariant.js / lib/client.js）
```

浏览器半区（`src/client/`）注册在 `conversation.input.right` 槽位与插件详情页配置卡（`plugins.bundle.config`），构建产物为 DSH `__ModuleLoader__` 闭包格式，外部依赖仅 `react` 与官方 `@deepseek-ai/*` peer 包（其余由浏览器模块表提供）。配置卡自绘外壳，`SettingsCardController` 做「操作即写」：每次改动直接写宿主，失败回落宿主真值。文案字典在 `src/client/locales.ts`（`zh` 为准、`en` 键位对齐），通过 `ctx.locale.register` 注册。

## 原理

插件是一个不可见的 composer 槽位条目：挂一个 document 捕获期 keydown 监听，仅在目标为 composer 输入框、无修饰键、非输入法组合、菜单未打开、会话非忙碌时接管 ↑/↓，通过 `inputActions.setDraft` 写入历史文本。历史列表由会话快照的 `user`/`steering` 节点按 seq 去重追加，浏览位置（index + 待恢复的当前行）保存在组件 ref 中。

## License

[MIT](LICENSE)

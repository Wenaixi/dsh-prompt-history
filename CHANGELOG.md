# Changelog

本仓库的版本历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

### 新增

- `prefs-model.ts` 新增 `prefsEqual` / `draftDiffOps` 纯函数并补单测（23 项全绿）。

## [2.0.1] - 2026-10-05

### 修复

- scoped 包名在 YAML 里加引号：裸 `@` 开头导致 `dsh add` 解析失败。

## [2.0.0] - 2026-10-05

### 变更

- 包名改为 scoped：`@wenaixi/dsh-prompt-history`。
- 配置界面迁移到 DSH 官方插件配置组合（`plugins.bundle.config` + Host `Config` schema + volatile 字段），设置由 DSH 宿主持久化；旧版浏览器 localStorage 设置在首次打开时自动迁移。

### 其他

- 配置 CI（`pnpm install --frozen-lockfile` + typecheck + 单测 + build）与发布流水线（tag 触发 npm publish + GitHub Release）。

## [1.2.15] - 2026-10-04

### 修复

- 依赖对齐当前 DSH 客户端 API 与兼容矩阵。

## [1.2.14] - 2026-10-03

### 修复

- 跨 DSH 代际规范化会话节点读取。

## [1.2.13] - 2026-10-02

### 修复

- rc.1 会话快照的 chat nodes 是 store 不是数组。

## [1.2.12] - 2026-10-01

### 修复

- 兼容 DSH 0.1.2（Lexical 编辑器 + chat-view nodes）。

## [1.2.11] - 2026-09-30

### 修复

- 全量历史拉宽真正执行；收紧行距；提示气泡点击即关。

## [1.2.10] - 2026-09-29

### 新增

- 会话目录（Chat TOC）显示全量历史。

## [1.2.9] - 2026-09-28

### 修复

- TOC 点击总是跳到正确的消息；收紧行距。

## [1.2.8] - 2026-09-27

### 新增

- TOC 行编号统一；悬停显示全文气泡。

## [1.2.7] - 2026-09-26

### 修复

- TOC 条目显示全文；移除坏掉的 line-clamp。

## [1.2.6] - 2026-09-25

### 新增

- TOC 面板右下角拖拽调整大小。

## [1.2.5] - 2026-09-24

### 修复

- TOC 条目不被压缩；头部固定、列表滚动。

## [1.2.4] - 2026-09-23

### 修复

- TOC 条目多行可读；面板加宽。

## [1.2.3] - 2026-09-22

### 修复

- 长列表下 TOC 可靠滚动。

## [1.2.2] - 2026-09-21

### 新增

- TOC 面板像上下文菜单一样吸附在 grip 上。

## [1.2.1] - 2026-09-20

### 修复

- TOC 面板跟随 grip 且始终在视口内。

## [1.2.0] - 2026-09-19

### 变更

- 移除「off」复制模式与代码工具栏按钮。

## [1.1.0] - 2026-09-18

### 新增

- 可开关的会话目录（Chat TOC）；终端字形替换齿轮导航图标。

## [1.0.0] - 2026-09-17

### 新增

- 界面国际化（zh/en），终端式输入的设置标签。

## [0.17.0] - 2026-09-16

### 新增

- 复制为代码的工具栏动作；可选跨会话历史环（默认关）。

## [0.16.0] - 2026-09-15

### 新增

- TOC grip 可拖拽；位置存 localStorage。

## [0.15.0] - 2026-09-13

### 新增

- 会话目录（Chat TOC）grip 雏形：列出用户消息、点击跳转。

## [0.14.0] - 2026-09-12

### 新增

- bash 风格前缀历史搜索（带前缀按 ↑）；Ctrl+R 增量反向搜索。

## [0.13.0] - 2026-09-11

### 变更

- 引用改为干净的 markdown 引用块（`>` 前缀）。

## [0.12.0] - 2026-09-10

### 新增

- 引用在输入框渲染为卡片式盒子，下一行继续输入。

## [0.11.0] - 2026-09-09

### 变更

- 引用把选中文本的完整内容以 `>` 引用块插入输入框。

## [0.10.0] - 2026-09-08

### 新增

- 输入框上方全文引用预览条；chip 气泡显示完整引用。

## [0.9.0] - 2026-09-07

### 新增

- 引用插入引用 chip（视觉可区分），发送时展开为 `>` 引用块，chip 后换行。

## [0.8.0] - 2026-09-06

### 新增

- 选区工具栏增加「引用」动作：把选中文本以 `>` 引用块插入输入框。

## [0.7.0] - 2026-09-05

### 变更

- 选区复制工具栏（显式点击复制）成为默认；选中即自动复制改为可选。

## [0.6.1] - 2026-09-04

### 变更

- 设置区块改名「终端式输入」便于查找。

## [0.6.0] - 2026-09-03

### 新增

- 设置区块：选中即复制与右键粘贴开关。

## [0.5.1] - 2026-09-02

### 新增

- 全页选中即复制，带可见的已复制气泡。

## [0.5.0] - 2026-09-01

### 新增

- 选中即复制（任意选中方式）。

[Unreleased]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.15...v2.0.0
[1.2.15]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.14...v1.2.15
[1.2.14]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.13...v1.2.14
[1.2.13]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.12...v1.2.13
[1.2.12]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.11...v1.2.12
[1.2.11]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.10...v1.2.11
[1.2.10]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.9...v1.2.10
[1.2.9]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.8...v1.2.9
[1.2.8]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.7...v1.2.8
[1.2.7]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.6...v1.2.7
[1.2.6]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.5...v1.2.6
[1.2.5]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.17.0...v1.0.0
[0.17.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v0.4.1...v0.5.0

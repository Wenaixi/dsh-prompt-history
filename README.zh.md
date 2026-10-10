# dsh-prompt-history

[English](./README.md) | [中文](./README.zh.md)

[![npm](https://img.shields.io/npm/v/@wenaixi%2Fdsh-prompt-history?label=npm&color=CB3837)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Plugin-7c3aed)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/node-%3E%3D20-5FA04E)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-F69220)](https://pnpm.io)

<p align="center">
  <img src="./assets/icon.png" alt="@wenaixi/dsh-prompt-history" width="128" height="128"><br/>
  <em>DSH Web 输入框的终端级交互：Claude Code 式提示词历史、选中文本复制引用与右键粘贴。</em>
</p>

DeepSeek Harness (DSH) Web GUI 输入框交互增强插件。完整复刻 Claude Code 的方向键历史遍历与双击 Esc 交互逻辑，提供选中文本工具栏引用/自动复制、鼠标右键直接粘贴与认领态行内斜杠智能补全。纯前端交互增强，零第三方依赖，不发起任何模型请求。

## 安装

需要 DSH 运行时（`npm i -g @deepseek-ai/dsh`），Node 与 pnpm 的版本要求见上方徽章。下面以 `web` profile 为例，换成你自己的 profile 名字即可。

```bash
# A — npm 官方源安装（推荐，自动获取最新版）
dsh plugin --profile web add @wenaixi/dsh-prompt-history

# B — GitHub 直装（绕过镜像延迟）
dsh plugin --profile web add github:Wenaixi/dsh-prompt-history

# 验证配置加载
dsh --profile web --dump-config | grep -A2 "dsh-prompt-history"

# 进入会话，刷新页面即可直接使用
dsh --profile web
```

要锁版本就在包名后加 `@<version>` 或 `#v<version>`（具体版本以 `npm view @wenaixi/dsh-prompt-history version` 当前发布为准）。

本地开发或离线包安装：

```bash
git clone https://github.com/Wenaixi/dsh-prompt-history && cd dsh-prompt-history
pnpm install && pnpm build && node --experimental-strip-types --test test/*.test.ts
dsh plugin --profile web add ./                           # 本地目录安装
pnpm pack && dsh plugin --profile web add ./wenaixi-dsh-prompt-history-*.tgz

# 更新 / 卸载
dsh plugin --profile web add @wenaixi/dsh-prompt-history
dsh plugin --profile web remove @wenaixi/dsh-prompt-history
```

## 是什么

一套专为 DSH 网页输入框打造的键盘优先交互增强套件。

在大模型日常编码与会话交互中，频繁手工重输前序提示词、在多行命令中上下查找、反复用鼠标选中复制粘贴，严重打断思考心流。`@wenaixi/dsh-prompt-history` 把成熟终端环境与 Claude Code 的高频操作习惯无缝移植到 DSH 浏览器半区。

纯前端行为边界：
- 零会话事件污染：不向会话产生多余系统事件，不改动 agent 执行循环；
- 零模型请求：纯 UI 交互逻辑，不消耗任何模型 Token；
- 零外部网络端点：不自建任何 HTTP 服务，所有配置严格走宿主 ConfigForm 契约；
- 安全边界：召回或引用的内容仅作为纯文本填入输入框草稿，只有用户主动敲击 Enter 才会发送给模型。

## 核心交互特性

### 1. Claude Code 式方向键历史召回
- **首行往回翻（↑）**：光标处于输入框第一行时，按 ↑ 从最新一条提问开始逐条往前召回，回填时光标停在行首；翻到最旧一条记录时停止，不发生环绕跳变。
- **末行往前翻（↓）**：处于历史浏览状态且光标位于最后一行时，按 ↓ 往更新方向翻动，回填时光标停在行尾；翻到底部时精准恢复开始浏览前正在输入的草稿（原本为空则恢复为空）。
- **编辑即退出**：浏览历史途中一旦动手键入新字符，立即退出浏览模式，保留当前编辑行。
- **智能多行判定**：底层基于 Lexical 的 `<br>` 逻辑行判定，多行草稿仅在物理第一行或最后一行接管按键，中间行的正常光标移动丝毫不受干扰。

### 2. 双击 Esc 历史列表选择器
- **快速调出浮层**：输入框为空时，800 毫秒内连按两次 Esc 打开完整历史浮层（最新在前，重复提问只保留最新一次）。
- **实时过滤与高亮**：输入框保持获得焦点，继续打字即可按子串包含与字符子序列模糊匹配（`fuzzyMatch`，例如搜 `dpl` 可匹配 `deploy now`），并在列表中高亮命中字符。
- **键盘直控**：↑ 与 ↓ 移动高亮（两端夹取不环绕，不改动当前输入框），Home 与 End 直达首尾，Enter 或 Tab 回填选中条目，Esc 关闭浮层并还原打开前的输入状态。
- **相对时间与宽屏预览**：行首显示相对时间标签（`5m / 3h / 2d`）；窗口宽度不小于 1000px 时，右侧区域实时展开当前高亮项的完整内容预览。底部实时显示「匹配条数 / 总条数」。

### 3. 双击 Esc 智能清空草稿
- 草稿非空时，第一次按 Esc 弹出提示微标「再按一次 Esc 清空输入」并正常透传按键；
- 800 毫秒内第二次按 Esc，将当前草稿存入历史后清空输入框（清空内容后续随时可用 ↑ 重新召回）；
- 双击 Esc 支持在设置中独立开关，关闭后 Esc 完全交还宿主。

### 4. 选中文本复制与引用
页面内任意非空选区（输入框、会话消息正文、代码块等）均受所选模式管理：
- **工具栏模式（Toolbar，默认）**：选区上方浮现「复制」「引用」按钮。点击复制才写入系统剪贴板（避免 Windows 剪贴板历史被频繁污染）；点击引用把选中文本完整包裹为 Markdown `>` 块引用格式填入输入框。
- **自动复制模式（Auto）**：终端风格，选中文本即刻静默写入系统剪贴板。
- **关闭模式（Off）**：交还浏览器默认选区行为。

### 5. 鼠标右键直接粘贴
在输入框内单击鼠标右键直接粘贴系统剪贴板内容，不弹出右键菜单，复刻 Linux 终端体验；走与 Ctrl+V 完全一致的输入管线（图片附件与引用 chip 行为完全统一），execCommand 路径受限时自动平滑回退至 Clipboard API。

### 6. 认领态行内斜杠补全
宿主在认领带参前导命令（如 `/plan `）后会进入 `claimed` 保护阶段，其底层 `detectTrigger` 会无差别跳过后续所有斜杠，导致在裸宿主上键入 `/plan /dsh-plugin-dev` 时完全无法唤出技能补全。本插件注入 `inputTriggers` 服务：在光标位于行内斜杠时将守卫动态放宽至 `plain`，使命令参数中的技能补全按预期弹出，同时严格抑制 URL 与 `//` 伪触发。

### 7. 跨会话历史持久化
默认历史直接源自当前会话快照中的用户消息节点（`user` / `steering`），与会话生命周期天然绑定，刷新页面依然存在。开启设置项「跨会话记忆」后，历史记录自动迁移至浏览器 localStorage 环形存储中，受条数上限约束，跨窗口与跨会话无缝共享。

## 快捷键速查

| 按键 / 手势 | 适用场景 | 行为说明 |
|---|---|---|
| `↑` | 输入框第一行 | 逐条向后翻历史，光标签行首，最旧不环绕 |
| `↓` | 输入框最后一行（浏览中） | 逐条向前翻历史，光标签行尾，翻到底还原草稿 |
| `Esc × 2` | 草稿为空（800ms 内） | 打开历史列表选择器浮层 |
| `Esc × 2` | 草稿非空（800ms 内） | 首次提示清空，二次将草稿存入历史并清空输入框 |
| `↑` / `↓` | 历史列表浮层内 | 移动高亮选中项（两端夹取不环绕） |
| `Home` / `End` | 历史列表浮层内 | 直达历史列表最顶端 / 最底端 |
| `Enter` / `Tab` | 历史列表浮层内 | 将当前高亮历史条目回填至输入框并关闭浮层 |
| `Esc` | 历史列表浮层内 | 关闭浮层并还原打开前的输入框内容 |
| 鼠标右键 | 输入框内 | 直接粘贴剪贴板内容（免弹菜单） |
| 文本选中 | 页面任意正文 | 弹出复制/引用工具栏（Toolbar 模式）或直接复制（Auto 模式） |

## 配置面板

在 DSH Web 界面点击 **插件管理 -> @wenaixi/dsh-prompt-history -> 卡片详情** 即可查看内嵌配置面板。

面板采用自绘外壳设计，遵循「操作即写、即刻生效」原则，无需保存按钮，任何开关切换或单选调整均直接通过宿主接口原子持久化到对应 profile 的 `cordis.patch.yml` 中：

| 配置项 | 键名 | 默认值 | 作用说明 |
|---|---|---|---|
| 选中文本后 | `copyMode` | `toolbar` | `toolbar`（浮出工具栏）/ `auto`（选中即复制）/ `off`（不干预） |
| 上下键历史 | `historyEnabled` | `true` | 关闭后 ↑ 与 ↓ 完全交还宿主原生行为 |
| 双击 Esc | `doubleEsc` | `true` | 关闭后 Esc 完全交还宿主（不清空也不开历史列表） |
| 历史条数上限 | `maxHistoryItems` | `100` | 历史环与列表容纳条数上限（可选 50 / 100 / 200 / 500 / 1000） |
| 显示相对时间 | `relativeTime` | `true` | 历史列表中每行显示相对时间戳（如 5m、3h、2d） |
| 模糊匹配 | `fuzzyMatch` | `true` | 历史列表过滤时允许字符子序列模糊匹配 |
| 跨会话记忆 | `globalHistory` | `false` | 开启后历史持久化到浏览器 localStorage，跨会话保留 |
| 右键直接粘贴 | `rightClickPaste` | `true` | 输入框内右键直接粘贴剪贴板内容，关闭则显示原生菜单 |
| 忽略前导空格 | `ignoreLeadingSpace` | `false` | 以空格开头的提示词不记录入历史（对齐 Bash ignorespace，敏感指令阅后即焚） |

配置数据流通路：
```
配置卡 UI -> SettingsCardController -> ConfigForm.mutate
          -> 宿主 SettingsController -> dsh-settings
          -> config-editor -> profile/cordis.patch.yml
```

## 目录结构

```
src/
  index.ts                 # 插件 Host 半侧入口，声明 volatile 配置 schema
  client/
    index.ts               # 客户端注入入口，注册 conversation.input.right 与配置槽位
    claim-guard.ts         # 纯函数 hasInlineSlash：认领态行内斜杠判定
    history-model.ts       # 纯模型：历史环管理、过滤、高亮夹取与时间格式化
    prefs-model.ts         # 纯模型：配置快照归一化、旧配置迁移规划与差异计算
    prefs.ts               # 宿主配置快照投影服务，驱动前端响应式更新
    card-controller.ts     # SettingsCardController：操作即写控制器
    SettingsCard.tsx       # 配置卡组件：自绘外壳、官方 Switch 与单选面板
    InputHistory.tsx       # 交互主体：方向键召回、双击 Esc 列表、复制引用与右键粘贴
    editor.ts              # 输入框 DOM 访问、光标计算与 Lexical 行数解析
    nodes.ts               # 会话快照消息节点解析提取
    feedback.ts            # 复制成功与清空提示 Toast 浮层
    locales.ts             # 中英文双语本地化字典
locale/                    # 插件元数据多语言文件（zh.json / en.json）
test/                      # 纯函数单元测试集
cordis.patch.yml           # 默认配置补丁声明
package.json               # 模块清单与平台规范声明
```

## 开发与门禁

项目秉持高强度工程纪律，提供完备的类型、单元测试与构建门禁：

```bash
# 1. 类型检查
node node_modules/typescript/bin/tsc --noEmit

# 2. 纯函数单元测试
node --experimental-strip-types --test test/*.test.ts

# 3. 双步构建：tsc 类型输出 + tsdown 模块打包
pnpm build

# 4. 发布打包产物完整性自检
npm pack --dry-run
```

客户端产物输出为 DSH 规范的 `__ModuleLoader__` CJS factory 闭包，依赖全部走宿主 peer 注入，生产构建产物压缩后仅约 25 KB。

## 常见问题

**升级插件后修改配置提示拒绝（settings/rejected）？**
通常是由于升级前旧 profile 的 `cordis.patch.yml` 中残留了已退役的历史字段（例如已废弃的 `tocVisible` 或 `historyGesture`）。宿主配置校验器在检测到未知键时会拒绝写入。手动编辑该 profile 下的 `cordis.patch.yml`，删除陈旧字段行即可恢复。

**为什么配置卡片没有提供保存按钮？**
本插件践行现代桌面端与终端工具的设计准则：设置改动即生效。每次拨动开关或切换单选块，都会立即触发 `ConfigForm.mutate` 写回宿主配置层，连点操作由宿主写入队列与版本号栅栏机制安全保障。

**当命令建议菜单弹出时，快捷键会被截获吗？**
不会。插件设置了建议菜单避让机制（检测 `[role="listbox"]` 与 `[data-trigger-menu]`），在候选列表展开时自动交还方向键控制权；在插件自身历史列表展开时则保持稳定接管，互不抢占。

## 更新日志

详细版本沿革与逐版修复记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 贡献

欢迎提交 Issue 与 Pull Request。代码修改请先参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 协议与致谢

- 遵循 [MIT 开源协议](./LICENSE)。
- 键位交互语义启发自 [Anthropic Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)。
- 底座运行架构基于 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)。
- 规范设计参考自 [dsh-plugin-dev](https://github.com/Wenaixi/dsh-plugin-dev) 架构规范指南。
# Changelog

本项目所有值得记录的变更都记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [2.8.3] - 2026-11-25

### Changed

- **cordis 4.2 兼容**：`@deepseek-ai/cordis` peer 区间由 `~4.1.0` 放宽为
  `>=4.1.0 <5.0.0`。`~` 前缀不跨 minor，DSH 0.2.3 系列携带 cordis 4.2 时该声明
  直接失效；新区间同时覆盖 4.1 与 4.2 两代。`engines.dsh` 保持无上界（本项目既有契约：对宿主开放）。

## [2.8.2] - 2026-11-21

### Fixed

- 发布链路：workflow 只写 `$HOME/.npmrc`，而 setup-node 把 npm 实际读取的
  路径放在 `NPM_CONFIG_USERCONFIG`，于是 token 从未生效、每次发布都 404。
  现在两个路径都写。

## [2.8.1] - 2026-11-21

### Fixed

- **历史记录会写出错误的斜杠命令**：`InputHistory.tsx` 三处读取
  `[data-composer-chip]` 的 `data-composer-chip` 属性当命令名。那是**引用 chip 的
  来源名**（宿主 `chip-node.tsx` 写的是 `insert.source`），命令 chip 用的是另一个
  属性 `data-composer-command`。用户在草稿里插过文件引用 chip 后按 Enter，
  历史会被记成 `/reference <正文>`；该条被上下键回填并回车时会真的发出一个
  不存在的 `/reference` 命令——属于把用户输入改写成另一条命令。
  根因是多余的二次拼接：`draft` 是 `clipboardText`，宿主已让 chip 展开为
  其剪贴板投影（`projection.ts` 注释「chips expand to their clipboard projection」），
  命令原型本来就在里面。三处拼接全部删除，直接用 `live.draft`。

### Removed

- `patched` WeakSet：只有声明没有引用（幂等实际由 `ORIG_TRACK` 符号承担）。
- 13 组从未被任何组件使用的样式类（`dsh-ph-health-*` 对应健康度面板、
  `dsh-ph-import-box`/`dsh-ph-textarea` 对应导入框、`dsh-ph-heal-btn` 对应
  自愈按钮、`dsh-ph-adv-pane/toggle/actions/container` 对应折叠面板）。
  健康度诊断与导入导出在 UI 上本就不可达，样式是残留。
  保留 `dsh-ph-advanced`/`advancedSummary`——它们在 `SettingsCard` 的
  `details` 元素上真实使用。

### Test

- 新增 `test/host-context.test.ts`：用真实 cordis `Context` 验证
  `ctx.inject(['settings'])` 的服务就位/缺失两种状态、effect disposer 真实执行、
  以及 Config 九个字段全部 volatile。其中「服务缺失」一条断言 `fiber.state === 0`
  与 `getEffects().length === 0`，是可失败的（此前写成 `assert.ok(true)` 属
  结构性不可失败）。

## [2.8.0] - 2026-11-14

### Added

- 设置面板顶部新增预设档位：极简 / 标准 / 全功能 / 自定义。点选后一次性写入所有相关字段。「自定义」段常驻，当前组合不匹配任何预设时高亮它。
- 少用的「忽略空格开头的输入」收进可折叠的高级设置区。

### Changed

- 设置分组按使用意图重排：找回之前说过的话 / 快速翻找 / 复制与粘贴。原分组按字段类型划分。

### Fixed

- 相对时间的中文显示为 `5m` 而非「5分钟前」。`relativeAgeText` 原先在 `InputHistory.tsx` 内拼硬编码的 `m/h/d` 后缀，`locales.ts` 里备好的四条词条从未被调用。现下沉为 `history-model.ts` 的纯函数并注入翻译函数，词条缺失时仍回退到紧凑后缀。
- 删除零消费的死导出：`feedback.ts` 的 `defaultOverlay` 模块级单例与 `showHistoryPanel` / `hideHistoryPanel` 包装、`prefs.ts` 的 `KNOWN_FIELDS`。

## [2.7.1] - 2026-11-04

### Fixed

- 修复多行输入非首行按 Up 误跳历史：用 `getBoundingClientRect()` 测量首行与末行的折叠 Range 位置，解决单行长文本 CSS 自动折行被误判为首行的问题。
- 修复多段落切换时 `anchorNode === host` 且 `anchorOffset > 0` 被误判为第一行的假阳性。
- 接入实时草稿字符串换行符与光标字符偏移的互锁校验。
- 输入法合成态保护：接入宿主 `[data-composer-composing]` 标记与原生 `isComposing` 双重压制，选词期间不抢占按键。

### Added

- 支持 Readline 与 Emacs 快捷键 `Ctrl+P` 上一条与 `Ctrl+N` 下一条，与方向键保持对称的边缘步进逻辑。
- 交互式反向历史搜索：空闲态按 `Ctrl+R` 唤起搜索面板，搜索态连续按 `Ctrl+R` 循环切换更早匹配项。
- 连续重复提交折叠：连续提交相同提示词自动折叠为一条，回溯时不出现连续重影。

## [2.7.0] - 2026-10-31

### Added

- 全形态用户输入无损解析：支持斜杠命令还原完整 `kind: 'command'` 的 `/cmd args` 命令原型，支持 `question-reply`、`user-question-reply` 问答回复与 `command-input` 命令输入。
- 双数据源降级提取：优先经 `chat.order + chat.nodes.get(key)` 提取，自动回退到 `chat.legacy.nodes`，保障长会话与视口裁切场景下的历史完整性。
- 权威序号 `seq` 优先强去重与乐观回声融合：消除网络回声重复项，本地即发入库与服务端真实节点按毫秒级校准融合。

### Fixed

- 修复宿主 Chat 节点数据包裹在 `node.data` 导致 `content` 读取失败被整条丢弃的问题。
- 修复会话切换异步时序脱节：重建会话切换与消息监听为正交响应式 Effect，异步消息到达即刻入库与继承，消除 1.5 秒空窗期。
- 修复 `time === 0` 的旧会话记录在周期性巡检中反复累加重复条目的问题。

## [2.6.2] - 2026-10-18

### Fixed

- 修复 `switchSession` 无脑继承旧版全局历史的边界缺陷：新创建的空白会话保持空白，仅当会话在宿主侧已有历史消息且本地无记录时，才触发旧版全局数据继承。
- 重构排序逻辑：仅同毫秒时间戳下的完全同一事件合并去重，允许用户在不同时间多次发送相同提示词并按时间戳各就其位；严格先比较时间戳再比较 `seq`，消灭时序倒挂。
- 清理孤儿死字段 `private seen: Set<number>`、双语字典未引用词条与临时路测脚本。

### Added

- 全渠道提交零延迟捕获：协调器层监听 `submitting` 与 `adjudicating` 状态跃迁并结合键盘监听，覆盖鼠标点击发送按钮、纯 Enter、Ctrl/Cmd+Enter，草稿发出瞬间无损入库。

## [2.6.1] - 2026-10-18

### Added

- 旧版全局存储平滑迁移：会话本地无历史时自动从旧版单点存储 `dsh-prompt-history.global` 无损继承数据并沉淀到该会话，升级后历史记录不丢失。
- 增量旧消息周期巡检：挂载 1500ms 轻量巡检定时器，与会话切换生命周期绑定，自动补充视口向上滚动新加载的旧轮次与异步就绪节点。

### Changed

- 提炼排序中枢 `sortAndClamp()`：无论消息来自即发即入库、旧版继承还是逆向滚动加载，全量按 `time` 与 `seq` 严格单调升序排列，最早在前最新在末尾，修复旧消息前置加载导致的历史乱序与时间轴倒挂。

## [2.6.0] - 2026-10-18

### Added

- 长会话输入端本地无损记忆：提交草稿瞬间无损入库，保留原始多行换行、代码缩进与全部标点，不受宿主消息窗口裁剪影响。
- 会话级隔离持久化存储：`StorageDriver` 扩展 `scope` 命名空间，按 `dsh-prompt-history.session:<id>` 实现各会话历史完全隔离与持久化备份。
- 会话切换与刷新毫秒级还原：`PromptHistoryEngine` 增加 `sessionHistories` 内存缓存与 `switchSession` 记忆切换，切走暂存、切回秒级还原。
- 会话清理：监听 `useSession` 的 `removed` 状态，会话归档删除时调用 `cleanupSession` 释放存储空间。

### Removed

- 从设置页中移除「配置健康与自愈维护」和「高级维护与配置提取」两个 UI 区域，设置页回归复制剪贴板、历史回溯与快捷手势、历史搜索面板三大核心功能区。
- 清理双语字典中不再使用的词条与无用状态，客户端产物体积进一步精简。

## [2.5.1] - 2026-10-17

### Removed

- 移除已退役的 invariant 诊断机制：删除 `src/invariant.ts`，从 `exports` 移除 `./invariant`，从发布白名单移除 `lib/invariant.js`，清除 `@deepseek-ai/dsh-invariants` 依赖，简化打包入口。

### Changed

- `package.json` 的 `engines` 添加 `"dsh": ">=0.2.0-rc.2"`，让 0.2.1-rc.2 宿主的新发现中心和插件管理器优先判定兼容。
- 所有 `@deepseek-ai/dsh-*` peer 依赖范围拓宽为 `">=0.2.0-rc.2"`，支持 0.2.0-rc.2 与 0.2.1-rc.2 全系安装。

## [2.5.0] - 2026-10-17

### Removed

- 移除 ≤0.1.1、0.1.2-rc 及 2.0.x 旧版兼容分支，清除 `legacy.nodes`、`anchorSeq`、`data.seq`、`data.time`、`data.content` 等多代容错探测代码。

### Changed

- 会话节点解析器直接对齐 DSH 0.2.0-rc.2 `records.d.ts` 的 `UserMessageNode` 与 `SteeringMessageNode` 官方契约，直接提取 `seq`、`time` 与 `content` 纯文本，精简 AST 解析链路并提升性能。
- 移除 `InputHistory.tsx` 中的 `(props as any).useChat` 探针与 `rawNodesOf` 四阶容错探测，改经标准会话 Props `useConversation` 消费官方 `ChatSnapshot`，`order` 键序列加 `nodes.get` 强类型存取。
- `src/client/index.ts` 补齐 `export default { apply, inject }` 与具名 `export const inject` 双导出，修复隔离新实例冷启动时因隐式依赖导致的未就绪报错。

## [2.4.1] - 2026-10-10

### Fixed

- 插件图标按高保真 Lanczos 抗锯齿重采样压缩为 256×256，体积从 987 KiB 降至 77.63 KiB，满足宿主对插件元信息 256 KiB 上限的要求，修复启动扫描插件时抛出 `icon exceeds 256 KiB` 异常的问题。

## [2.4.0] - 2026-10-10

### Added

- 前导空格隐私提示词：以空格开头的提示词不入库不持久化，对齐 Bash `ignorespace` 规范。
- 工业级配置健康自愈系统：提供 `extractValidConfig` 容灾提取器与 `analyzeConfigHealth` 诊断器，配置残缺、类型错误或混入未知脏键时提取完好字段并自动补齐默认值；`generateHealingOps` 精准清除历史废弃脏键并生成标准字段，支持一键自愈。
- 设置卡重构为四大功能区：复制剪贴板、历史手势、历史搜索、健康维护，支持实时健康徽标。
- 编辑器换行模型加固：适配 Lexical 编辑器的兄弟段落 `<p>` 换行与软换行 `<br>`，修复多行文本首末行误吞。

### Changed

- 全生命周期可逆化：宿主 `inputTriggers` 服务注入 `Symbol.for('dsh.ph.origTrack')` 原方法固化加 `WeakRef` 会话追踪集合，插件卸载或热重载时恢复全局 `sessionOf` 与所有活跃会话的原 `track` 方法，修复闭包与内存常驻泄漏。
- 样式标签注入与 `ctx.slots.inject` 统一包裹进 `ctx.effect` 响应式副作用通道，插件禁用或卸载时自动从 `document.head` 移除样式标签与插槽监听器。
- 浮层深模块化：抽离 `HistoryOverlayController`，封装 180 余行命令式 DOM 浮层逻辑，消灭 5 个模块级全局指针与双向状态穿透；提炼 `splitHighlighted` 文本切片、`formatPreview` 多行截断与 `calculatePanelTop` 视口避让为无副作用纯函数。
- 输入外壳重构：`InputHistory.tsx` 解耦为 `useSelectionCopyToolbar`、`useRightClickPaste`、`usePromptHistoryHotkeys` 三个正交自定义 Hooks，主组件精简至约 90 行。
- 配置域与控制器清晰分层：维持 `prefs.ts` 纯领域模型与 `card-controller.ts` UI 插槽控制器分层，复用并重导出单一真源类型 `PrefField`。

## [2.2.2] - 2026-10-06

### Fixed

- 解除前导命令认领态下对行内斜杠技能补全的压制：`/plan` 这类带参命令按空格后被宿主认领，输入框进入 `claimed` 阶段后后续斜杠一律被当作命令参数文本，`/plan /dsh-plugin-dev` 之类的行内斜杠敲不出补全；插件包装每会话控制器的 `track`，光标位于段前有正文的行内斜杠时把守卫降级回 `plain`，判定收敛在 `claim-guard.ts` 的 `hasInlineSlash`。
- 建议菜单让位选择器增强：`OPEN_MENU` 扩为 `[role="listbox"], [data-trigger-menu]`，宿主菜单骨架屏未挂载 listbox 的加载窗口期同样让位，消除按键抢占。

## [2.2.1] - 2026-10-06

### Fixed

- 双击 Esc 关闭时让位宿主：`doubleEsc=false` 时连按 Esc 不再被插件消费，宿主自行关闭其浮层或菜单。
- 宽屏历史面板右侧完整预览：窗口 ≥1000px 时在列表右侧显示高亮条目的完整内容，最多 6 行，超出显示省略计数。

## [2.2.0] - 2026-10-06

### Removed

- 移除 Ctrl+R 手势：历史列表入口仅剩「输入框为空时双击 Esc」，Ctrl+R 交还浏览器恢复原生刷新；删除 `historyGesture` 字段与相关文案。已有用户升级需在 `cordis.patch.yml` 里删除 `historyGesture` 行，否则配置写入会被宿主以未知键拒绝。

### Added

- 双击 Esc 独立开关 `doubleEsc`，默认开：非空草稿双击清空并存入历史，空草稿双击打开历史列表；关时 Esc 完全交还宿主。
- 历史条数上限可调：新增 `maxHistoryItems`，默认 100，档位 50 / 100 / 200 / 500 / 1000，历史环与列表统一按此裁剪。

### Changed

- 历史面板对齐 Claude Code：行首相对时间，过滤支持包含与子序列模糊匹配，高亮两端夹取不环绕，宽窗口右侧显示选中条目完整内容预览，列表最新在顶。
- 历史条目从纯字符串改为 `{ text, time }`：跨会话 localStorage 环保留时间戳，旧纯字符串条目兼容显示为无相对时间。
- 相对时间格式化为 `5m / 3h / 2d` 短格式。

## [2.1.0] - 2026-10-06

### Changed

- 复刻 Claude Code 的上下键历史与双击 Esc 语义：上键从最新一条逐条回退、到底不环绕，下键恢复草稿，光标回填行首与行尾；多行输入只在光标处于首或末行时才接管方向键，行号按 Lexical 的 `<br>` 结构计算。双击 Esc 改为草稿非空时第一次提示、第二次存入历史后清空输入框。
- 去掉设置保存按钮，改动自动保存：配置卡不再使用官方 `SettingsForm` 外壳与 staged 草稿，开关、单选与「恢复默认」点击即写入宿主；失败时显示提示并回落到宿主真值；删除 `save`、`saving`、`conflict`、`draftHint` 文案键。
- README 精简为双语文档：主 README 改为英文，新增 `README.zh.md` 中文版；移除 `README.en.md`、`README.es.md`、`README.pt.md` 并同步 `package.json` 的 `files` 清单。

### Fixed

- 修正 Lexical 多行输入的首末行判定：Lexical 的换行是 `<br>` 而非 `\n`，旧实现按换行符判断会把多行草稿误判成单行，光标停在第二行按上键也直接进历史；改为按 host 开头到光标锚点的 `<br>` 数计算行号，空输入框的占位 `<br>` 不计为第二行。

## [2.0.2] - 2026-10-06

### Changed

- 设置界面迁移到官方 `SettingsForm` 体系：`plugins.bundle.config` 配置卡改用官方外壳，含不可用提示、只读横幅、保存失败提示与草稿管理，保存语义改为 staged 草稿加一次保存。新增 `SettingsCardController`：用快照 `revision` 做冲突栅栏，保存后回读逐字段比对确认落盘。

### Fixed

- 修复 2.0.1 客户端从未加载成功：tsdown 产物注册 id 仍是旧名 `dsh-prompt-history`，与改名后的包名 `@wenaixi/dsh-prompt-history` 不一致，client-modules 报 `loaded without registering` 导致整条 client bundle 无法激活；产物 id 与配置插槽 key 一并修正为包名。
- `cordis.patch.yml` 与 schema 默认值逐字段对齐，消除 config-editor 深比较判定差异。

[Unreleased]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.7.1...HEAD
[2.7.1]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.6.2...v2.7.0
[2.6.2]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.6.1...v2.6.2
[2.6.1]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.6.0...v2.6.1
[2.6.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.5.1...v2.6.0
[2.5.1]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.4.1...v2.5.0
[2.4.1]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.2.2...v2.4.0
[2.2.2]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Wenaixi/dsh-prompt-history/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/Wenaixi/dsh-prompt-history/releases/tag/v2.0.2
# 项目规范与核心记忆

## 项目定位

- 包名 `@wenaixi/dsh-prompt-history`（scoped，npm 与 GitHub 已发布，latest 见 CHANGELOG）。仓库 `origin` = Wenaixi/dsh-prompt-history，`upstream` = Xiaofei-fei/dsh-prompt-history（只读）。主分支 main。
- 功能：DSH 输入框的终端式交互——Claude Code 式上下键历史、双击 Esc 历史列表、选中文本复制/引用、右键粘贴。
- 形态：Host 半侧只声明配置 schema；浏览器半侧交付交互、配置卡与文案。零第三方依赖。
- 文档：主 README 英文、`README.zh.md` 中文；CHANGELOG 中文。

## 宿主契约（不可改的外部事实）

改任何东西之前先核对这几条，它们都出自 `@deepseek-ai/*` 0.2.0-rc.2 的真实源码：

| 契约 | 出处 |
|---|---|
| 触发档位 `plain / claimed / frozen`；`claimed` 时 `detectTrigger` 硬跳过所有 `/` | `dsh-client-ui-input-trigger/lib/client.js` `detectTrigger` |
| 建议菜单 DOM：外层 `[data-trigger-menu]`，内层 `role=listbox`（骨架屏期只有外层） | 同上 `MenuView` |
| 认领只能落在草稿首段（span 之前必须全是空白） | `dsh-client-ui-conversation` `beginCommand` |
| 菜单候选项 id 形如 `dsh-slash-option-<source>-<index>`，分组标题带 `data-source` | 同上 `MenuView` |
| 命令目录冷态不认领：`CommandDirectory.resolve` 在 `state !== 'ready'` 时返回 undefined | `dsh-client-ui-commands` |
| Settings 命名空间 = Loader 行 id = `dsh-prompt-history` | dsh-settings 取 `entry.options.id` |
| 配置槽位 key = 包名（`entry.options.key` 比对 `pkg.name`） | dsh-client-ui-plugin-manager |

## 配置数据通路（唯一真源是宿主）

```
配置卡 → SettingsCardController → ConfigForm.mutate(ops, revision)
      → remote.settings → 宿主 SettingsController → dsh-settings
      → config-editor → profile 的 cordis.patch.yml
```

插件不提供任何 HTTP 端点。四条硬约束：

1. **命名空间 = Loader 行 id**，即 `dsh-prompt-history`。插件不注册命名空间。
2. **`plugins.bundle.config` 的插槽 key = 包名**。写错则整块不出现且零报错。
3. **该 slot 渲染时不带 `form`**，表单必须由注册方 `ctx.inject(['configForms'])` 取 `configForms.get(NS)`，经 inject 面交给组件。
4. **`configForms` 是可选的**：动态注入 + 包在 `whileServed([NS], ...)` 里。Host 半侧必须 `ctx.inject(['settings'], ...)` 调 `settings.configure({ auto: false }, ctx.fiber)`，否则入口出现两份。

### cordis.patch.yml 的 config 必须写全

九个字段全写、且与 `src/index.ts` schema 默认值逐字段一致。config-editor 写入前把「组合后的条目配置」与「用户提交的新值」深比较，不一致即判为被更高层覆盖并返回 `settings/rejected`。少写字段同样被拒——用户第一次改的正是缺失那项。

## 配置字段（全部 `volatile()`）

| 字段 | 取值 | 默认 | 作用 |
|---|---|---|---|
| copyMode | off / toolbar / auto | toolbar | 选中文本后：不做 / 弹工具栏 / 立即复制 |
| rightClickPaste | bool | true | 输入框右键直接粘贴 |
| historyEnabled | bool | true | 关闭后 ↑/↓ 与双击 Esc 全部交还宿主 |
| doubleEsc | bool | true | 双击 Esc 开关；关则 Esc 完全交还宿主 |
| maxHistoryItems | int 10..1000 | 100 | 历史环与列表条数上限（UI 档位 50/100/200/500/1000） |
| relativeTime | bool | true | 历史列表行首相对时间（5m/3h/2d） |
| fuzzyMatch | bool | true | 过滤允许字符子序列模糊（exact 在前） |
| globalHistory | bool | false | 历史跨会话保留（localStorage，受 maxHistoryItems 约束） |
| ignoreLeadingSpace | bool | false | 前导空格提示词不记录入历史（对齐 Bash ignorespace，敏感指令阅后即焚） |

- 只有 volatile 字段会被投影成表单；非 volatile 字段写入抛错。
- 旧 `copyOnSelect` 兼容：true → auto，false → toolbar；`copyMode=off` 是合法新值，不被规范化掉。
- **破坏性迁移**：已装用户 profile 里的陈旧字段（`tocVisible`、`historyGesture`）会让配置写入被宿主以未知键拒绝，升级需手动删行。

## 客户端数据面（src/client/）

| 文件 | 职责 |
|---|---|
| `claim-guard.ts` | 纯函数 `hasInlineSlash`：认领态行内斜杠判定 |
| `prefs.ts` | 纯模型规范化与单一真源快照 Store；发布给功能组件与卡片控制器，折叠消除转运层 |
| `card-controller.ts` | `SettingsCardController`：快照投影成 UI 状态、操作即写、失败标记、代际计数 |
| `SettingsCard.tsx` | 配置卡：自绘外壳（不可用/只读/失败提示）+ 官方 `Switch` + 自绘单选块 |
| `history-engine.ts` | 纯 TypeScript 无头历史状态机：存储环 FIFO 截断、Claude Code 浏览、双击 Esc、输入法差量搜索、前导空格过滤 |
| `history-overlay.ts` | 浮层深模块控制器：`HistoryOverlayController`，封装 DOM 骨架构建、高亮切片、视口定位与宽屏截断预览 |
| `InputHistory.tsx` | 交互协调器：采用 Coordinator 模式组合 `useSelectionCopyToolbar`、`useRightClickPaste`、`usePromptHistoryHotkeys` 3 个正交 Hooks，接入 `HistoryOverlayController` |
| `editor.ts` | 编辑器 DOM 适配：段落 `<p>` 换行与软换行 `<br>` 视觉行精准判定，杜绝多行误吞 |
| `history-model.ts` / `nodes.ts` / `feedback.ts` / `i18n.ts` | 纯模型 / 节点读取 / 选区气泡反馈 / 非 React 取词 |
| `index.ts` | 注册 `conversation.input.right` 槽位、配置卡、`inputTriggers` 守卫放宽（带 100% 可逆生命周期） |

- 一次性迁移判据是宿主 `user` 层：空（含空对象）表示从未写过，此时才提交旧 localStorage。
- 订阅表单快照必须用箭头函数包一层：`form.getSnapshot` 直接交给 `useSyncExternalStore` 会丢 `this`，表单内读 `this.store` 抛 TypeError。

## 认领态行内斜杠补全（2.2.2）

宿主把 `/plan ` 这类带参命令认领后进入 `claimed`，其 `detectTrigger` 有一行 `if (guard.tier === "claimed") continue`，把命令参数里的斜杠一律当文本，于是 `/plan /dsh-plugin-dev` 敲不出补全。

`index.ts` 注入 `inputTriggers` 并包装每会话控制器的 `track`：光标位于行内斜杠时把守卫降级为 `plain`。

- 判定只看「光标所在的空白分隔段含 `/` 且段前有正文」。段前有正文正好排除认领令牌（宿主只允许认领首段）。
- 是否是真触发符仍由宿主 `boundaryOk` 裁决，URL、`//` 照旧被抑制——插件不复制宿主边界规则。
- `ponytail:` 依赖 `sessionOf().track` 这条内部路径。宿主重构触发控制器时静默失效（退回裸宿主行为，不报错）；升级 DSH 后重跑隔离实例的 `/plan /ds` 验收即可确认。

## 设置界面规范（自绘外壳 + 操作即写）

- **外壳自绘**：不可用提示、只读横幅、保存失败提示都由 `SettingsCard.tsx` 自己渲染。
- **保存语义 = 写即生效**：开关、单选、恢复默认都立即走 `ConfigForm.mutate`，没有保存按钮、没有草稿；连点由宿主写入队列串行 + revision 栅栏。
- 布局：一行标题 + 一行说明 + 右侧控件；行间只用 0.5px 分隔线；不套第二层卡片。
- 单选用「可点面板块 + `role=radio`」；开关用官方 `Switch`；颜色圆角间距一律 `--dsw-*` token。
- 不可关闭的能力用「说明行 + 徽标」呈现，不画永远不动的开关。
- 文案 zh/en 由 `Record<keyof typeof zh, string>` 强制对齐。

## 插件元数据与本地化

- `locale/{zh,en}.json` 形状为 `{ "meta": { "title", "description" } }`；键名就是 `title` / `description`。
- `package.json` 需要 `exports["./locale/*"]` 与 `files` 里的 `locale/*.json`。
- 插件详情页「包含的组件」重复显示包名是**宿主行为**（RowsSection 去重只认 title 等于 rowId 的行）。**因此不要改行 id**：命名空间 = `entry.options.id`，改 id 是破坏性迁移。

## 构建与产物

- `pnpm build` = `tsc -p tsconfig.build.json`（声明到 lib/types）+ `tsdown`（`lib/index.js`、`lib/invariant.js`、`lib/client.js`）。**两步都要跑**。
- **tsdown 的 `ID` 必须等于包名**。不一致时报 `loaded without registering`，整条 client bundle 无法激活（2.0.1 栽在这里）。
- 客户端产物是 `__ModuleLoader__` CJS factory，gzip 约 25 KB；external 只列 react 与官方 `@deepseek-ai/*` peer 包。
- **`lib/types` 不会自动清理已删源码的声明**。删文件后要手动删对应 `.d.ts` / `.d.ts.map`（`sessionCtx.d.ts` 就是这么混进 tarball 的）。
- `pnpm install` 会触发 `prepare`（=`pnpm build`）。装完记得 `git checkout -- package.json`（pnpm 会重排依赖顺序）。

## 验收规范

### 隔离 profile

- profile：`prompt-history-e2e-v3`（bundles: dsh-base + dsh-web-app + 本插件），启动 `dsh --profile prompt-history-e2e-v3 --port <port> --no-open`。
- **`node_modules/@wenaixi/dsh-prompt-history` 必须是 junction 且指向仓库根**。指向 pnpm 实体时读到旧产物快照。
- **不要跑 `pnpm install`**：宿主用自己的解析器读 peer 依赖，pnpm 装的 `.modules.yaml` 会让它报「Unexpected end of JSON input」。手工建 junction。
- 首次打开会弹「预览版说明」模态；脚本先点掉 `[role=dialog] button`。
- 复用实例要换 token：`dsh` 每次启动新 token，旧脚本的硬编码 token 会 401。

### 复现前置条件（认领态场景专属）

**不焐热命令目录就复现不出主症状。** `/plan` 空格要真正触发认领，前提是命令目录已 `ready`。正确顺序：先发一条消息建真实会话 → 输一次 `/` 等 2.5 秒 → 再输 `/plan `（此时宿主会给 `/plan ` 加 `--dsw-alias-state-business-primary` 染色）。冷启动直接打 `/plan /ds` 是 `listbox=0` 但 `claimed=False`，那是另一个原因，不能当主症状的证据。

### 断言纪律

- 本机 Playwright 无 chromium，用 `executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe'`。
- 系统语言为中文时 body 文本是乱码（编码），**断言只能用 DOM 属性与 API 回读，不要用文本匹配**：
  - 命令菜单存在 → `[role="presentation"][data-source="command"]` + `[id^="dsh-slash-option-command-"]`；
  - 技能命中 → `[id^="dsh-slash-option-skill-"]` 的 `innerText` 首行（ASCII 技能名可靠）；
  - 认领态 → host `innerHTML` 含 `state-business-primary`；
  - 历史面板 → `.dsh-ph-history`（`HISTORY_CLASS` 常量，不是 `.dsh-ph-panel`）。
- 配置真值只能回读 `POST /api/settings/describe` + profile `cordis.patch.yml`。报文 `{type:'client-request', rpcId, method:'settings/describe', payload:{args:{}}}`，先访问 `/?token=` 拿 `dsh-auth-*` cookie。
- 禁用插件用 `--patch <abs>/disabled.yml`（`- id: dsh-prompt-history` + `disabled: true`）。**`--patch` 是 dsh 外层参数**。

### 门禁清单

```sh
node node_modules/typescript/bin/tsc --noEmit             # 类型
node --experimental-strip-types --test test/*.test.ts     # 68 项纯函数测试（覆盖历史引擎、模型、自愈、守卫与浮层控制器）
pnpm build                                                # 两步构建
npm pack --dry-run --json                                # 产物清单（输出前混着 prepare 日志，从 '[' 切）
```

## 发布流程

1. 更新 `CHANGELOG.md` 与双语 README；bump `package.json` 版本。
2. 跑完「门禁清单」+ 隔离实例浏览器验收。
3. `git commit` → `git tag -a vX.Y.Z -m "..."` → `git push origin main` → `git push origin vX.Y.Z`。
4. CI（push main）与 Release（push tag）自动触发。
5. **双真源验证**（间隔约 20 s 等 registry 传播）：registry 查 `dist-tags.latest` + `gh release view vX.Y.Z`。不要只信 `npm view`：镜像 registry 会假阴性。

## 键位与历史列表语义

- **↑**：光标在第一行时进入浏览，从最新一条逐条往回；到底不环绕；回填光标签行首。
- **↓**：浏览中光标在最后一行时往更新方向走；回填光标行尾；到底恢复开始浏览前那一行。
- **浏览状态**：`browseRef.step` = 已浏览条数（0=未浏览）；浏览期间手工编辑丢弃召回。
- **多行判定**：Lexical 的换行是 `<br>` 而非 `\n`，行号数 `host 开头→光标锚点 fragment` 里的 `<br>`；空输入框占位 `<br>` 不算第二行。
- **双击 Esc**（`doubleEsc` 开关，默认开）：非空草稿第一次提示「再按一次 Esc 清空」并透传，800 ms 内第二次存入历史后清空；空草稿打开历史列表。
- **历史列表**（空草稿双击 Esc）：最新在顶、重复只留最新；打字过滤 = 包含 + 可选子序列模糊；↑↓/Home/End 移动高亮（两端夹取不环绕）；Enter/Tab 回填；Esc 还原；行首相对时间；宽屏（≥1000px）右侧预览。
- **右键**：输入框内直接粘贴。**选中文本**：按 copyMode 决定不做 / 弹工具栏 / 立即复制。
- **Ctrl+R 已移除（2.2.0）**：浏览器保留原生刷新。
- 建议菜单开着时插件全部让位：`OPEN_MENU = '[role="listbox"], [data-trigger-menu]'`（外层属性覆盖骨架屏窗口期），且本插件面板开着时跳过该检查，否则取消面板还原出的 `/` 开头草稿会弹出建议菜单，面板再也关不掉。

## 不做的事

- 不自建 HTTP 端点、不新增第三方依赖、不为旧 DSH 版本保留兼容层。
- 手势仅双击 Esc 一个入口。
- 不改用户日常 profile；不强行改行 id。
- 不重写宿主补全管线的边界规则（URL、`//` 判定归宿主 `boundaryOk`）。

## 决策记录

- **2026-10-10 架构深度演进与质量重构（全生命周期可逆化、浮层深模块解耦与 Coordinator 模式落地）**：1. 依据三子代理（生命周期、DOM 架构、React 状态管理）深度核验结论，在 `src/client/index.ts` 中落地 100% 可逆生命周期（CSS 样式注入卸载与基于 `Symbol.for('dsh.ph.origTrack')` + `WeakRef` 的会话猴补安全还原）；2. 抽象 `src/client/history-overlay.ts` 深模块，将 180+ 行命令式 DOM 浮层收拢进 `HistoryOverlayController`，消灭 5 个全局模块变量，并将切片与视口算法提炼为纯函数；3. 新增 `test/history-overlay.test.ts` 12 项离线单测，全仓纯函数单测扩充至 68 项全绿；4. 重构 `InputHistory.tsx` 为 Coordinator 模式，正交解耦为 3 个轻量自定义 Hooks，根治 Divergent Change 坏味道；5. 固化 `card-controller.ts` 与 `prefs.ts` 边界，顺利通过 `tsc`、68 项单测、`pnpm build` 与 `npm pack` 校验。
- **2026-10-10 配置高可用自愈重构系统与人性化四区分组设置**：1. 落地工业级纯函数配置提取消毒器（`extractValidConfig`）与健康诊断器（`analyzeConfigHealth`），在配置残缺、类型错乱或混入未知废弃脏键时，毫秒级榨取完好字段并自动补齐默认值；2. 针对宿主 profile 深比较及 patch 约束实现 `generateHealingOps`，精准拔除历史废弃脏键（unset）并全量生成 9 个标准字段（set），实现配置一键自愈与重构；3. 前端设置卡重构为人性化四大功能区（复制剪贴板、历史手势、历史搜索、健康维护），补全之前遗漏渲染的 `ignoreLeadingSpace` 开关，新增实时健康徽标、保存被拒自愈脱困横幅与高级备份/提取工具；4. 单测套件扩充至 56 项全绿。
- **2026-10-09 架构深度重构与精细化演进**：1. 修复 Lexical 段落换行（<p> 无 br）导致多行文本被误吞的历史隐患，加固 editor.ts；2. 抽离纯 TypeScript 状态机 PromptHistoryEngine，收拢 8 个 Ref，建立 48 项纯 Node 毫秒级单测护城河，InputHistory.tsx 精简过半；3. 折叠 prefs-model.ts 至单一真源 prefs.ts，杜绝双重订阅时序撕裂；4. 四端对齐落地高价值杀手级精细化配置 ignoreLeadingSpace（前导空格不入历史，对齐 Bash ignorespace 工业规范）。
- **2026-10-06 修复认领态行内斜杠补全（v2.2.2）**：Playwright 双实例对照定位到 `claimed` 档压制。补丁注入 `inputTriggers` 包装 `track`，判定收敛为 `claim-guard.ts` 的纯函数 `hasInlineSlash`（5 项单测）。隔离实例 12 项验收全绿，并在 `34a60e5` 源码上做「焐热命令目录」的严格对照确认症状可复现。
- **2026-10-06 复刻 Claude Code 上下键历史与双击 Esc 语义**：↑/↓ 改为顺序浏览（↑ 从最新往回、到底不环绕；↑ 光标行首、↓/恢复草稿行尾；多行只在首/末行接管）。发现两个宿主细节：Lexical 多行换行是 `<br>`；空输入框有占位 `<br>` 不能算第二行。
- **2026-10-06 去掉保存按钮，改动自动保存**：配置卡改为自绘外壳 + 操作即写。删除草稿机、冲突栅栏与 `save/saving/conflict/draftHint` 文案键。
- **2026-10-06 设置界面迁移官方 SettingsForm**：后被上一条撤销。（同批修掉两个拦路 bug：tsdown 产物 id 与包名不一致导致客户端从未加载、插槽 key 未用包名导致配置区不渲染。）
- **2026-10-05 移除会话目录（Chat TOC）**：删 `ChatToc.tsx` 与 `sessionCtx.ts`、`tocVisible` 字段与设置项。
- **2026-10-05 历史列表选择器落地**：见「键位与历史列表语义」；详细实现计划在 `docs/history-picker-plan.md`。
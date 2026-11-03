# 项目规范与核心记忆

## 项目定位

- **标识**：包名 `@wenaixi/dsh-prompt-history`（scoped，npm 与 GitHub 已发布，最新版本 `v2.7.1`）。仓库 `origin` = Wenaixi/dsh-prompt-history，`upstream` = Xiaofei-fei/dsh-prompt-history（只读）。主分支 `main`。
- **定位**：DeepSeek Harness (DSH) Web 输入框终端级交互套件——Claude Code 风格顺序历史回溯、双击 Esc 搜索面板、选中文本引用/自动复制、鼠标右键直接粘贴、前导空格阅后即焚、斜杠命令原型重构与长会话本地无损持久化记忆。
- **形态**：Host 半侧声明配置 Schema 与抑制自动表单；浏览器半侧交付交互、自绘配置卡与双语词典。零第三方运行时依赖。

---

## 宿主硬契约（外部绝对事实）

基于 `@deepseek-ai/*` 0.2.1-rc.4 与 0.2.0-rc.2 真实源码验证：

| 契约项 | 宿主事实与出处 | 插件实现约束 |
|---|---|---|
| **会话事件窗口裁剪** | 宿主采用事件窗口加载长会话（`dsh-client-ui-conversation/snapshot.d.ts`） | 较早消息处于 `unloaded` 态，未加载进 `chat.order`；必须由输入端本地持久化保证全量回溯 |
| **快照双源降级提取** | 宿主 Chat 视图提供 `order` 视口切片与 `legacy.nodes` 备用全量集（`dsh-client-ui-chat`） | 优先取 `order + nodes.get(key)`，视口未投影或受裁切时安全降级至 `legacy.nodes` |
| **全形态用户输入** | 宿主节点经 `chatNode` 封装，数据落在 `node.data`，命令为 `kind: 'command'`（同上） | 智能穿透 `node.data`；精准重构 `/${name} ${args}` 命令原型并吸收 `question-reply` 与 `command-input` |
| **右侧大纲有损截断** | 右侧导航轨由 `turnOutline` 投影生成，硬施加 `PROMPT_PREVIEW_LIMIT = 50` 截断与空白折叠（`dsh-session-turn-outline`） | 右侧大纲是有损摘要，绝不能直接作为原始提示词回填输入框 |
| **引擎版本仲裁** | 0.2.1 系列插件管理器优先按 `engines.dsh` 判定兼容性（`plugin-market`） | `package.json` 显式声明 `"engines": { "node": ">=20", "dsh": ">=0.2.0-rc.2" }` |
| **诊断机制下架** | 0.2.1 系列彻底移除 `invariants` 插件与各包 `./invariant` 导出（`dsh-invariants`） | 彻底删除 `src/invariant.ts`，从导出、白名单与 peer 依赖中全量剔除 |
| **触发档位压制** | `claimed` 态下 `detectTrigger` 硬跳过所有 `/`（`dsh-client-ui-input-trigger`） | `index.ts` 猴补 `sessionOf().track`，行内斜杠降级为 `plain` |
| **建议菜单 DOM** | 外层 `[data-trigger-menu]`，内层 `role=listbox`（同上 `MenuView`） | 让位选择器必须覆盖两者，防骨架屏期误判抢占 |
| **认领生效区** | 命令芯片化（`CommandChipNode`）认领令牌落在首段（`dsh-client-ui-conversation`） | 行内斜杠判定：光标段含 `/` 且「段前有正文」排除认领令牌本身 |
| **双面显式导出** | 隔离实例冷启动要求客户端显式提供依赖拓扑（`dsh-cordis-client-runner`） | `index.ts` 必须同时导出 `export const inject` 与 `export default { apply, inject }` |
| **命名空间绑定** | Settings 命名空间 = Loader 行 id = `dsh-prompt-history` | 插件自身不注册命名空间，由宿主投影配置 |
| **配置插槽匹配** | `plugins.bundle.config` 插槽 key = 完整包名（`plugin-manager`） | 必须以包名注册，且该 slot 渲染时不带 form，需动态注入获取 |
| **配置覆写深比较** | 组合条目配置与新值逐字段深比较，不一致报 `settings/rejected` | `cordis.patch.yml` 必须写全 9 个字段且与 Schema 默认值完全一致 |
| **Volatile 约束** | 仅 `volatile()` 字段投影成表单；非 volatile 写入直接抛错 | 9 个配置项全部声明为 `.volatile()` |
| **图标体积硬界** | 宿主插件元信息加载硬校验 `icon exceeds 256 KiB`（`plugin-manager`） | `assets/icon.png` 必须压制在 256 KiB 以内（安全水位 ≤100 KiB，基准 256x256 ~78 KiB） |

---

## 配置数据通路与 9 大字段

### 数据流向
```
配置卡 UI → SettingsCardController → ConfigForm.mutate(原子 ops)
          → remote.settings → 宿主 SettingsController → dsh-settings
          → config-editor → profile 的 cordis.patch.yml
```

### 配置字段定义
| 字段名 | 类型与取值 | 默认值 | 业务语义与行为 |
|---|---|---|---|
| `copyMode` | `'off' | 'toolbar' | 'auto'` | `'toolbar'` | 选中文本后：不作为 / 弹浮动工具栏 / 自动复制到剪贴板 |
| `rightClickPaste` | `boolean` | `true` | 输入框内鼠标右键直接将系统剪贴板粘贴至光标处 |
| `historyEnabled` | `boolean` | `true` | 总开关：关闭后上下键历史与双击 Esc 完全交还宿主 |
| `doubleEsc` | `boolean` | `true` | 双击 Esc 开关：非空草稿双击存入历史并清空，空草稿开搜索列表 |
| `maxHistoryItems` | `number (10..1000)` | `100` | 历史存储环与搜索列表容量上限（UI 档位 50/100/200/500/1000） |
| `relativeTime` | `boolean` | `true` | 历史列表行首显示紧凑相对时间（5m / 3h / 2d） |
| `fuzzyMatch` | `boolean` | `true` | 过滤允许字符子序列模糊匹配（精确命中在前，模糊命中在后） |
| `globalHistory` | `boolean` | `false` | 历史跨会话跨窗口保留（localStorage，受容量上限约束） |
| `ignoreLeadingSpace`| `boolean` | `false` | 前导空格提示词阅后即焚（对齐 Bash ignorespace，不记录入历史） |

---

## 客户端架构拓扑（src/client/）

采用严格的领域分层、深模块化（Deep Module）与协调器（Coordinator）设计：

| 模块文件 | 架构定位与核心职责 |
|---|---|
| `history-engine.ts` | **核心无头状态机（深模块）**：纯 TypeScript 驱动，会话级隔离存储（`scope` 支持）、权威 `seq` 强去重、本地乐观草稿与服务端真实回声对齐融合（5s 窗口）、严格单调时间戳排序、存储环 FIFO 截断、顺序浏览与 800ms 双击 Esc。脱机零 DOM 依赖。 |
| `history-overlay.ts` | **浮层渲染控制器（深模块）**：`HistoryOverlayController`，封装 DOM 骨架构建、高亮切片（`splitHighlighted`）、视口避让定位（`calculatePanelTop`）与宽屏预览截断。 |
| `InputHistory.tsx` | **交互协调器（Coordinator）**：主组件管理生命周期与状态订阅，双数据源（`order` + `legacy`）降级解析，解耦会话切换与响应式消息吸收（0 延迟），挂载纯 Enter/点击全渠道提交拦截与会话清理，委派 3 个专属正交 Hooks。 |
| `nodes.ts` | **全形态会话消息解析器（纯函数深模块）**：自动穿透宿主 UI 包装层（`node.data`），覆盖常规提问、转向消息、斜杠命令（`/${name} ${args}` 原型重构）、交互问答回复与命令输入。 |
| `prefs.ts` | **配置领域模型与自愈中心（单一真源）**：快照 Store 发布、数据规范化、健康诊断（`analyzeConfigHealth`）与损坏自愈提取（`extractValidConfig`、`generateHealingOps`）。 |
| `card-controller.ts` | **UI 插槽控制器**：`SettingsCardController`，连接宿主 `ConfigForm` 与组件，维护 `generation` 代际计数栅栏（抑制并发乱序与卸载迟到回执），操作即写。 |
| `SettingsCard.tsx` | **自绘配置组件**：聚焦三大核心功能区（复制剪贴板、历史手势、历史搜索），原生主题 Token（`--dsw-*`）自绘单选面板与官方 `Switch`，彻底剔除过度工程的维护面板。 |
| `editor.ts` | **DOM 编辑器适配器（真实缝隙）**：兼顾 `textarea` 与 Lexical `contenteditable`，精准判定段落 `<p>` 与软换行 `<br>` 视觉行首末行，杜绝多行误吞。 |
| `claim-guard.ts` | **纯函数守卫**：`hasInlineSlash`，判定光标处于段前有正文的行内斜杠。 |
| `index.ts` | **客户端装配入口**：插槽注册、配置卡注入、`export default { apply, inject }` 显式依赖声明与 `inputTriggers` 猴补（通过 `ctx.effect` + `ORIG_TRACK` Symbol + `WeakRef` 实现 100% 可逆生命周期）。 |

---

## 交互语义标准

1. **方向键与 Emacs 导航（Claude Code 规范）**：
   - **↑ / Ctrl+P**：当输入跨越多行（无论是自动折行 Visual Wrapping 还是回车换行）时，优先在各视觉行之间移动光标；仅当光标位于首个视觉行（首边缘）时接管并向更早历史回溯；到底不环绕；回填时光标停在行首。
   - **↓ / Ctrl+N**：处于浏览状态且光标位于末个视觉行（末边缘）时接管并向更新方向步进；回填时光标停在行尾；到底时还原最初草稿。
   - **真实视觉几何判定**：引入 `getBoundingClientRect()` 测量光标相对于首行/末行的真实物理像素行高差，结合草稿换行符与段落索引多层互锁，彻底根除自动折行与段落切换时的误跳历史。
   - **输入法（IME）合成态保护**：宿主 `[data-composer-composing]` 标记与原生 `isComposing` 双重压制，输入法候选选词期间绝对不拦截任何键位。
2. **反向历史交互搜索（Ctrl+R 与 双击 Esc）**：
   - **Ctrl+R**：对齐 Claude Code 官方终端交互，按下直接唤起反向搜索面板；在搜索态下连续按下 `Ctrl+R` 循环步进更早匹配项；支持 `Enter`/`Tab` 采纳、`Esc` 取消。
   - **双击 Esc**：非空草稿 800ms 内双击存入历史并清空；空草稿双击唤起搜索面板。
3. **连续重复提交折叠（Consecutive Duplicates）**：
   - 严格遵循 Claude Code 规范，连续多次提交完全相同的提示词（无论间隔多久）自动合并折叠为单一条目，回溯时不出现连续重影。
4. **长会话本地无损持久化回溯**：
   - 无论宿主是否折叠隐藏早期消息，回溯始终直接命中当前会话的本地历史环，100% 保持原始多行换行与代码块，0 延迟、0 截断。
5. **行内斜杠技能补全**：
   - 当草稿已有前导认领命令（如 `/plan `）且光标处于后续参数中的行内斜杠时，临时将守卫降级为 `plain` 释放宿主补全管线，不影响前导令牌与 URL 边界。
6. **建议菜单让位**：
   - 宿主建议菜单处于打开状态（`[role="listbox"], [data-trigger-menu]`）时，方向键完全让位宿主菜单；本插件面板展开时绕过该让位防死锁。

---

## 工程规范与门禁清单

### 门禁执行序列
```sh
node node_modules/typescript/bin/tsc --noEmit             # 1. 静态类型检查 (0 错误)
node --experimental-strip-types --test test/*.test.ts     # 2. 96 项纯 Node 原生单测全绿 (~380ms)
pnpm build                                                # 3. 两步构建: tsc 声明到 lib/types + tsdown 打包
npm pack --dry-run --json                                # 4. 产物完整性与文件白名单校验 (41 文件)
```

### 构建与打包规范
- **CJS Bundle 标识**：`tsdown.config.ts` 的 `ID` 必须严格等于包名 `@wenaixi/dsh-prompt-history`，否则客户端无法激活。
- **发布白名单**：`package.json` 的 `files` 包含双语 README、CHANGELOG、LICENSE、`lib/`、`locale/` 与 `assets/icon.png`。
- **孤儿声明防范**：删除源码文件后必须同步清理 `lib/types/` 下对应的旧 `.d.ts` 与 `.d.ts.map`。
- **图标体积硬界**：`assets/icon.png` 严格控制在 256 KiB 以内（安全水位 ≤100 KiB，基准 256x256 ~78 KiB）。

---

## 发布与双真源验证流程

1. **版本与文档同步**：更新 `CHANGELOG.md`、`package.json` 版本号，确认双语 README 保持面向用户且无写死版本号；
2. **本地全量门禁**：通过上述门禁清单全项校验；
3. **版本提交与打标**：`git commit` → 纯数组传参 `child_process.spawnSync('git', ['tag', '-f', '-a', tagName, '-m', msg, headSha])` 强绑定；
4. **双向推送**：`git push origin main` → `git push origin vX.Y.Z`（若直连 22/443 被 RST，通过本地代理与 `connect.exe` 通道穿透推送），触发 GitHub Actions 自动化流水线；
5. **双真源校验闭环**：
   - 检查 GitHub Release：`https://api.github.com/repos/Wenaixi/dsh-prompt-history/releases/tags/vX.Y.Z` 挂牌核实；
   - 检查官方 npm Registry：`https://registry.npmjs.org/@wenaixi/dsh-prompt-history` 直连官方源核验最新 `dist-tags.latest`。

---

## 不做的事（边界约束）

- 不自建任何私有 HTTP 后端，所有配置数据完全依托宿主 Settings 通路；
- 不引入外部运行时第三方库（保持零依赖，CJS Bundle gzip 控制在 ~32.08 KB）；
- 不侵入宿主日常 profile，不对未修改配置实施强制改写；
- 坚决杜绝在面向用户的说明文档中出现硬编码的历史版本标签与临时数值。

---

## 核心决策记录

- **2026-11-04 多行光标穿透深度修复与 Claude Code 规范全量对齐 (v2.7.1)**：
  1. **多行光标首末行判定根因根治与几何测距（Visual Row & Multiline Caret Geometry）**：
     - 查明光标在非首行按 Up 误跳历史的 4 重根本诱因：
       a. 单行长文本因宽度限制产生 CSS 自动折行（Visual Row Wrapping）时，DOM 内既无 `\n` 也无 `<br>`，旧判定误判为第一行；
       b. 在段落间移动或点击时，Selection 的 `anchorNode` 停在 `host` 根节点，旧逻辑无脑执行 `if (anchor === host) return true`，无视 `anchorOffset > 0`；
       c. 缺失真实屏幕几何测距（BoundingClientRect）；
       d. 缺失实时草稿字符串换行符与字符偏移互锁；
     - 实施混合几何测距法则：通过折叠 Range 测量首行 `firstLineRect` 与末行 `lastLineRect`，结合 `anchor === host` 段落索引与草稿字符串换行符多层守卫，彻底消灭误吞多行光标移动缺陷；
  2. **Claude Code 规范全量对齐（Keyboard & History Protocol）**：
     - **Emacs / Readline 键位支持**：补齐 `Ctrl+P`（上一条）与 `Ctrl+N`（下一条），与 `ArrowUp`/`ArrowDown` 保持严格对称的边缘步进逻辑；
     - **交互式反向历史搜索（Ctrl+R）**：支持在空闲态按 `Ctrl+R` 直接唤起搜索面板，在搜索态下连续按 `Ctrl+R` 循环切换更早匹配项；
     - **连续重复提交折叠（Consecutive Deduplication）**：连续提交相同内容只留一条，彻底杜绝回溯时出现连续相同提示词；
     - **输入法合成态全链路防护**：接入宿主 `[data-composer-composing]` 标记与原生 `isComposing` 保护，输入法选词期间绝不抢占按键；
  3. **TDD 红绿双循环验证与门禁全绿**：
     - 补充 6 项高精度单测（重现首行假阳性、折行几何差测、Ctrl+P/N、Ctrl+R、连续去重与多行边界穿透），全量单测扩充至 **96 项纯 Node 原生单测全绿**，TypeScript 0 错误通过，打包校验无缝达标。
- **2026-10-31 会话历史全域无损加载与深层架构升级 (v2.7.0)**：
  1. **宿主包装层穿透与双源降级（ChatNode & Legacy Fallback）**：查明宿主 `views.get('chat').nodes.get(key)` 返回由 `chatNode` 封装的外层 UI 节点，真实数据包裹在 `node.data` 中；重构 `promptMessage` 智能穿透 `node.data`；在 `InputHistory.tsx` 建立双源降级（优先 `order + nodes.get`，次选 `legacy.nodes`），彻底消灭未投影或视口延迟导致的空白；
  2. **全形态用户输入无损覆盖**：
     - 斜杠命令（Slash Commands）：深度支持 `kind === 'command'`，精准重构还原用户原始键入命令（如 `/${name} ${args}`），彻底解决以斜杠命令发起会话时历史记录丢失缺陷；
     - 交互问答回复（Question Replies）：支持 `kind === 'question-reply' | 'user-question-reply'`；
     - 动态命令输入（Command Input）：支持 `kind === 'command-input'`；
     - 多样化内容块：支持纯文本字符串 content 与非标准块 text 提取；
  3. **权威序号优先强去重与乐观回声精准融合（Seq-Aware & Echo Reconciliation）**：
     - `sortAndClamp()` 与 `supplementMessages()` 优先以单会话唯一递增的 `seq > 0` 进行绝对去重；
     - 本地用户按键即发即入库（乐观条目无 seq）与宿主下发的正式回声事件精准识别并就地融合，回填权威 seq 并校准时间戳，根除重影；
     - 严格约束回声对齐必须在「一方有 seq 而另一方无 seq」的 5 秒窗口内执行，保护用户在不同时刻发送相同内容的时间线独立性；
     - 提交防抖窗口收敛至 500ms，完美吸收键盘 Enter 与 phase 状态跃迁同一瞬时的双重通知，彻底修复缺失时间戳（`time === 0`）在周期巡检下的重复追加；
  4. **会话切换即时响应式加载（Reactive Immediate Ingest）**：
     - 将原本耦合在 `switchSession` 中的消息监听拆分为专属响应式 Effect，消息到达瞬间毫秒级入库与旧版继承，彻底消灭切换会话后的 1.5 秒空窗期；
  5. **实机独立测试闭环与双真源发布**：
     - 搭建独立隔离实例 `dsh-verify-live`（端口 59240，direct source junction 联接），编写并在无头 Chrome（Playwright）下 **100% 全绿通过全部 5 大核心功能实机路测**（0 错误、0 警告）；
     - 单测套件扩充至 **90 项纯 Node 原生单测全绿**，GitHub Release `v2.7.0` 成功挂牌，npm 官方源直连核验权威上线（`dist-tags.latest = 2.7.0`）。
- **2026-10-18 双轴审查缺陷彻底根治与全渠道提交捕获 (v2.6.2)**：
  1. 确证长会话上方消息未加载属于宿主 Event Window 机制，确定输入端本地持久化（方案 B）全量回溯架构；
  2. 落地会话级隔离存储与旧全局历史平滑迁移，挂载 1500ms 安全增量巡检；
  3. 单测套件扩充至 82 项全绿，双真源闭环上线。
- **2026-10-10 ~ 2026-10-17 宿主契约与架构基线确立 (v2.4.0 ~ v2.5.1)**：
  1. 彻底对齐 0.2.1-rc.2 契约：删除废弃的 invariants 机制，会话快照直连 `views.get('chat')`，声明 `engines.dsh >=0.2.0-rc.2`；
  2. 图标通过 Lanczos 算法精确压制至 77.63 KiB 满足宿主 256 KiB 硬约束；
  3. 客户端双面显式导出拓扑就绪，建立单测基准与配置损坏自动提取愈合系统。
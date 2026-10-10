# 项目规范与核心记忆

## 项目定位

- **标识**：包名 `@wenaixi/dsh-prompt-history`（scoped，npm 与 GitHub 已发布）。仓库 `origin` = Wenaixi/dsh-prompt-history，`upstream` = Xiaofei-fei/dsh-prompt-history（只读）。主分支 `main`。
- **定位**：DeepSeek Harness (DSH) Web 输入框终端级交互套件——Claude Code 风格顺序历史回溯、双击 Esc 搜索面板、选中文本引用/自动复制、鼠标右键直接粘贴与前导空格阅后即焚。
- **形态**：Host 半侧仅声明配置 Schema 与抑制自动表单；浏览器半侧交付交互、自绘配置卡与双语词典。零第三方运行时依赖。

---

## 宿主硬契约（外部绝对事实）

基于 `@deepseek-ai/*` 0.2.0-rc.2 真实源码验证：

| 契约项 | 宿主事实与出处 | 插件实现约束 |
|---|---|---|
| **触发档位压制** | `claimed` 态下 `detectTrigger` 硬跳过所有 `/`（`dsh-client-ui-input-trigger`） | `index.ts` 猴补 `sessionOf().track`，行内斜杠降级为 `plain` |
| **建议菜单 DOM** | 外层 `[data-trigger-menu]`，内层 `role=listbox`（同上 `MenuView`） | 让位选择器必须覆盖两者，防骨架屏期误判抢占 |
| **认领生效区** | 认领令牌只能落在草稿首段（`dsh-client-ui-conversation`） | 行内斜杠判定：光标段含 `/` 且「段前有正文」排除认领令牌 |
| **命名空间绑定** | Settings 命名空间 = Loader 行 id = `dsh-prompt-history` | 插件自身不注册命名空间，由宿主投影配置 |
| **配置插槽匹配** | `plugins.bundle.config` 插槽 key = 完整包名（`plugin-manager`） | 必须以包名注册，且该 slot 渲染时不带 form，需动态注入获取 |
| **配置覆写深比较** | 组合条目配置与新值逐字段深比较，不一致报 `settings/rejected` | `cordis.patch.yml` 必须写全 9 个字段且与 Schema 默认值完全一致 |
| **Volatile 约束** | 仅 `volatile()` 字段投影成表单；非 volatile 写入直接抛错 | 9 个配置项全部声明为 `.volatile()` |

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
| `history-engine.ts` | **核心无头状态机（深模块）**：纯 TypeScript 驱动，存储环 FIFO 裁剪、顺序浏览、800ms 双击 Esc、IME 组字态避让与前导空格隐私过滤。脱机零 DOM 依赖。 |
| `history-overlay.ts` | **浮层渲染控制器（深模块）**：`HistoryOverlayController`，封装 DOM 骨架构建、高亮切片（`splitHighlighted`）、视口避让定位（`calculatePanelTop`）与宽屏预览截断。 |
| `InputHistory.tsx` | **交互协调器（Coordinator）**：主组件仅保留状态订阅，将捕获期 DOM 事件委派给 3 个专属正交 Hooks（`useSelectionCopyToolbar`、`useRightClickPaste`、`usePromptHistoryHotkeys`）。零运行时开销。 |
| `prefs.ts` | **配置领域模型与自愈中心（单一真源）**：快照 Store 发布、数据规范化、健康诊断（`analyzeConfigHealth`）与损坏自愈提取（`extractValidConfig`、`generateHealingOps`）。 |
| `card-controller.ts` | **UI 插槽控制器**：`SettingsCardController`，连接宿主 `ConfigForm` 与组件，维护 `generation` 代际计数栅栏（抑制并发乱序与卸载迟到回执），操作即写。 |
| `SettingsCard.tsx` | **自绘配置组件**：划分四大功能区（复制剪贴板、历史手势、历史搜索、健康维护），原生主题 Token（`--dsw-*`）自绘单选面板与官方 `Switch`，支持一键自愈。 |
| `editor.ts` | **DOM 编辑器适配器（真实缝隙）**：兼顾 `textarea` 与 Lexical `contenteditable`，精准判定段落 `<p>` 与软换行 `<br>` 视觉行首末行，杜绝多行误吞。 |
| `claim-guard.ts` | **纯函数守卫**：`hasInlineSlash`，判定光标处于段前有正文的行内斜杠。 |
| `nodes.ts` | **AST 容差解析器**：抹平 DSH 多代会话消息节点结构差异（0.1.1 / 0.1.2 rc / 2.0.x）。 |
| `index.ts` | **客户端装配入口**：插槽注册、配置卡注入与 `inputTriggers` 猴补（通过 `ctx.effect` + `ORIG_TRACK` Symbol + `WeakRef` 实现 100% 可逆生命周期）。 |

---

## 交互语义标准

1. **方向键浏览（Claude Code 规范）**：
   - **↑**：光标在第一行时接管，从最新一条逐条往回浏览；到底不环绕；回填时光标停在行首。
   - **↓**：处于浏览状态且光标在最后一行时接管，往更新方向步进；回填时光标停在行尾；到底时还原最初编辑草稿。
   - 浏览期间用户手动修改草稿，立刻脱离并丢弃当前浏览上下文。
2. **双击 Esc**：
   - **非空草稿**：第一次按下提示「再按一次 Esc 清空」并透传给宿主；800 ms 内第二次按下将草稿存入历史后清空。
   - **空草稿**：双击直接唤起历史搜索面板；Esc 还原初始状态并关闭面板。
3. **行内斜杠技能补全**：
   - 当草稿已有前导认领命令（如 `/plan `）且光标处于后续参数中的行内斜杠时，临时将守卫降级为 `plain` 释放宿主补全管线，不影响前导令牌与 URL 边界。
4. **建议菜单让位**：
   - 宿主建议菜单处于打开状态（`[role="listbox"], [data-trigger-menu]`）时，方向键完全让位宿主菜单；本插件面板展开时绕过该让位防死锁。

---

## 工程规范与门禁清单

### 门禁执行序列
```sh
node node_modules/typescript/bin/tsc --noEmit             # 1. 静态类型检查 (0 错误)
node --experimental-strip-types --test test/*.test.ts     # 2. 68 项纯 Node 原生单测全绿 (~500ms)
pnpm build                                                # 3. 两步构建: tsc 声明到 lib/types + tsdown 打包
npm pack --dry-run --json                                # 4. 产物完整性与文件白名单校验
```

### 构建与打包规范
- **CJS Bundle 标识**：`tsdown.config.ts` 的 `ID` 必须严格等于包名 `@wenaixi/dsh-prompt-history`，否则客户端无法激活。
- **发布白名单**：`package.json` 的 `files` 必须包含双语 README、CHANGELOG、LICENSE、`lib/` 与 `locale/`。
- **孤儿声明防范**：删除源码文件后必须同步清理 `lib/types/` 下对应的旧 `.d.ts` 与 `.d.ts.map`。

---

## 发布与双真源验证流程

1. **版本与文档同步**：更新 `CHANGELOG.md`、`package.json` 版本号，确认双语 README 保持面向用户且无写死版本号；
2. **本地全量门禁**：通过上述门禁清单全项校验；
3. **版本提交与打标**：`git commit` → `git tag -a vX.Y.Z -m "release: vX.Y.Z ..."`；
4. **双向推送**：`git push origin main` → `git push origin vX.Y.Z`，触发 GitHub Actions 自动化流水线；
5. **双真源校验闭环**：
   - 检查 GitHub Release：`gh release view vX.Y.Z`（验证产物生成与 release 说明）；
   - 检查官方 npm Registry：`npm view @wenaixi/dsh-prompt-history dist-tags.latest --registry=https://registry.npmjs.org`（直连官方源防镜像假阴性）。

---

## 不做的事（边界约束）

- 不自建任何私有 HTTP 后端，所有配置数据完全依托宿主 Settings 通路；
- 不引入外部运行时第三方库（保持零依赖，CJS Bundle gzip 控制在 ~31 KB）；
- 不侵入宿主日常 profile，不对未修改配置实施强制改写；
- 非必要说明文档（如 README 正文）坚决不出现硬编码的历史版本标签与临时数值。

---

## 核心决策记录

- **2026-10-10 架构深度演进与质量重构 (v2.4.0)**：
  1. 落地 100% 可逆生命周期：样式节点注入与插槽监听自动注销，`inputTriggers` 猴补引入 `ORIG_TRACK` Symbol 与 `WeakRef` 追踪集合，卸载时全面深度还原各活跃会话原方法；
  2. 抽象 `HistoryOverlayController` 深模块（`history-overlay.ts`），封装 DOM 骨架与视口定位，消灭 5 个模块级全局指针，纯切片算法离线可测；
  3. 新增 `test/history-overlay.test.ts` 12 项单测，纯 Node 单测套件扩充至 **68 项全绿**；
  4. 重构 `InputHistory.tsx` 为 Coordinator 模式，正交解耦为 3 个专注自定义 Hooks，消除发散式变化坏味道；
  5. 落地配置自愈容灾系统（`analyzeConfigHealth`、`extractValidConfig`、`generateHealingOps`）与前导空格隐私过滤（`ignoreLeadingSpace`）。
- **2026-10-06 认领态行内斜杠智能补全 (v2.2.2)**：定位 `claimed` 压制，注入 `inputTriggers` 并在行内斜杠处放宽守卫，判定收敛为 `claim-guard.ts` 纯函数。
- **2026-10-06 Claude Code 交互体验复刻与操作即写设置卡**：建立上下键顺序回溯、800ms 双击 Esc 判定、宽屏预览与自绘设置卡写即生效机制。

# 项目规范与核心记忆

## 项目定位

- 包名：dsh-prompt-history。
- 功能：为 DSH 的对话输入框提供终端式交互：上下键提问历史（前缀搜索、Ctrl+R 反向搜索）、选中文本后的复制或引用、右键粘贴。
- 插件形态：Host 半侧只声明配置 schema，浏览器半侧交付全部交互与配置卡。
- 当前主分支：main；只做本地提交，不自动 push。

## 配置数据通路（唯一真源是宿主）

- 唯一入口：插件管理页点击本插件后的详情页配置区，slot 为 `plugins.bundle.config`，注册键等于包名。
- 该 slot 渲染时不带 `form`（对比：`plugins.item` 与 `plugins.row.config` 会带）。因此表单必须由注册方通过 `ctx.inject(['configForms'])` 取得 `configForms.get(NS)`，再经 slot 的 `inject` 面交给组件。
- 写入链路：组件 form.set/mutate → client ConfigFormController → remote.settings → 宿主 SettingsController → dsh-settings → config-editor → profile 的 cordis.patch.yml。插件不提供任何 HTTP 端点。
- 命名空间等于 Loader 条目 id（dsh-settings 取 entry.options.id），即 `dsh-prompt-history`；插件不需要注册命名空间。
- `configForms` 是可选服务，必须用 `ctx.inject` 动态获取，并包在 `whileServed([NS], ...)` 里：宿主没提供命名空间时页面里不出现空配置区。
- Host 半侧必须 `ctx.inject(['settings'], ...)` 调 `settings.configure({ auto: false }, ctx.fiber)`，否则宿主自生成页面导致入口出现两份。

## 硬约束：cordis.patch.yml 的 config

- 五个字段必须在 patch 里写全，且与 `src/index.ts` 的 schema 默认值逐字段一致。
- 原因：config-editor 写入前把「组合后的条目配置」与「用户提交的新值」做深比较，不一致即判定被更高层覆盖并返回 `settings/rejected`。
- 少写字段同样被拒：用户第一次改动的正是缺失那项，组合结果与提交值必然不同。实测「不写 config」与「只写 insert 行」两种形态都写入失败。

## 当前配置字段与默认值

| 字段 | 取值 | 默认 | 作用 |
|---|---|---|---|
| copyMode | off / toolbar / auto | toolbar | 选中文本后：什么都不做 / 弹出工具栏 / 立即复制 |
| rightClickPaste | bool | true | 输入框上右键直接粘贴 |
| historyEnabled | bool | true | 关闭后 ↑/↓、Ctrl+R 与双击 Esc 全部交还宿主 |
| historyGesture | ctrlR / esc / both | both | 打开历史列表的手势 |
| globalHistory | bool | false | 上下键历史跨会话保留，上限 200 条 |

- 全部字段标记 `volatile()`：Settings 只把 volatile 字段投影成表单。
- 旧 `copyOnSelect` 仍兼容：true → auto，false → toolbar；`copyMode=off` 是新增合法值，不再被规范化掉。

## 客户端数据面

- `prefs-model.ts`：纯函数与常量，含 DEFAULT_PREFS、normalizePrefs、parseLegacyPrefs、prefsOps、planLegacyMigration。无 DOM、无 cordis。
- `prefs.ts`：宿主表单快照的投影，订阅后发布给功能组件；表单未就绪时返回默认值，绝不读旧 localStorage。
- 一次性迁移判据是宿主 `user` 层：空（含空对象）表示从未被写过，此时才提交旧 localStorage，提交成功后删除旧载荷，不需要额外标志键。
- 配置卡组件只收 slot props 与 inject 注入的表单，不接触 ctx。
- 订阅表单快照必须用箭头函数包一层：把 `form.getSnapshot` 直接交给 useSyncExternalStore 会丢 this，表单内部读 this.store 抛 TypeError，配置区整块渲染失败。

## 设置界面规范（官方 SettingsForm 体系）

- 外壳是官方 `SettingsForm`（primitives）：不可用提示、只读横幅、保存失败提示、Save/Saving 按钮、离开即丢弃草稿全部由它承担。
- 保存语义是 staged 草稿 + 一次保存：编辑只改草稿，Save 才一次 mutate 写宿主；不再逐项即时写。
- 模型走自写 `SettingsCardController`（card-controller.ts），仿官方 settings-subagent：官方 `SettingsFormModel` 只服务文本/数字字段，开关/单选不进它。
- 控制器用快照 `revision` 做冲突栅栏：草稿期间文档被别处改动且草稿未过期 → 冲突标记（invalid 禁用 Save）；保存回读逐字段比对确认落盘；代际计数抑制卸载后的迟到回执。
- 一行标题 + 一行说明 + 右侧控件；说明承载细节，长句不塞进控件标签。
- 单选用「可点面板块 + role=radio」，不用 SegmentedControl：说明文字要跟着每个选项走。
- 开关用宿主 `Switch`；行之间只用 0.5px 分隔线，不套第二层卡片。
- 颜色、圆角、间距一律走 `--dsw-*` token，浅色深色自动跟随。
- 不可关闭的能力用「说明行 + 徽标」呈现，不画一个永远不动的开关。
- 文案 zh/en 键集合由 `Record<keyof typeof zh, string>` 强制对齐。
- `plugins.bundle.config` 的插槽 key 必须等于包名 `@wenaixi/dsh-prompt-history`（plugin-manager 用 `entry.options.key` 与 `pkg.name` 比对决定是否渲染配置区）；Settings 命名空间则是 Loader 行 id `dsh-prompt-history`，两者不是一回事。

## 插件描述本地化

- `locale/en.json` 与 `locale/zh.json`，形状为 `{ "meta": { "title": ..., "description": ... } }`。
- 键名就是 `title` / `description`，不要写成 `meta.title`（写成后者会被判空丢弃，页面回落英文）。
- `package.json` 需要 `exports["./locale/*"]` 与 `files["locale/*.json"]`。
- 宿主读取逻辑：dsh-app-boot readPluginMeta → dictionariesOf 扫 locale 目录里所有 json → resolveText 按 fallbackChain 取值。

## 行 id 与包名相同时，组件列表会重复一行模块名

- 现象：插件详情页「包含的组件」里，标题下面出现两行一模一样的包名（如 dsh-prompt-history）。
- 根因（宿主行为，非插件 bug）：RowsSection 渲染 `title === row.rowId ? null : <code>{row.rowId}</code>`
  与 `title === row.moduleName ? null : <code>{row.moduleName}</code>`（app.asar 442245 / 442249）。
  去重只在 title 与 rowId/moduleName 之一相等时生效。title 来自 locale meta.title（「终端式输入」），
  与二者都不相等，于是两个 code 节点都渲染。id 与 name 相同的行必然重复；id 与 name 不同的行只出现一次。
- 因此 bundle patch 的行 id 不要与包名相同。已安装用户改 id 会换掉 Settings 命名空间（命名空间 = entry.options.id），
  profile 里已写入的 config 行会变成未知 id 而失效，属于破坏性迁移；除非主人明确要求，否则不改 id。
- 对照：desktop profile 的 `dsh-context`（id 与 name 相同）同样重复，`better-sidebar`（id 与 name 不同）不重复。

## 实现与验证规范

- 改动前先核对本机 DSH 0.2.0-rc.2 的真实类型声明与实现，不凭记忆猜 API。
- 纯函数行为由 `node --experimental-strip-types --test test/*.test.ts` 覆盖（prefs-model 13 项、history-model 7 项）。
- 类型检查：`node node_modules/typescript/bin/tsc --noEmit`；构建：`tsc -p tsconfig.build.json && tsdown`，两步都要跑，只跑 tsc 会漏掉声明产物。
- `pnpm install` 会触发 `prepare`（即 `pnpm build`）。若 typescript 报 `TS7006: Parameter 's' implicitly has an 'any' type`，说明 `@deepseek-ai/dsh-client-store` 没装——它是 `dsh-client-ui-conversation` 的传递依赖但不在本仓库依赖树里，`useInput` 的 `SnapshotSelectorHook<InputState>` 来自它。装完记得 `git checkout -- package.json`（pnpm 会顺手重排依赖顺序）。
- 浏览器验收用隔离 profile `prompt-history-e2e-v3`（bundles: dsh-base + dsh-web-app + dsh-prompt-history），命令 `dsh --profile prompt-history-e2e-v3 --port <port> --no-open`。
- **新建 profile 的正确做法**：写好 `package.json` / `cordis.yml` / `cordis.patch.yml` 后，不要跑 `pnpm install`。宿主用 dsh 自己的解析器读 peer 依赖，`pnpm install` 装出的 `.modules.yaml` 会让它报「Unexpected end of JSON input」并让 72 个插件全部 import 失败。正确做法是手工建目录联接：`node_modules\dsh-prompt-history` -> 仓库根（`New-Item -ItemType Junction`），node_modules 里只放这一个条目。
- 全新 profile 首次打开会弹「预览版说明」模态，遮住整个页面；Playwright 脚本要先点掉 `[role=dialog] button` 里的「继续」再继续操作。
- 本机 Playwright 没有 chromium，需要 `executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe'`。
- 每次写操作后必须回读 `POST /api/settings/describe` 的真值并核对 profile 的 cordis.patch.yml，不能只看 DOM 或控件变色。
- 禁用插件用 `--patch ./disabled.yml`（`- id: dsh-prompt-history` + `disabled: true`）验证：配置卡消失、命名空间从 describe 消失。

## 不做的事

- 不自建 HTTP 端点、不新增第三方依赖。
- 手势仅限 Ctrl+R 与双击 Esc 两个入口，不引入新依赖。
- 不为旧 DSH 版本保留兼容层。
- 不 push、不发布、不改用户日常 profile。

## 历史交互的业界规格（2026-10-05 调研）

- Claude Code 的双击 Esc 是 rewind 回滚菜单，不是历史列表；且在 keybindings.json 里无法重绑定或关闭（issue 43717）。
- Claude Code 的输入历史列表在 fullscreen 渲染下挂在 Ctrl+R：输入过滤、↑↓ 移动、Ctrl+S 切范围（本会话 / 本项目 / 所有项目）、Enter 或 Tab 接受、Esc 取消；最新优先、重复折叠、命中词高亮。
- 还原源码可读位置（Rito-w/ClaudeCode）：src/history.ts（MAX_HISTORY_ITEMS = 100）、src/components/MessageSelector.tsx（MAX_VISIBLE_MESSAGES = 7）、src/keybindings/defaultBindings.ts、src/keybindings/KeybindingProviderSetup.tsx（CHORD_TIMEOUT_MS = 1000）。
- 双击手势的时间窗参考：Claude Code 800 ms（第一次透传、第二次消费）、pi 扩展 500 ms（第三方类比）、Codex 无时间窗。
- fzf 的 Ctrl-R 调历史、Ctrl-T 调文件，是两个键对应两个数据集；再按 Ctrl-R 只切换排序方式，不是切全量列表。
- 浏览器冲突：中文输入法组字中的 Esc 必须让给 IME（检查 isComposing / keyCode 229）；Esc 已有两个消费者（复制工具栏、反向搜索放弃），新增浮层必须做优先级仲裁。
- 宿主 0.2.0-rc.2 的 Menu **不能用于历史列表**：它的方向键行走先把焦点搬进列表（`lib/index.js:4096-4112` 调 `buttons[next].focus()`，且要求 `anchored`），与「焦点留输入框 + 打字过滤」互斥。因此浮层手写，沿用 `feedback.ts` 的 fixed + body portal 模式。
- Claude Code 双击 Esc 的真实常数为 `DOUBLE_PRESS_TIMEOUT_MS = 800`（`src/hooks/useDoublePress.ts`）；pi 的 500 ms 是第三方类比，Codex 干脆没有时间窗（issue 26348）。

## 历史列表选择器（已实现）

- 入口：Ctrl+R；或输入框为空时 800 ms 内双击 Esc（`historyGesture` 控制）。
- 焦点留在输入框：打字过滤、↑↓/Home/End 移动高亮、Enter/Tab 回填、Esc 还原草稿。
- **查询词取自草稿而非逐键累加**：中文输入法 composition 期间浏览器不发 keydown，攒按键永远攒不到汉字。草稿 effect 里比对 `origin` 与 `seen` 推导 query。
- 面板已开时**不让位给建议菜单**：`OPEN_MENU` 检查要跳过，否则取消面板还原出的 `/` 或 `@` 开头草稿会弹出建议菜单，面板再也关不掉。
- 关闭态的第一次 Esc 只记 `performance.now()` 时间戳并放行，第二次才消费；任何其他键清零。
- 卸载 cleanup 里 `closePicker()`，避免切换会话或热重载后 body 上留孤儿节点。

## 键位速查（供文案与用户答疑）

- ↑：输入框为空时调出最近一条提问；先打字再按 ↑，只在以这串字开头的历史里往回找（bash 的 history-search-backward）；连按 ↑ 继续往更早的匹配走。
- ↓：往更新的方向走；走到最底恢复开始浏览前的那行输入。浏览期间手工编辑会丢弃召回的那行，回到实时草稿。
- Ctrl+R：打开历史列表（最新在前，重复只留最新一次）。焦点留在输入框，打字按「包含」过滤并高亮命中词；↑↓/Home/End 只移动高亮不改草稿；Enter 或 Tab 回填；Esc 还原打开前的草稿；再按一次 Ctrl+R 切换关闭。
- 双击 Esc：输入框为空时 800 ms 内连按两次 Esc 打开同一个列表；第一次 Esc 照常透传给宿主（能关掉工具栏等），任何其他键取消这次待定。可在设置里关掉或改成只用 Ctrl+R。
- 右键：输入框内直接粘贴，不弹浏览器菜单。
- 选中文本：按 copyMode 决定什么都不做、弹工具栏（复制 / 引用为 > 引用块）、或立即复制。

## 决策记录

- 2026-10-05 移除会话目录（Chat TOC）：删除 `ChatToc.tsx` 与 `sessionCtx.ts`（其自动翻页拉取全部历史的逻辑随目录消失），`tocVisible` 配置字段、设置项、样式、文案、README 段落一并删除。↑/↓ 召回仍只覆盖当前已加载窗口。已装用户若保留旧 patch 的 `tocVisible` 行，设置写入会被宿主以未知键拒绝，升级时需同步删掉该行。

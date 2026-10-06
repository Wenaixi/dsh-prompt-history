# 项目规范与核心记忆

## 项目定位

- 包名：`@wenaixi/dsh-prompt-history`（scoped；npm 与 GitHub 均已发布，latest 见 CHANGELOG）。
- 功能：DSH 对话输入框的终端式交互——上下键提问历史（前缀搜索、Ctrl+R 列表）、选中文本复制或引用、右键粘贴。
- 形态：Host 半侧只声明配置 schema；浏览器半侧交付交互、配置卡与文案。零第三方依赖。
- 仓库：`origin` = Wenaixi/dsh-prompt-history，`upstream` = Xiaofei-fei/dsh-prompt-history（只读上游）。主分支 main。

## 配置数据通路（唯一真源是宿主）

```
配置卡 → SettingsCardController → ConfigForm.mutate(ops, revision)
      → remote.settings → 宿主 SettingsController → dsh-settings
      → config-editor → profile 的 cordis.patch.yml
```

插件不提供任何 HTTP 端点。四条硬约束：

1. **命名空间 = Loader 行 id**（dsh-settings 取 `entry.options.id`），即 `dsh-prompt-history`。插件不注册命名空间。
2. **`plugins.bundle.config` 的插槽 key = 包名**。plugin-manager 用 `entry.options.key` 与 `pkg.name` 比对决定是否渲染配置区；写错则整块不出现且零报错。
3. **该 slot 渲染时不带 `form`**（`plugins.item` / `plugins.row.config` 才带），表单必须由注册方 `ctx.inject(['configForms'])` 取 `configForms.get(NS)`，经 inject 面交给组件。
4. **`configForms` 是可选的**：动态注入 + 包在 `whileServed([NS], ...)` 里，宿主没提供时页面不出现空配置区。Host 半侧必须 `ctx.inject(['settings'], ...)` 调 `settings.configure({ auto: false }, ctx.fiber)`，否则入口出现两份。

### cordis.patch.yml 的 config 必须写全

五个字段全写、且与 `src/index.ts` schema 默认值逐字段一致。原因：config-editor 写入前把「组合后的条目配置」与「用户提交的新值」深比较，不一致即判为被更高层覆盖并返回 `settings/rejected`。少写字段同样被拒——用户第一次改的正是缺失那项。实测「不写 config」与「只写 insert 行」都失败。

## 配置字段（全部 `volatile()`）

| 字段 | 取值 | 默认 | 作用 |
|---|---|---|---|
| copyMode | off / toolbar / auto | toolbar | 选中文本后：不做 / 弹工具栏 / 立即复制 |
| rightClickPaste | bool | true | 输入框右键直接粘贴 |
| historyEnabled | bool | true | 关闭后 ↑/↓、Ctrl+R、双击 Esc 全部交还宿主 |
| historyGesture | ctrlR / esc / both | both | 打开历史列表的手势 |
| globalHistory | bool | false | 历史跨会话保留，上限 200 条 |

- 只有 volatile 字段会被投影成表单；非 volatile 字段写入抛错，volatile 字段不落盘。
- 旧 `copyOnSelect` 兼容：true → auto，false → toolbar；`copyMode=off` 是合法新值，不被规范化掉。

## 客户端数据面（src/client/）

| 文件 | 职责 |
|---|---|
| `prefs-model.ts` | 纯函数：DEFAULT_PREFS、normalizePrefs、parseLegacyPrefs、prefsOps、planLegacyMigration、prefsEqual、draftDiffOps。无 DOM 无 cordis |
| `prefs.ts` | 宿主表单快照投影，发布给功能组件；表单未就绪返回默认值，绝不读旧 localStorage |
| `card-controller.ts` | `SettingsCardController`：宿主快照投影成 UI 状态、操作即写、失败标记、代际计数 |
| `SettingsCard.tsx` | 配置卡组件：自绘外壳（不可用/只读/失败提示）+ 官方 `Switch` + 自绘单选块 |
| `InputHistory.tsx` | 交互主体：历史召回、列表浮层、复制引用、右键粘贴 |
| `history-model.ts` / `nodes.ts` / `editor.ts` / `feedback.ts` / `i18n.ts` | 纯模型 / 节点读取 / 编辑器访问 / 浮层 / 非 React 取词 |

- 一次性迁移判据是宿主 `user` 层：空（含空对象）表示从未写过，此时才提交旧 localStorage，成功后删除旧载荷，不需要标志键。
- 订阅表单快照必须用箭头函数包一层：`form.getSnapshot` 直接交给 useSyncExternalStore 会丢 this，表单内读 `this.store` 抛 TypeError，配置区整块渲染失败。

## 设置界面规范（自绘外壳 + 操作即写）

- **外壳自绘**：不可用提示、只读横幅、保存失败提示都由 `SettingsCard.tsx` 自己渲染（官方 `SettingsForm` 是 staged 草稿体系，已不再使用）。
- **保存语义 = 写即生效**：开关、单选、恢复默认都立即走 `ConfigForm.mutate` 写宿主，没有保存按钮、没有草稿；连点由宿主写入队列串行 + revision 栅栏，写被拒时宿主 `recover` 重读、UI 自动回落到真值。
- **模型走自写 `SettingsCardController`**：把宿主快照投影成 `PrefsCardSnapshot`（available/writable/failed/migrated/values），代际计数抑制卸载后的迟到回执。
- 布局：一行标题 + 一行说明 + 右侧控件；行间只用 0.5px 分隔线；不套第二层卡片。
- 单选用「可点面板块 + `role=radio`」而非 SegmentedControl——说明文字要跟着每个选项走。
- 开关用官方 `Switch`（`label` 必填）；颜色圆角间距一律 `--dsw-*` token，浅深色自动跟随。
- 不可关闭的能力用「说明行 + 徽标」呈现，不画永远不动的开关。
- 文案 zh/en 由 `Record<keyof typeof zh, string>` 强制对齐。

## 插件元数据与本地化

- `locale/{zh,en}.json` 形状为 `{ "meta": { "title", "description" } }`；键名就是 `title` / `description`，写成 `meta.title` 会被判空丢弃、页面回落英文。
- `package.json` 需要 `exports["./locale/*"]` 与 `files` 里的 `locale/*.json`。
- 宿主链路：dsh-app-boot `readPluginMeta` → 扫 locale 目录所有 json → `resolveText` 按 fallbackChain 取值。
- 插件详情页「包含的组件」重复显示包名是**宿主行为**：RowsSection 的去重只在 title 等于 rowId 或 moduleName 时生效，而 title 来自 locale meta.title，于是 id 与 name 相同的行必然重复。对照：`dsh-context`（id=name）重复，`better-sidebar`（id≠name）不重复。
- **因此不要改行 id**：命名空间 = `entry.options.id`，改 id 会让已装用户 profile 里写好的 config 行变成未知 id 而失效，是破坏性迁移。

## 构建与产物

- `pnpm build` = `tsc -p tsconfig.build.json`（声明产物到 lib/types）+ `tsdown`（`lib/index.js`、`lib/invariant.js`、`lib/client.js`）。**两步都要跑**，只跑 tsc 会漏掉 JS 产物。
- **tsdown 的 `ID` 必须等于包名**。client-modules 按 Loader 行的模块说明符解析条目 id，产物注册 id 不一致时报 `loaded without registering`，整条 client bundle 无法激活（2.0.1 就栽在这里，客户端从未加载成功过）。
- 客户端产物是 `__ModuleLoader__` CJS factory；external 只列 react 与官方 `@deepseek-ai/*` peer 包。
- `pnpm install` 会触发 `prepare`（=`pnpm build`）。若报 `TS7006 ... implicitly has an 'any' type`，是 `@deepseek-ai/dsh-client-store` 没装（`useInput` 的 `SnapshotSelectorHook` 来自它），装完记得 `git checkout -- package.json`（pnpm 会重排依赖顺序）。

## 验收规范

### 隔离 profile

- profile：`prompt-history-e2e-v3`（bundles: dsh-base + dsh-web-app + 本插件），启动 `dsh --profile prompt-history-e2e-v3 --port <port> --no-open`。
- **`node_modules/@wenaixi/dsh-prompt-history` 必须是 junction 且指向仓库根**。指向 pnpm 实体时会读到旧产物快照，改了代码也不生效——这是本轮排查最久的一个坑。
- **不要跑 `pnpm install`**：宿主用自己的解析器读 peer 依赖，pnpm 装的 `.modules.yaml` 会让它报「Unexpected end of JSON input」并让全部插件 import 失败。手工建 junction，node_modules 里只放这一个条目。
- 首次打开会弹「预览版说明」模态遮住页面；脚本先点掉 `[role=dialog] button`。

### 浏览器与真值

- 本机 Playwright 无 chromium，用 `executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe'`。
- 系统语言为中文时 body 文本会是乱码（编码），断言请用 DOM 属性与 API 回读，不要用文本匹配。
- 配置真值只能回读 `POST /api/settings/describe` + profile 的 `cordis.patch.yml`，不能只看 DOM 或控件变色。RPC 报文形态：`{type:'client-request', rpcId, method:'settings/describe', payload:{args:{}}}`，先访问 `/?token=<token>` 拿 `dsh-auth-*` cookie 再带 cookie 请求。
- 禁用插件用 `--patch <abs path>/disabled.yml`（`- id: dsh-prompt-history` + `disabled: true`）验证：卡片、配置区、命名空间三者同时消失。**`--patch` 是 dsh 外层参数**，不是 web 子命令参数。

### 门禁清单

```sh
node node_modules/typescript/bin/tsc --noEmit            # 类型
node --experimental-strip-types --test test/*.test.ts    # 23 项纯函数测试
pnpm build                                               # 两步构建
npm pack --dry-run                                       # 产物清单核对
```

## 发布流程

1. 更新 `CHANGELOG.md` 与四语言 README；bump `package.json` 版本。
2. 跑完「门禁清单」+ 隔离实例浏览器验收。
3. `git commit` → `git tag -a vX.Y.Z -m "..."` → `git push origin main` → `git push origin vX.Y.Z`。
4. CI（push main）与 Release（push tag）自动触发；Release job 执行 `pnpm publish` + `gh release create`。
5. **双真源验证**（间隔约 20 s 等 registry 传播）：
   - `fetch('https://registry.npmjs.org/@wenaixi/<pkg>').then(r=>r.json())` 查 `dist-tags.latest` 与新版本存在；
   - `gh release view vX.Y.Z` 查 Release 与资产。
   - 不要只信 `npm view`：镜像 registry 会假阴性。

## 历史交互（2026-10-05 调研，已落地的部分见下节）

- Claude Code 的双击 Esc 是 rewind 回滚菜单而非历史列表，且无法重绑定（issue 43717）；它的历史列表挂在 Ctrl+R（输入过滤、↑↓ 移动、Enter/Tab 接受、Esc 取消、最新优先、重复折叠、命中高亮）。
- 双击时间窗：Claude Code 800 ms（第一次透传、第二次消费）、pi 500 ms（第三方类比）、Codex 无时间窗（issue 26348，不学）。
- 宿主 0.2.0-rc.2 的 `Menu` **不能用于历史列表**：方向键行走先把焦点搬进列表（`lib/index.js:4096-4112` 调 `buttons[next].focus()` 且要求 `anchored`），与「焦点留输入框 + 打字过滤」互斥。浮层手写，沿用 `feedback.ts` 的 fixed + body portal 模式。
- 中文输入法组字中的 Esc 必须让给 IME（`isComposing` / keyCode 229）。

## 历史列表选择器（已实现）

- 入口：Ctrl+R；或输入框为空时 800 ms 内双击 Esc（`historyGesture` 控制）。焦点留在输入框：打字过滤、↑↓/Home/End 移动高亮、Enter/Tab 回填、Esc 还原草稿。
- **查询词取自草稿而非逐键累加**：IME composition 期间浏览器不发 keydown，攒按键永远攒不到汉字。草稿 effect 里比对 `origin` 与 `seen` 推导 query。
- **面板已开时不让位给建议菜单**：`OPEN_MENU` 检查要跳过，否则取消面板还原出的 `/` 或 `@` 开头草稿会弹出建议菜单，面板再也关不掉。
- 关闭态的第一次 Esc 只记 `performance.now()` 时间戳并放行，第二次才消费；其他键清零。
- 卸载 cleanup 里 `closePicker()`，避免切换会话或热重载后 body 留孤儿节点。

## 键位速查

- **↑**：输入框为空时调出最近一条提问；先打字再按 ↑ 只在以这串字开头的历史里往回找（bash `history-search-backward`）。
- **↓**：往更新方向走；到最底恢复开始浏览前那行。浏览期间手工编辑丢弃召回内容，回到实时草稿。
- **Ctrl+R**：打开历史列表（最新在前、重复只留最新）。打字按「包含」过滤并高亮；↑↓/Home/End 只移动高亮；Enter/Tab 回填；Esc 还原；再按一次切换关闭。
- **双击 Esc**：输入框为空时 800 ms 内连按两次打开同一列表；第一次 Esc 照常透传。
- **右键**：输入框内直接粘贴。**选中文本**：按 copyMode 决定不做 / 弹工具栏（复制、引用为 `>` 块）/ 立即复制。

## 不做的事

- 不自建 HTTP 端点、不新增第三方依赖、不为旧 DSH 版本保留兼容层。
- 手势仅 Ctrl+R 与双击 Esc 两个入口。
- 不改用户日常 profile；不强行改行 id（破坏性迁移）。

## 决策记录

- **2026-10-06 去掉保存按钮，设置改动自动保存**：配置卡从「官方 SettingsForm 外壳 + staged 草稿 + 一次保存」改为自绘外壳 + 操作即写（开关/单选/恢复默认点击即 `ConfigForm.mutate`，无草稿无保存按钮）。删除草稿机、冲突栅栏与 `save/saving/conflict/draftHint` 文案键；失败时复用 `settings.saveFailed` 提示，宿主 `recover` 自动回落到真值。连点由宿主写入队列串行处理。
- **2026-10-06 设置界面迁移官方 SettingsForm**：配置卡从「手写外壳 + 逐项即时写」改为官方外壳 + staged 草稿 + 一次保存 + revision 冲突栅栏。顺带修掉两个拦路 bug——tsdown 产物注册 id 与包名不一致（2.0.1 客户端从未加载成功）、插槽 key 未用包名（配置区不渲染）。发布 v2.0.2。（注：该「一次保存」语义在当日稍后被上一条决策撤销，改为自动保存。）
- **2026-10-05 移除会话目录（Chat TOC）**：删除 `ChatToc.tsx` 与 `sessionCtx.ts`，`tocVisible` 字段、设置项、样式、文案、README 段落一并删除。↑/↓ 召回仍只覆盖已加载窗口。已装用户若保留旧 patch 的 `tocVisible` 行，设置写入会被宿主以未知键拒绝，升级时需同步删掉该行。
- **2026-10-05 历史列表选择器落地**：见上文「历史列表选择器」；详细实现计划存于 `docs/history-picker-plan.md`。

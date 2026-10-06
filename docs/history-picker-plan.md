# 输入历史列表选择器：深度实现计划

日期：2026-10-05　仓库：dsh-prompt-history　状态：**已实现**（2026-10-05 完成全部六阶段，隔离 profile prompt-history-e2e-v3 验收通过；2026-10-06 设置界面迁移到官方 SettingsForm 体系后回归通过）

## 目标

在输入框里一键看到**全部历史提问**，可过滤、可上下移动、可回填、可取消还原。Ctrl+R 与双击 Esc 都能打开同一个列表，双击 Esc 默认开启且可在设置里关掉。不新增任何第三方依赖。

## 成功标准（每条都可复现验证）

1. 按 Ctrl+R 打开列表：焦点仍在输入框，立即可见最近若干条历史，底部显示 `N / M 条`。
2. 打开时不预填查询词（已确认移除「记忆查询词」功能），查询词从空开始，输入的每个字符按「包含」过滤。
3. ↑↓ 移动高亮**不改动草稿**；Enter 或 Tab 把高亮条目写进草稿并关闭；Esc 关闭且草稿一字不动。
4. 打开与关闭列表都不改写草稿——关闭后草稿与打开前逐字节相同。
5. 双击 Esc（间隔 ≤ 800 ms）打开同一个列表；已打开时再双击关闭。
6. 中文输入法组字中按 Esc 既不打开列表也不吞掉按键。
7. 长条目单行省略，悬停显示全文。
8. 设置项能关掉双击 Esc，并立即生效。

## 已确认的产品决策

| 决策点 | 选择 |
|---|---|
| 触发键 | Ctrl+R 与双击 Esc 都打开同一个列表 |
| 双击 Esc 默认值 | **默认开**；设置项可改为仅 Ctrl+R / 仅双击 Esc |
| 焦点归属 | 留在输入框 |
| 记忆上次查询词 | 移除 |
| Enter 语义 | 回填并关闭，不发送 |
| 范围 | 一次做完全部阶段，分模块提交 |

## 现状与差距

### 已有（隔离 profile prompt-history-e2e-v3 上实测通过）

- ↑↓ 调历史（带前缀搜索）、Ctrl+R 反向搜索（单行内联浮层 `.dsh-ph-search`）、会话目录（含点击跳转，scrollTop 从 4294 变 332 实测过）、复制或引用、右键粘贴。
- 历史来自会话消息，`historyRef: string[]` 保存，`seenRef: Set<number>` 按 seq 去重。

### 差距

- 反向搜索只有单行提示，命中用 `setDraft` 直接灌进输入框：没有可选列表、没有 ↑↓ 移动、没有「移动但不回填」。
- `hideSearchOverlay()` 只在 sessionId 变化与搜索退出时被调用，**卸载路径上没有 cleanup**，浮层会残留在 body 上。
- Esc 现有四个消费者，全在 document 捕获阶段：反向搜索退出、复制工具栏关闭、会话目录关闭、宿主自己的弹层关闭。
- 反向搜索期间 draft 变化会触发 browse 重置；若列表复用 `browseRef` 表示高亮会自我抹除。

## 关键事实（已查证，附来源）

### 业界规格

- Claude Code 双击 Esc 判定：`src/hooks/useDoublePress.ts` 的 `DOUBLE_PRESS_TIMEOUT_MS = 800`，条件为「距上次 ≤ 800 ms」且「上一次定时器仍在」；不进 keybindings 系统，无法重绑定或关闭（[issue 43717](https://github.com/anthropics/claude-code/issues/43717)）。
- Codex 用 `primed` 布尔状态机且**无任何时间窗**，是 [issue 26348](https://github.com/openai/codex/issues/26348) / 21345 / 34711 的根因，不学。
- fzf：Ctrl-R 调历史、Ctrl-T 调文件；再按 Ctrl-R 是切排序，不是切全量。
- Claude Code Ctrl+R 对话框规格（[官方文档](https://code.claude.com/docs/en/interactive-mode)原文）：输入过滤、↑↓ 移动、Enter/Tab 接受、Esc 取消、最新优先、重复折叠、命中词高亮。

### 宿主能力（0.2.0-rc.2）

- `Menu`：`portal` 每帧重测锚点；`selectedId` + `selection='fill'` 做高亮；`getAnchorRect` 可用编辑器 rect。
- **但 Menu 的方向键行走依赖真实焦点**：`index.js:4096-4112` 的 ArrowUp/Down/Home/End 分支先判断 `anchored = root.contains(activeElement) || insideList`，然后调 `buttons[next].focus()`。焦点留输入框时该分支直接 return。
- `Tooltip`：`portal` + `maxWidth` + `openOnClick`，可显示长条目全文。
- `observeComposition(document)` 返回 `guards(event)`，是 IME 的规范守卫。

### 由此得出的关键设计结论

**宿主 `Menu` 不能用。** 它的方向键行走必须把真实焦点搬进列表，而这与「焦点留输入框」直接冲突——一旦 `autoFocus` 抢走焦点，打字过滤立刻失效。用户已明确选择焦点留输入框，所以走手写浮层路线：沿用 `feedback.ts` 现有模式（fixed + document.body + `--dsw-*` token + 模块级单例），把单行提示扩成可滚动列表。

代价是拿不到 Menu 的模态仲裁（`useModalLayer` / `isBehindModal`），补偿办法是自己实现 Escape 优先级（阶段 4）。

## 交互规格

### 打开

- 触发：Ctrl+R；或双击 Esc（`historyGesture` 允许时）。
- 前置条件（沿用现有早退链）：焦点在编辑器内、无 IME 组字、未进入 adjudicating/submitting、会话未 removed、`historyEnabled` 为真、无建议菜单打开。
- 初始 query 为空；初始高亮 = 最新一条（列表第 1 项）。
- **不改草稿**。

### 过滤

- 输入的每个字符追加到 query，按「包含」匹配。
- Backspace 逐字回退；query 变空时高亮回到第 1 项。
- 无命中：显示「无匹配」，↑↓ 与 Enter 无效，Esc 可关。

### 移动与回填

- ↑↓ / Home / End 只改高亮，**不改草稿**。
- Enter 或 Tab：把高亮条目 `setDraft` 写入，关闭列表，rAF 内 `focusEditor` + `setEditorCaret(host, text.length)`（沿用现有引用插入的写法）。
- Esc：关闭列表，草稿一字不动。

### 关闭

- 外部 pointerdown（落在浮层与编辑器之外）：关闭，草稿不变。
- 会话切换、会话删除、phase 变化、组件卸载：强制关闭并 `hideHistoryPanel()`。

### 双击 Esc

- 判定：`now - lastEscapeAt <= 800 && lastEscapeAt !== 0`，用 `performance.now()`（单调钟，不受系统时钟调整影响）。
- 第一次 Esc：不消费，继续冒泡给既有消费者，只记时间戳。
- 第二次 Esc：`preventDefault` + `stopPropagation`，切换列表开合。
- 任何其他按键清零 `lastEscapeAt`。
- 组字中（`e.isComposing` 或 `e.keyCode === 229`）既不记时间戳也不消费——现有 keydown 第 3 条早退已覆盖，保持不动。

## 文件改动

| 文件 | 改动 |
|---|---|
| `src/client/history-model.ts`（新增） | 纯函数：`matchesOf(history, query)`、`nextIndex(current, step, total)`、`isDoubleEscape(last, now, window)`；无 DOM 无 React |
| `test/history-model.test.ts`（新增） | 上述纯函数的 node --test 覆盖 |
| `src/client/feedback.ts` | 新增 `showHistoryPanel` / `updateHistoryPanel` / `hideHistoryPanel`；保留 `showSearchOverlay` 不删 |
| `src/client/InputHistory.tsx` | `SearchState` 改为列表态；新增双击 Esc 判定；Escape 优先级仲裁；卸载 cleanup |
| `src/client/index.ts` | SETTINGS_CSS 追加 `.dsh-ph-history*` 样式 |
| `src/client/locales.ts` | 新增面板与手势文案键（zh/en 键集合由 `Record<keyof typeof zh, string>` 强制对齐） |
| `src/index.ts` | 新增 `historyGesture` 字段（`ctrlR` / `esc` / `both`），默认 `both`，`.volatile()` |
| `cordis.patch.yml` | **必须同步写全六个字段的默认值**，否则 config-editor 判定被更高层覆盖并返回 `settings/rejected` |
| `src/client/prefs-model.ts` | `PluginPrefs` 加 `historyGesture`；`DEFAULT_PREFS`、`FIELDS`、`normalizePrefs`、`parseLegacyPrefs` 同步 |
| `src/client/SettingsCard.tsx` | 「输入历史」分组加一行三选（用 `ChoiceRow`，不用 SegmentedControl，因为每项要带说明） |
| `test/prefs-model.test.ts` | 补 `historyGesture` 的规范化与迁移用例 |
| `README.md` | 更新第 3 条（Ctrl+R 反向搜索）与第 84 行附近的手势说明 |

## 实施阶段

### 阶段 1：纯模型与测试

- 新增 `history-model.ts`：`matchesOf`（最新优先、重复折叠为最新、空 query 返回全部）、`nextIndex`（环绕）、`isDoubleEscape`（边界 799/800/801）。
- 新增 `test/history-model.test.ts`；同步补 `test/prefs-model.test.ts` 的 `historyGesture` 用例。
- 验证：`node --experimental-strip-types --test test/*.test.ts` 全绿（现有 12 项 + 新增）。

### 阶段 2：列表浮层

- `feedback.ts` 实现 `showHistoryPanel`：`role="listbox"` 容器 + 每行 `role="option"` + `aria-selected` + `aria-activedescendant`；底部提示行。
- 定位量 `[data-composer-card]` 的 rect，贴在输入框上方，与现有搜索浮层同位置；视口内夹取。
- 长条目单行省略；`max-height` 限制 + 内部滚动。
- 验证：隔离实例截图，浅色与深色各一张，确认颜色与圆角跟随宿主 token。

### 阶段 3：接线与键盘

- `SearchState` 从 `{ preSearch, query, matchIndex }` 改为 `{ open, query, highlight }`，highlight 是命中数组下标。
- Ctrl+R 打开；打开时不再 `setDraft`；已打开时 Ctrl+R 切换关闭。
- ↑↓/Home/End 只改 highlight；Enter/Tab 回填并关闭；Esc 关闭不改草稿。
- **不复用 `browseRef`**：列表高亮是独立 ref，避免 draft 变化 effect 把它抹掉。
- 验证：隔离实例逐键回放，每次按键后回读草稿文本、`aria-selected` 位置与面板内选项数。

### 阶段 4：滚动、Escape 仲裁与卸载清理

- `updateHistoryPanel` 里把高亮项 `scrollIntoView({ block: 'nearest' })`。
- Escape 优先级：面板打开时面板无条件先消费（`preventDefault` + `stopPropagation`）；面板未开时走现有逻辑。
- 卸载 cleanup 里同时调 `hideHistoryPanel()` 与 `hideSearchOverlay()`（后者是现存缺陷，本次顺手修掉）。
- sessionId 变化、removed、phase 进入 adjudicating/submitting 时强制关闭。
- 验证：打开列表 → 切换会话 → 断言 `document.querySelectorAll('.dsh-ph-history').length === 0`。

### 阶段 5：双击 Esc 与设置项

- 六个字段同步落地：`prefs-model.ts` → `src/index.ts` schema → `cordis.patch.yml` 三处默认值必须一致。
- keydown 加双击判定：`historyGesture !== 'ctrlR'` 时启用，且要求输入框为空、无浮层打开、非搜索中。
- SettingsCard 加三选：仅 Ctrl+R（`ctrlR`）/ 仅双击 Esc（`esc`）/ 两者都要（`both`，默认）。
- 验证：改为 `ctrlR` 后双击 Esc 不响应；改回 `both` 后生效；每次都回读 `POST /api/settings/describe` 与 profile 的 `cordis.patch.yml` 确认落盘。

### 阶段 6：收口验收

- `node node_modules/typescript/bin/tsc --noEmit` 与 `node node_modules/typescript/bin/tsc -p tsconfig.build.json && node node_modules/tsdown/dist/run.mjs` 两步都要跑。
- `node --experimental-strip-types --test test/*.test.ts` 全绿。
- 隔离实例七态回放：冷启动 → 打开列表 → 输入过滤 → 移动高亮 → Enter 回填 → Esc 取消（草稿不变）→ 双击 Esc → 改设置 → 刷新持久化；逐项截图并回读宿主真值。
- `git diff --check` 干净；本地提交，不 push。

## 边界与失败处理

| 情况 | 行为 |
|---|---|
| 历史为空 | Ctrl+R 与双击 Esc 都不打开，无视觉变化 |
| 过滤无命中 | 显示「无匹配」，↑↓ 与 Enter 无效，Esc 可关 |
| 面板打开时会话被删 | 强制关闭并清 highlight |
| IME 组字中按 Esc | 完全交给输入法，不记时间戳不消费 |
| `historyEnabled=false` | Ctrl+R 与双击 Esc 都不响应，键位交还宿主 |
| `historyGesture=ctrlR` | 双击 Esc 完全不响应 |
| localStorage 不可写 | 跨会话记忆静默失效，不影响本次会话历史 |

## 明确不做

- 不引第三方依赖；不自绘 Menu 的模态仲裁，改为自己实现 Escape 优先级。
- 不把当前提问做成虚拟末项（那是 rewind 的语义，不是输入历史的语义）。
- 不做虚拟滚动：条目数由会话窗口决定，先用 CSS 滚动兜住。
- 不做跨项目/跨会话的历史（宿主没有这个数据源）。
- 不实现「有文本时双击 Esc 清空并入历史」（Claude Code 有，我们没有清空草稿的需求）。
- 不改 ↑↓ 前缀搜索的现有语义。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|
| 面板与宿主弹层抢 Esc | 关面板时误关别的层 | 面板打开时无条件 `stopPropagation`；阶段 4 逐个 Esc 消费者回归 |
| 浮层残留 | 切换会话后有孤儿节点 | 阶段 4 强制 cleanup，用 DOM 计数断言 |
| 新增配置字段导致写入被拒 | 设置存不进去 | `cordis.patch.yml` 与 schema 默认值同步写全，阶段 5 回读落盘 |
| 面板遮挡输入框或超出视口 | 视觉错位 | 量 composer rect 并做视口夹取；阶段 2 截图核对 |
| 手写列表无障碍不足 | 读屏不可用 | `role=listbox` + `role=option` + `aria-selected` + `aria-activedescendant` |
| **双击 Esc 误触**（vi-mode 用户连按 Esc 回 Normal 会误开） | 打断输入习惯 | 设置项可一键关掉；这是 Claude Code 硬编码导致的老问题（issue 43717），我们至少提供退路 |

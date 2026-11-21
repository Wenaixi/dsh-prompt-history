# 宿主版本兼容性（Compatibility）

## 一、本插件依赖的宿主契约

| 契约 | 由谁提供 | 用途 | 风险 |
| --- | --- | --- | --- |
| `ctx.slots.inject('conversation.input.right')` | `@deepseek-ai/dsh-client-ui-renderer` | 输入框右侧的历史入口 | 槽名是字符串常量，宿主改名即消失 |
| `ctx.configForms.whileServed([ns])` | `@deepseek-ai/dsh-client-ui-settings` | 设置卡片的存活判定 | 命名空间名必须与 `cordis.patch.yml` 的 `id` 一致 |
| `inputTriggers.sessionOf` 方法替换 | `@deepseek-ai/dsh-client-ui-input-trigger` | 放宽认领态的行内斜杠拦截 | **唯一改写宿主实例方法的地方**，见第二节 |
| `InputState.draft`（= `clipboardText`） | `@deepseek-ai/dsh-client-ui-conversation` | 取草稿全文 | chip 已展开为剪贴板投影，**不要再二次拼接** |
| `[data-composer-card]` DOM 属性 | 同上 | 定位输入框容器 | 取不到时软降级（返回 null），不报错 |

### 单复数与命名对齐

- cordis 层真 inject 只有 `['slots', 'locale']`；`configForms` 与 `inputTriggers` 走
  `ctx.inject([...])` 软等待（服务缺失时优雅降级，而不是整个插件不激活）。
- `package.json` 的 `dsh.client.inject` 里列了 8 个包，那是**浏览器模块图的排序提示**，
  不产生图边、也不要求包存在（`dsh-client-modules` 的 `parseDshClient` 只校验它是
  字符串数组）。真正的 import 只有 `react` 与 `dsh-client-ui-primitives`。

## 二、`sessionOf` 方法替换（本插件唯一的逆向依赖）

```ts
service.sessionOf = (scope) => {
  const controller = resolve.call(service, scope)
  // 给 controller 的 track 包一层：认领态 + 行内斜杠 → 降级为 plain
  controller.track = (draft, caret, guard, draftRev) => { ... }
  return controller
}
```

**为什么必须持有 disposer**：卸载时若不还原，宿主会留下被改写的实例方法。
当前实现用 `ctx.effect` 包裹，清理函数里同时做三件事：

1. `active = false`（让包装里的降级逻辑立刻失效）
2. `service.sessionOf = resolve`（还原宿主方法）
3. 遍历 `live`（`Set<WeakRef<controller>>`）逐个还原 `track` 并删掉 `ORIG_TRACK` 符号

**幂等靠全局符号**：`Symbol.for('dsh.ph.origTrack')`。同一 controller 被包第二次时
看到符号已存在就跳过，避免双重包装。

**宿主重构会怎样**：`sessionOf` 若被改成箭头函数类字段、或被 `#private` 化，
替换会静默失效——退回裸宿主行为（认领态的行内斜杠补全消失），**不报错**。
这正是本插件需要隔离实例验收的原因：Node 侧的真实 Context 测不到浏览器侧
的 `slots` 与 `inputTriggers`。

## 三、草稿的 chip 语义（踩过的坑）

宿主有两套 chip 属性，语义不同：

| 属性 | 含义 | 出处 |
| --- | --- | --- |
| `data-composer-chip` | **引用来源名**（`insert.source`，如 `reference`） | `chip-node.tsx` |
| `data-composer-command` | 斜杠命令名（`__claim.name`） | `command-chip-node.tsx` |

同时 `InputState.draft` 发布的是 `clipboardText`，官方注释明确
「chips expand to their clipboard projection」——**命令原型已经在里面了**。

所以从 DOM 读 `data-composer-chip` 再拼 `/<cmd> <draft>` 是**双重错误**：
取错了属性、且本来就多余。2.8.1 已全部删除，直接用 `live.draft`。

## 四、升级宿主后的核验清单

1. `npm test` —— 102 项（含 `host-context.test.ts` 的 4 项真实 Context 断言）
2. 真启动 web profile，确认无 `skipping profile bundle` / `disabling plugin`
3. **手动验收三条 DOM 路径**（Node 侧测试覆盖不到）：
   - 草稿里插一个文件引用 chip → 按 Enter → 历史里那条**不应**带 `/reference` 前缀
   - 输入 `/plan /ds` → 确认行内技能补全能弹出
   - 双击 Esc 打开历史面板 → 上下键回填、右键粘贴
4. 设置卡片的 9 个开关改动后，刷新页面确认值还在

## 五、真实 Context 测试能测什么、测不到什么

`test/host-context.test.ts` 用 `new Context()` 起真实 cordis 根，能验证：

- `ctx.inject(['settings'])` 在服务缺失时让 fiber 停在 `PENDING`（`state === 0`）
- 服务就位后 `apply` 执行一次，`settings.configure({auto:false}, fiber)` 被调用
- 卸载时 `configure` 返回的 disposer 真的执行

**测不到**：`slots` 注册、`configForms` 订阅、`sessionOf` 替换的浏览器行为——
那些只在真实 web 实例里发生。

## 六、历史存储的安全边界

历史记录以**明文**写在 `localStorage`（键 `dsh-prompt-history.global` /
`dsh-prompt-history.session:<id>`），`maxHistoryItems` 上限 1000 条，但**单条无长度
上限**。粘贴进来的长文本（可能含密钥、内部文档）会原样留存。

已知未修：`save` 的 `QuotaExceededError` 被静默吞掉（用户以为在存、实际在丢），
也没有「清空历史」入口。使用敏感内容时请自行清理浏览器存储。

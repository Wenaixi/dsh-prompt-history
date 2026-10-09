# 贡献指南 (Contributing Guide)

感谢你关注并有意为 `@wenaixi/dsh-prompt-history` 贡献代码。在开始之前，请完整阅读本指南，以确保代码质量、契约一致性与工程纯粹度。

## 核心开发哲学

1. **零第三方依赖**：生产构建产物（client bundle）不得引入除 `react` 与官方 `@deepseek-ai/*` peer 依赖之外的任何第三方运行时包。所有交互逻辑、状态管理、时间格式化与模糊匹配均由自研轻量模型驱动。
2. **极简平实（YAGNI）**：拒绝没有真实调用者的预先抽象；拒绝为单一实现创建多余接口或工厂类；能用一行原生语言特性解决的绝不写十行。
3. **精准修改与最小 Diff**：修复缺陷直击根因；不得借由日常修改改动周边无关代码、死代码或重排格式。
4. **无 Emoji 与无套话纪律**：代码注释、文档与提交信息一律不使用 emoji，不写空洞排比与无信息量的宣传套话。

## 宿主契约规范

本项目深度嵌入 DeepSeek Harness (DSH) 运行底座，必须严格遵守以下官方宿主硬性契约：

| 契约项 | 约束规则 | 破坏后果 |
|---|---|---|
| **配置命名空间** | 必须严格等于 Loader 条目 id：`dsh-prompt-history` | 导致配置与宿主设置解耦，无法读写 |
| **插槽注册 Key** | `plugins.bundle.config` 注册时 `key` 必须等于完整包名 `@wenaixi/dsh-prompt-history` | 卡片详情内嵌配置面板无法被宿主匹配渲染，且静默无报错 |
| **配置字段属性** | 所有需要投影到前端表单的字段在 schema 中必须声明为 `.volatile()` | 非 volatile 字段尝试写入时宿主将直接抛出异常 |
| **产物 Bundle ID** | `tsdown.config.ts` 中配置的 `ID` 必须等于完整包名 | 客户端 bundle 会报 `loaded without registering` 导致功能彻底失效 |
| **建议菜单让位** | 快捷键接管必须避开 `[role="listbox"], [data-trigger-menu]` | 避免抢占宿主命令与技能候选项的上下键选择 |

## 本地开发与门禁流水线

提交代码前必须在本地依次运行以下四道门禁，并保证全部绿灯通过：

```bash
# 门禁 1：TypeScript 静态类型检查
node node_modules/typescript/bin/tsc --noEmit

# 门禁 2：纯函数单元测试集（35 项测试）
node --experimental-strip-types --test test/*.test.ts

# 门禁 3：双步构建（tsc 声明导出 + tsdown 产物构建）
pnpm build

# 门禁 4：发布包清单自检
npm pack --dry-run
```

## 提交规范

1. **Commit Message**：采用 Conventional Commits 规范，例如：
   - `feat: 支持历史列表宽屏右侧预览`
   - `fix: 修复认领态下行内斜杠补全被压制的问题`
   - `docs: 完善中英双语说明文档与快捷键速查表`
   - `test: 新增模糊匹配与时间格式化用例`
2. **分支流程**：基于 `main` 分支拉取功能分支，开发完成并确保门禁全绿后发起 Pull Request。

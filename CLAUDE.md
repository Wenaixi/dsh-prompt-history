# 项目规范与核心记忆

## 项目定位

- 包名：dsh-prompt-history。
- 功能：为 DSH Web composer 提供终端式输入历史、前缀搜索、Ctrl+R 反向搜索、选择复制或引用、右键粘贴，以及可选的跨会话历史和 Chat TOC。
- 插件形态：Host 空实现 + Web Client 双面插件。
- 当前主分支：main；默认只进行本地修改，不自动 push。

## 当前实现事实

- Host 入口保持空 apply，浏览器功能由 ./client 导出提供。
- 当前 composer UI 挂载在 conversation.input.right。
- 当前设置 UI 挂载在 settings.section，保存到浏览器 localStorage，键名为 dsh-prompt-history.prefs。
- 当前设置字段：copyMode、rightClickPaste、globalHistory、tocVisible。
- 当前默认值：copyMode=toolbar、rightClickPaste=true、globalHistory=false、tocVisible=true。
- 旧 copyOnSelect 字段已经有兼容读取逻辑，copyMode=off 会规范化为 toolbar。
- 当前设置入口包含复制模式、右键粘贴、跨会话历史和 Chat TOC；上下键历史、前缀搜索和 Ctrl+R 始终启用。
- 当前仓库没有测试目录、测试脚本、CI 配置或 GitHub Issue 模板。

## 已确认的重构方向

- 目标运行时以本机实际安装的最新 DSH 为准，优先适配 DSH 0.2.x 及其真实类型声明；不为旧版保留未经验证的兼容层。
- 设置主入口迁移到插件详情配置区域，使用最新 DSH 的 plugins.bundle.config 契约；不再注册旧的 settings.section 独立导航项。
- 配置数据迁移到 DSH 宿主配置命名空间，由宿主负责版本化读取、写入、冲突和持久化。
- 首次打开新配置卡片时，从旧 localStorage 按字段校验并一次性迁移；迁移后宿主配置为唯一来源，不继续双写。
- 迁移时保留 copyOnSelect、copyMode、rightClickPaste、globalHistory、tocVisible 的兼容读取；坏字段单独丢弃并回退对应默认值，不因单个坏字段放弃整份配置。
- 配置语义、字段名、默认值和输入历史核心行为保持不变。
- 设置面板按输入历史、复制与引用、聊天目录分组；采用紧凑单列布局和原生折叠分组。
- 优先复用 DSH UI primitives，避免重复实现开关、分段控件、输入控件和状态反馈；颜色、间距、圆角使用宿主 token。
- 设置项变更自动保存；保留恢复默认操作并进行二次确认。需要覆盖加载、保存中、保存失败、恢复默认和成功反馈等状态。
- 保留中英文国际化，文案可以随结构重写，但不得丢失语言键或改变配置语义。
- 本次视觉重构主要针对设置面板；输入框挂件、选择工具栏和 Chat TOC 只有在新 DSH 契约要求时才调整。

## 实现与验证规范

- 开始编码前先核对本机 DSH 官方包的类型声明、客户端 slot 声明、settings scope/config schema 和 UI primitives，不能只依据旧源码或记忆。
- Client 组件只接收 slot props，不传递或保存根 ctx；跨插件协作使用类型导入和宿主服务。
- 每次配置写入后必须回读宿主配置或接口真值；不能只依据 UI 状态判断成功。
- 最低验证包括 typecheck、build、打包清单检查、最小配置状态测试，以及真实浏览器验收。
- 浏览器验收至少覆盖 CLI Web；若本机桌面版使用该插件，还需完全退出 Electron 后重启验收。
- 验收应确认插件卡片可打开、设置只出现一份、每个控件能写入、刷新或重启后配置保持、默认值可恢复、控制台无错误。
- 每个小模块完成后独立提交本地 commit；不自动 push。

## 计划范围

### 包含

- DSH 最新版本依赖与插件包元数据适配。
- Host 配置 schema 和宿主配置命名空间。
- localStorage 到宿主配置的一次性迁移。
- plugins.bundle.config 详情配置卡片。
- DSH 原生风格的设置面板、状态反馈和国际化文案。
- 旧 settings.section 入口移除。
- 最小外部行为测试与真实浏览器验收。

### 不包含

- 输入历史算法、复制算法、Chat TOC 行为的产品改版。
- 新增快捷键或新增设置字段。
- 模型请求、会话协议或非设置相关的宿主功能改造。
- 旧 DSH 版本的未经验证兼容层。
- 远程分支同步、自动发布和版本发布流程改造。

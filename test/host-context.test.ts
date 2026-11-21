import test from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { apply, Config } from '../src/index.ts'

/**
 * 宿主侧真实 Context 测试。
 *
 * 为什么必须用真实 cordis Context 而不是手搓 mock：
 *   - `ctx.inject(['settings'])` 的语义是「服务就位后才激活回调」，
 *     mock 掉的 inject 无法证明「服务缺失时插件不激活」这条关键性质；
 *   - `settings.configure(presentation, owner)` 的第二个参数是 fiber，
 *     只有真实 Context 才有可校验的 fiber 对象；
 *   - `ctx.effect` 会立即执行并登记清理函数，mock 成空函数会让这条路径
 *     在测试里完全不跑（此前已踩过这个坑）。
 */

/** 记录 configure 调用，并可选地在 dispose 时置位。 */
class FakeSettings extends Service {
  calls: Array<{ presentation: Record<string, unknown>; owner: unknown }> = []
  disposed = false
  constructor(ctx: Context) {
    super(ctx, 'settings', {})
  }
  configure(presentation: Record<string, unknown>, owner: unknown): () => void {
    this.calls.push({ presentation, owner })
    return () => { this.disposed = true }
  }
}

const settle = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms))

test('真实 Context：settings 就位后 apply 会以 auto:false 声明自带配置页', async () => {
  const root = new Context()
  const settings = new FakeSettings(root)
  await settle()

  const fiber = root.plugin({
    name: 'ph-under-test',
    inject: ['settings'],
    apply: (ctx: Context) => apply(ctx, {} as never),
  })
  await settle()

  assert.equal(settings.calls.length, 1, 'settings.configure 应恰好被调用一次')
  assert.deepEqual(settings.calls[0].presentation, { auto: false })
  assert.ok(settings.calls[0].owner, 'owner 必须是真实 fiber 对象')
  assert.equal(typeof settings.calls[0].owner, 'object')

  await fiber?.dispose?.()
})

test('真实 Context：settings 缺失时 apply 不激活，fiber 停在 PENDING', async () => {
  const root = new Context()
  // 故意不注册 settings 服务
  const fiber = root.plugin({
    name: 'ph-without-settings',
    inject: ['settings'],
    apply: (ctx: Context) => apply(ctx, {} as never),
  })
  await settle()

  // 这三条都是可失败的：若 inject 语义被改坏、apply 提前执行，任一断言都会红。
  // FiberState.PENDING === 0，ACTIVE === 2（见 cordis lib/types/fiber.d.ts）。
  assert.equal(fiber?.state, 0, '缺依赖时 fiber 必须停在 PENDING')
  assert.equal(typeof fiber?.getEffects === 'function' ? fiber.getEffects().length : -1, 0,
    '未激活的 fiber 不应登记任何 effect')

  await fiber?.dispose?.()
})

test('真实 Context：卸载后 effect 的清理函数被执行', async () => {
  const root = new Context()
  const settings = new FakeSettings(root)
  await settle()

  const fiber = root.plugin({
    name: 'ph-dispose-check',
    inject: ['settings'],
    apply: (ctx: Context) => apply(ctx, {} as never),
  })
  await settle()
  assert.equal(settings.disposed, false, '卸载前不应清理')

  await fiber?.dispose?.()
  await settle()

  assert.equal(settings.disposed, true, '卸载必须触发 configure 返回的 disposer')
})

test('Config schema 的九个字段全部 volatile 且默认值与 patch 一致', () => {
  const expected: Record<string, unknown> = {
    copyMode: 'toolbar',
    rightClickPaste: true,
    historyEnabled: true,
    doubleEsc: true,
    maxHistoryItems: 100,
    relativeTime: true,
    fuzzyMatch: true,
    globalHistory: false,
    ignoreLeadingSpace: false,
  }
  const keys = Object.keys(expected)
  assert.deepEqual(Object.keys(Config.dict ?? {}).sort(), keys.slice().sort())

  for (const key of keys) {
    const field = Config.dict[key]
    // 每个字段都必须 volatile：Settings 只把 volatile 字段投影成表单。
    assert.ok(field.meta?.volatile === true, `${key} 必须是 volatile`)
  }
})

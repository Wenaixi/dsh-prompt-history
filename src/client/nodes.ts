/**
 * DSH 0.2.0-rc.2 现代会话消息节点解析器。
 *
 * 遵循官方 records.d.ts 的 UserMessageNode 与 SteeringMessageNode 契约，
 * 抛弃所有历史多代兼容分支，直接提取 seq、time 与 content 正文。
 */

export interface PromptMessage {
  readonly kind: 'user' | 'steering' | string
  /** 稳定排序序号，用于增量去重与顺序排列。 */
  readonly seq: number
  /** 用户消息纯文本正文，空内容或不支持类型时为 null。 */
  readonly text: string | null
  /** 会话源事件的 Unix 毫秒时间戳；不可用时为 0。 */
  readonly time: number
}

interface StandardMessageNode {
  kind?: unknown
  seq?: unknown
  time?: unknown
  content?: unknown
}

/** 提取现代节点序号 seq。 */
export function nodeSeq(node: StandardMessageNode): number {
  return typeof node.seq === 'number' && Number.isFinite(node.seq) ? node.seq : 0
}

/** 提取现代节点时间戳 time（毫秒）。 */
export function nodeTime(node: StandardMessageNode): number {
  return typeof node.time === 'number' && Number.isFinite(node.time) && node.time > 0 ? node.time : 0
}

/** 将现代会话节点标准化为 PromptMessage；非用户文本消息返回 null。 */
export function promptMessage(node: unknown): PromptMessage | null {
  if (node === null || typeof node !== 'object') return null
  const n = node as StandardMessageNode
  if (n.kind !== 'user' && n.kind !== 'steering') return null

  if (!Array.isArray(n.content)) return null
  let text = ''
  for (const block of n.content as ReadonlyArray<{ type?: unknown; text?: unknown }>) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      text += block.text
    }
  }

  const trimmed = text.trim()
  if (trimmed === '') return null
  return {
    kind: n.kind,
    seq: nodeSeq(n),
    text: trimmed,
    time: nodeTime(n),
  }
}

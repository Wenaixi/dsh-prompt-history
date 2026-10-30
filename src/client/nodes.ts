/**
 * DSH 现代会话消息节点解析器（深模块）。
 *
 * 遵循官方 records.d.ts、chatNode 及各插件契约，支持全形态用户输入提取：
 * 1. 传统用户与转向消息（UserMessageNode, SteeringMessageNode）；
 * 2. 斜杠命令（CommandNode: /name args 完整重构）；
 * 3. 交互问答回复（QuestionReplyNode, UserQuestionReplyNode）；
 * 4. 目标与原生命令输入（CommandInputNode）；
 * 5. 自动穿透宿主 UI 包装层（chatNode: node.data）与多样化 content 结构。
 */

export interface PromptMessage {
  readonly kind: 'user' | 'steering' | 'command' | string
  /** 稳定排序序号，用于增量去重与顺序排列。 */
  readonly seq: number
  /** 用户消息纯文本正文，空内容或不支持类型时为 null。 */
  readonly text: string | null
  /** 会话源事件的 Unix 毫秒时间戳；不可用时为 0。 */
  readonly time: number
}

/** 提取节点序号 seq（支持穿透 node.data 与 anchorSeq）。 */
export function nodeSeq(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0
  const n = node as Record<string, unknown>
  const data = n.data !== null && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : null
  const s = data?.seq ?? n.anchorSeq ?? n.seq
  return typeof s === 'number' && Number.isFinite(s) ? s : 0
}

/** 提取节点时间戳 time 毫秒（支持穿透 node.data 与容错负值）。 */
export function nodeTime(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0
  const n = node as Record<string, unknown>
  const data = n.data !== null && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : null
  const t = data?.time ?? n.time
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 0
}

/** 从多种形态的 content（字符串、块数组）中提取合并纯文本。 */
function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (typeof block === 'string') {
      text += block
    } else if (block !== null && typeof block === 'object') {
      const b = block as Record<string, unknown>
      if (typeof b.text === 'string') {
        text += b.text
      }
    }
  }
  return text
}

/** 将现代会话节点标准化为 PromptMessage；非用户文本消息返回 null。 */
export function promptMessage(node: unknown): PromptMessage | null {
  if (node === null || typeof node !== 'object') return null

  const raw = node as Record<string, unknown>
  const data = raw.data !== null && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : null
  const target = data ?? raw

  const kind = String(target.kind ?? raw.kind ?? '')
  const seq = nodeSeq(raw)
  const time = nodeTime(raw)

  let extractedText: string | null = null

  if (kind === 'user' || kind === 'steering') {
    // 用户或转向消息：提取 content 字段
    const content = target.content ?? raw.content
    extractedText = extractContentText(content)
  } else if (kind === 'command') {
    // 斜杠命令：提取 name 与 args 并拼接为完整命令
    const name = typeof target.name === 'string' ? target.name : typeof raw.name === 'string' ? raw.name : null
    const args = typeof target.args === 'string' ? target.args : typeof raw.args === 'string' ? raw.args : null

    if (name !== null && name.trim() !== '') {
      const trimmedName = name.trim()
      if (args !== null && args.trim() !== '') {
        extractedText = args.startsWith(' ') ? `/${trimmedName}${args}` : `/${trimmedName} ${args}`
      } else {
        extractedText = `/${trimmedName}`
      }
    }
  } else if (kind === 'question-reply' || kind === 'user-question-reply' || kind === 'command-input') {
    // 交互答复或直接命令输入：提取 text 字段
    const directText = typeof target.text === 'string' ? target.text : typeof raw.text === 'string' ? raw.text : null
    if (directText !== null) {
      extractedText = directText
    }
  }

  if (extractedText === null) return null
  const trimmed = extractedText.trim()
  if (trimmed === '') return null

  return {
    kind,
    seq,
    text: trimmed,
    time,
  }
}

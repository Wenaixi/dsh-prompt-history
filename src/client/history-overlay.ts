/**
 * HistoryOverlay: 终端提示词历史浮层的深模块控制器。
 *
 * 将历史面板的 DOM 构建、ARIA 无障碍属性、高亮着色、视口坐标计算、
 * 宽屏预览以及生命周期闭环封装为独立控制器，彻底消除全局模块级指针。
 */
import { T } from './i18n.ts'

export const HISTORY_CLASS = 'dsh-ph-history'
export const HISTORY_MAX_ROWS = 200
/** 相对时间列宽（右对齐，Claude Code AGE_WIDTH=8）。 */
export const AGE_WIDTH = 8
/** 宽屏阈值：Claude Code 终端列数 ≥100，web 用像素近似。 */
export const WIDE_MIN_PX = 1000
/** 预览最多行数，对齐 Claude Code PREVIEW_ROWS=6。 */
export const PREVIEW_ROWS = 6

export interface HistoryPanelView {
  /** 命中条目的文本，按展示顺序排列。 */
  readonly texts: readonly string[]
  /** 每行的相对时间文案；null 表示不显示（时间未知或设置关闭）。 */
  readonly ages: readonly (string | null)[]
  /** 高亮项在 texts 里的下标；-1 表示没有高亮。 */
  readonly highlight: number
  /** 过滤词；空串表示未过滤。 */
  readonly query: string
  /** 命中条数与历史总条数，用于底部提示。 */
  readonly shown: number
  /** 历史总条数。 */
  readonly total: number
}

export interface HistoryPanelRefs {
  /** 鼠标点中的下标；键盘与点击两条路径共用同一个提交入口。 */
  readonly onPick: (index: number) => void
  readonly onDismiss: () => void
}

/** 文本高亮切片结果，支持纯 Node 离线测试断言。 */
export interface HighlightSegment {
  readonly text: string
  readonly match: boolean
}

/**
 * 纯算法：将文本按搜索关键词切分为普通片段与高亮片段。
 */
export function splitHighlighted(text: string, query: string): HighlightSegment[] {
  if (query === '' || text === '') {
    return [{ text, match: false }]
  }
  const segments: HighlightSegment[] = []
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  let cursor = 0
  let hit = lower.indexOf(needle)

  while (hit >= 0) {
    if (hit > cursor) {
      segments.push({ text: text.slice(cursor, hit), match: false })
    }
    segments.push({ text: text.slice(hit, hit + needle.length), match: true })
    cursor = hit + needle.length
    hit = lower.indexOf(needle, cursor)
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false })
  }
  return segments
}

/**
 * 纯算法：格式化多行预览文本与溢出统计。
 */
export function formatPreview(text: string, maxRows: number = PREVIEW_ROWS): { lines: string[]; moreCount: number } {
  const lines = text.split('\n')
  const shown = lines.slice(0, maxRows)
  const moreCount = Math.max(0, lines.length - maxRows)
  return { lines: shown, moreCount }
}

/**
 * 纯算法：计算历史浮层相对于输入框卡片与视口的 Top 坐标。
 */
export function calculatePanelTop(
  anchorRect: { top: number; bottom: number } | null,
  panelHeight: number,
  viewportHeight: number,
): number {
  const h = panelHeight || 240
  if (anchorRect === null) return 8
  const above = anchorRect.top - h - 6
  // 输入框上方放不下时改放下方，两种情况都夹在视口 [8, viewportHeight - h - 8] 内。
  const top = above >= 8 ? above : Math.min(anchorRect.bottom + 6, viewportHeight - h - 8)
  return Math.max(8, Math.min(top, viewportHeight - h - 8))
}

const PANEL_CSS = 'position:fixed;z-index:2147483000;' +
  'left:50%;transform:translateX(-50%);' +
  'width:min(640px, calc(100vw - 24px));border-radius:10px;overflow:hidden;' +
  'background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l1);' +
  'box-shadow:0 8px 28px rgba(0,0,0,.28);'

const ROW_CSS = 'display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;' +
  'padding:7px 12px;border:0;background:transparent;cursor:pointer;font:13px/1.45 inherit;' +
  'color:var(--dsw-alias-label-secondary);border-left:2px solid transparent;'

const ROW_ACTIVE_CSS = 'background:var(--dsw-specific-menu-hover);color:var(--dsw-alias-label-primary);' +
  'border-left-color:var(--dsw-static-blue-500);'

const AGE_CSS = 'flex:none;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;' +
  `min-width:${AGE_WIDTH}ch;text-align:right;color:var(--dsw-alias-label-tertiary);`

const ROW_TEXT_CSS = 'min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'

/**
 * 历史列表浮层控制器类：管理 DOM 挂载、渲染与事件回收。
 */
export class HistoryOverlayController {
  private panel: HTMLDivElement | null = null
  private list: HTMLDivElement | null = null
  private foot: HTMLDivElement | null = null
  private preview: HTMLDivElement | null = null
  private refs: HistoryPanelRefs | null = null
  private readonly onPointerDownOutside = (e: PointerEvent): void => {
    if (!(e.target instanceof Node)) return
    if (this.panel?.contains(e.target) === true) return
    const card = document.querySelector('[data-composer-card]')
    if (card !== null && e.target instanceof Node && card.contains(e.target)) return
    this.refs?.onDismiss()
  }

  /** 当前浮层是否处于挂载打开状态。 */
  public isOpen(): boolean {
    return this.panel !== null
  }

  /**
   * 渲染或更新历史浮层视图。
   */
  public render(view: HistoryPanelView, refs: HistoryPanelRefs): void {
    if (this.panel === null) {
      this.mount()
    }
    const el = this.panel
    const list = this.list
    const foot = this.foot
    const preview = this.preview
    if (el === null || list === null || foot === null || preview === null) return
    this.refs = refs

    list.replaceChildren()
    const rows = view.texts.slice(0, HISTORY_MAX_ROWS)
    rows.forEach((text, i) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.id = `${HISTORY_CLASS}-row-${i}`
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', i === view.highlight ? 'true' : 'false')
      row.style.cssText = ROW_CSS + (i === view.highlight ? ROW_ACTIVE_CSS : '')
      row.title = text
      const age = view.ages[i]
      if (age !== null && age !== undefined && age !== '') {
        const ageEl = document.createElement('span')
        ageEl.style.cssText = AGE_CSS
        ageEl.textContent = age
        row.appendChild(ageEl)
      }
      const textEl = document.createElement('span')
      textEl.style.cssText = ROW_TEXT_CSS
      this.paintHighlighted(textEl, text, view.query)
      row.appendChild(textEl)
      row.addEventListener('click', () => { this.refs?.onPick(i) })
      list.appendChild(row)
    })

    if (view.highlight >= 0) {
      el.setAttribute('aria-activedescendant', `${HISTORY_CLASS}-row-${view.highlight}`)
    } else {
      el.removeAttribute('aria-activedescendant')
    }

    foot.textContent = view.shown === 0
      ? T('history.noMatch')
      : `${view.shown} / ${view.total}　${T('history.hint')}`

    // 宽屏右侧预览：显示高亮条目的完整文本，超过 6 行截断 + 「… +N more lines」。
    const isWide = typeof window !== 'undefined' ? window.innerWidth >= WIDE_MIN_PX : false
    preview.style.display = isWide ? 'block' : 'none'
    preview.replaceChildren()
    if (view.highlight >= 0 && view.highlight < rows.length) {
      const text = rows[view.highlight] ?? ''
      const { lines, moreCount } = formatPreview(text, PREVIEW_ROWS)
      preview.textContent = lines.join('\n')
      if (moreCount > 0) {
        preview.append(`\n… +${moreCount} ${T('history.moreLines')}`)
      }
    }

    this.reposition()
    // 高亮项滚进可视区，但不抢焦点。
    const active = list.querySelector(`#${HISTORY_CLASS}-row-${view.highlight}`)
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' })
  }

  /**
   * 关闭浮层并解绑监听（幂等）。
   */
  public hide(): void {
    if (this.panel !== null) {
      document.removeEventListener('pointerdown', this.onPointerDownOutside, true)
      this.panel.remove()
      this.panel = null
    }
    this.list = null
    this.foot = null
    this.preview = null
    this.refs = null
  }

  /** 销毁实例（等同 hide）。 */
  public destroy(): void {
    this.hide()
  }

  /** 装配 DOM 结构。 */
  private mount(): void {
    const el = document.createElement('div')
    el.className = HISTORY_CLASS
    el.style.cssText = PANEL_CSS
    el.setAttribute('role', 'listbox')

    const body = document.createElement('div')
    body.style.cssText = 'display:flex;align-items:stretch;'

    const list = document.createElement('div')
    list.style.cssText = 'flex:1 1 0;min-width:0;max-height:240px;overflow-y:auto;overscroll-behavior:contain;'
    list.setAttribute('role', 'presentation')

    const preview = document.createElement('div')
    preview.className = 'dsh-ph-history-preview'
    preview.style.cssText = 'display:none;flex:1 1 0;min-width:0;max-height:240px;overflow-y:auto;' +
      'padding:7px 12px;border-left:1px solid var(--dsw-alias-border-l2);' +
      'font:12.5px/1.6 inherit;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;' +
      'word-break:break-word;'

    body.append(list, preview)

    const foot = document.createElement('div')
    foot.style.cssText = 'padding:5px 12px;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;' +
      'color:var(--dsw-alias-label-tertiary);border-top:1px solid var(--dsw-alias-border-l2);'

    el.append(body, foot)
    document.body.appendChild(el)

    this.panel = el
    this.list = list
    this.foot = foot
    this.preview = preview
    document.addEventListener('pointerdown', this.onPointerDownOutside, true)
  }

  /** 将高亮片段着色并填充至 host 容器。 */
  private paintHighlighted(host: HTMLElement, text: string, query: string): void {
    const segments = splitHighlighted(text, query)
    for (const seg of segments) {
      if (seg.match) {
        const mark = document.createElement('mark')
        mark.textContent = seg.text
        host.append(mark)
      } else {
        host.append(seg.text)
      }
    }
  }

  /** 计算并更新浮层视口定位。 */
  private reposition(): void {
    if (this.panel === null) return
    const card = document.querySelector('[data-composer-card]')
    const rect = card instanceof HTMLElement ? card.getBoundingClientRect() : null
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const top = calculatePanelTop(rect, this.panel.offsetHeight, vh)
    this.panel.style.top = `${top}px`
  }
}

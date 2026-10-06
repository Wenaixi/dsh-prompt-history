/**
 * 认领态行内斜杠判定：宿主触发控制器 claimed 档的放宽开关。
 *
 * 与浏览器、cordis 都无关，纯粹是对草稿文本的一处判定，因此单列成纯函数以便直接测试。
 */

/**
 * 光标前的草稿里是否存在「行内」斜杠：光标所在的空白分隔段含 "/"，且该段之前还有正文。
 *
 * 认领命令按宿主约定只能出现在草稿首段（beginCommand 要求 span 之前全是空白），
 * 所以「段前有正文」正好排除了认领令牌本身：
 *   "/plan /ds"  命中（第二段是行内技能）
 *   "/plan "     不命中（还没有行内段）
 *   "/plan"      不命中（这就是认领令牌，放宽会把它自己再触发一遍）
 *   "/plan off"  不命中（纯文本参数）
 *
 * 行内段里的斜杠是否真的是触发符仍由宿主 boundaryOk 裁决（URL、// 等照旧被抑制），
 * 这里只负责回答「要不要把守卫放宽」，不重复宿主的边界规则。
 */
export function hasInlineSlash(draft: string, caret: number): boolean {
  const before = draft.slice(0, Math.max(0, caret))
  const start = before.search(/\S[^\s]*$/u)
  if (start <= 0) return false
  return before.slice(start).includes('/')
}

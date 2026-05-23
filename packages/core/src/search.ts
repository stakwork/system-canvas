import type { CanvasNode } from './types.js'

/**
 * Returns true when the node has any searchable text containing `query`
 * (case-insensitive). Checks: text, label, file, url, category, id.
 */
export function matchesSearch(node: CanvasNode, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return [
    node.text,
    node.label,
    node.file,
    node.url,
    node.category,
    node.id,
  ].some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
}

/**
 * Derives highlight and dim sets from active search + category filter state.
 *
 * Fast path: returns empty sets when both query and hiddenCategories are clear
 * (no active filter — zero overhead for the common case).
 *
 * - matchingIds: nodes matching the text query (empty when query is blank)
 * - dimmedIds: nodes that should render at low opacity — union of:
 *     - nodes that DON'T match the query (when query is non-empty)
 *     - nodes whose category is in hiddenCategories
 */
export function computeNodeFilter(
  nodes: CanvasNode[],
  query: string,
  hiddenCategories: Set<string>
): { matchingIds: Set<string>; dimmedIds: Set<string> } {
  const hasQuery = query.trim().length > 0
  const hasHidden = hiddenCategories.size > 0

  if (!hasQuery && !hasHidden) {
    return { matchingIds: new Set(), dimmedIds: new Set() }
  }

  const matchingIds = new Set<string>()
  const dimmedIds = new Set<string>()

  for (const node of nodes) {
    const matches = hasQuery ? matchesSearch(node, query) : true
    const categoryHidden =
      hasHidden && !!node.category && hiddenCategories.has(node.category)

    if (hasQuery && matches) matchingIds.add(node.id)
    if ((hasQuery && !matches) || categoryHidden) dimmedIds.add(node.id)
  }

  return { matchingIds, dimmedIds }
}

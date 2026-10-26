import { flextree } from 'd3-flextree'

export const CARD_W = 232
export const CARD_H = 124
export const GAP_X = 20 // between sibling cards
export const GAP_Y = 64 // between a manager and their reports
const GROUP_PAD = 14
const GROUP_HEAD = 30 // label row inside an IC group
const GROUP_GAP = 14 // between cards inside an IC group

/**
 * Lays out the expanded part of the org with variable-size nodes.
 *
 * Individual contributors who share a manager are packed into one "team"
 * block (a small grid) instead of a single row, so a manager with 40 ICs
 * doesn't produce a 10,000px-wide line of cards. Managers stay in the row
 * so their own subtrees can branch normally. flextree accounts for each
 * block's real height, so nothing below it overlaps.
 *
 * Returns world-space boxes (left/top) for cards, groups and connector links.
 */
export function layoutOrg(o, isExpanded) {
  const rootItem = makeCard(o.root)
  const stack = [rootItem]
  while (stack.length) {
    const item = stack.pop()
    const v = item.v
    if (o.childCount[v] === 0 || !isExpanded(v)) continue
    const leaves = []
    const managers = []
    for (let k = o.childStart[v]; k < o.childStart[v + 1]; k++) {
      const c = o.childList[k]
      if (o.childCount[c] > 0) managers.push(c)
      else leaves.push(c)
    }
    item.children = []
    if (leaves.length === 1) managers.push(leaves.pop())
    if (leaves.length > 1) item.children.push(makeGroup(v, leaves))
    for (const m of managers) {
      const child = makeCard(m)
      item.children.push(child)
      stack.push(child)
    }
  }

  const layout = flextree({
    nodeSize: (n) => [n.data.w, n.data.h],
    spacing: (a, b) => (a.parent === b.parent ? GAP_X : GAP_X * 2),
  })
  const tree = layout.hierarchy(rootItem)
  layout(tree)

  const cards = []
  const groups = []
  const links = []
  const pos = new Map() // person index -> card box, for focusing and anchoring
  let minX = Infinity
  let maxX = -Infinity
  let maxY = 0

  tree.each((n) => {
    const d = n.data
    const left = n.x - d.boxW / 2
    const top = n.y
    minX = Math.min(minX, left)
    maxX = Math.max(maxX, left + d.boxW)
    maxY = Math.max(maxY, top + d.boxH)
    if (d.kind === 'card') {
      const box = { v: d.v, left, top, w: CARD_W, h: CARD_H }
      cards.push(box)
      pos.set(d.v, box)
    } else {
      groups.push({ key: `g${d.manager}`, manager: d.manager, left, top, w: d.boxW, h: d.boxH, size: d.leaves.length })
      d.leaves.forEach((v, i) => {
        const col = i % d.cols
        const row = Math.floor(i / d.cols)
        const box = {
          v,
          left: left + GROUP_PAD + col * (CARD_W + GROUP_GAP),
          top: top + GROUP_HEAD + row * (CARD_H + GROUP_GAP),
          w: CARD_W,
          h: CARD_H,
          grouped: true,
        }
        cards.push(box)
        pos.set(v, box)
      })
    }
    if (n.parent) {
      const p = n.parent
      links.push({
        key: `${p.data.v}-${d.kind === 'card' ? d.v : 'g' + d.manager}`,
        child: d.kind === 'card' ? d.v : -1,
        manager: p.data.v,
        x1: p.x,
        y1: p.y + CARD_H,
        x2: n.x,
        y2: top,
      })
    }
  })

  return { cards, groups, links, pos, bounds: { minX, maxX, minY: 0, maxY } }
}

function makeCard(v) {
  return { kind: 'card', v, w: CARD_W + GAP_X, h: CARD_H + GAP_Y, boxW: CARD_W, boxH: CARD_H }
}

function makeGroup(manager, leaves) {
  const cols = leaves.length <= 4 ? 1 : leaves.length <= 16 ? 2 : leaves.length <= 45 ? 3 : 4
  const rows = Math.ceil(leaves.length / cols)
  const boxW = GROUP_PAD * 2 + cols * CARD_W + (cols - 1) * GROUP_GAP
  const boxH = GROUP_HEAD + rows * CARD_H + (rows - 1) * GROUP_GAP + GROUP_PAD
  return { kind: 'group', v: -1, manager, leaves, cols, w: boxW + GAP_X, h: boxH + GAP_Y, boxW, boxH }
}

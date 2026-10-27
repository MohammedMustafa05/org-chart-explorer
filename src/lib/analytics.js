import { forEachInSubtree, managementCostRatio } from './hierarchy.js'

export const SPAN_BUCKETS = [
  { label: '1', min: 1, max: 1 },
  { label: '2', min: 2, max: 2 },
  { label: '3', min: 3, max: 3 },
  { label: '4', min: 4, max: 4 },
  { label: '5–8', min: 5, max: 8 },
  { label: '9–12', min: 9, max: 12 },
  { label: '13+', min: 13, max: Infinity },
]
const spanBucket = (n) => SPAN_BUCKETS.findIndex((b) => n >= b.min && n <= b.max)

// Dimensions people can be grouped by, when the CSV has them
const DIMENSIONS = [
  { key: 'department', label: 'Department' },
  { key: 'entity', label: 'Entity' },
  { key: 'location', label: 'Location' },
  { key: 'level', label: 'Level' },
]

/** Which grouping dimensions actually carry data in this org. */
export function availableDimensions(o) {
  return DIMENSIONS.filter((d) => o.people.some((p) => !p.virtual && p[d.key]))
}

/**
 * Everything the analytics view needs for one subtree, in one walk.
 * Covers the people who report (directly or not) to `scope`, not the leader.
 * `groupBy` is a person field (department, entity, location, level).
 */
export function computeAnalytics(o, scope, groupBy = 'department') {
  const base = o.depth[scope]
  const layers = [] // index = layers below the leader (0 = direct reports)
  const groups = new Map()
  const spans = SPAN_BUCKETS.map((b) => ({ ...b, managers: 0 }))
  const narrow = [] // managers with a single report
  const wide = [] // managers with 13+ direct reports
  let managers = 0
  let directSum = 0
  let bonus = 0

  forEachInSubtree(o, scope, (v) => {
    if (v === scope) return
    const layer = o.depth[v] - base - 1
    const isManager = o.childCount[v] > 0
    const p = o.people[v]
    const s = p.salary
    bonus += p.bonus

    const L = (layers[layer] ??= { layer, managers: 0, ics: 0, cost: 0 })
    L.cost += s
    if (isManager) L.managers++
    else L.ics++

    const key = p[groupBy] || 'Unassigned'
    let G = groups.get(key)
    if (!G) {
      G = { name: key, managers: 0, ics: 0, mgmtCost: 0, icCost: 0, bonus: 0, directSum: 0, byLayer: [], bySpan: SPAN_BUCKETS.map(() => 0) }
      groups.set(key, G)
    }
    G.bonus += p.bonus
    G.byLayer[layer] = (G.byLayer[layer] ?? 0) + 1
    if (isManager) {
      const directs = o.childCount[v]
      G.managers++
      G.mgmtCost += s
      G.directSum += directs
      G.bySpan[spanBucket(directs)]++
      managers++
      directSum += directs
      spans[spanBucket(directs)].managers++
      if (directs === 1) narrow.push(v)
      if (directs >= 13) wide.push(v)
    } else {
      G.ics++
      G.icCost += s
    }
  })

  const groupList = [...groups.values()]
    .map((g) => ({ ...g, people: g.managers + g.ics, salary: g.mgmtCost + g.icCost, avgSpan: g.managers ? g.directSum / g.managers : 0 }))
    .sort((a, b) => b.salary - a.salary)

  // Sub-orgs led by each direct report, sized by their whole org's cost (leader included)
  const subOrgs = []
  for (let k = o.childStart[scope]; k < o.childStart[scope + 1]; k++) {
    const c = o.childList[k]
    const below = o.managementCost[c] + o.icCost[c]
    subOrgs.push({
      v: c,
      value: o.totalCost[c] + o.people[c].salary,
      people: o.descendants[c] + 1,
      mgmtShare: below > 0 ? o.managementCost[c] / below : 0,
    })
  }

  return {
    people: o.descendants[scope],
    managers,
    ics: o.descendants[scope] - managers,
    totalCost: o.totalCost[scope],
    mgmtCost: o.managementCost[scope],
    icCost: o.icCost[scope],
    bonus,
    ratio: managementCostRatio(o, scope),
    avgSpan: managers ? directSum / managers : 0,
    layerCount: layers.length,
    layers,
    groups: groupList,
    spans,
    narrow: narrow.sort((a, b) => o.people[b].salary - o.people[a].salary),
    wide: wide.sort((a, b) => o.childCount[b] - o.childCount[a]),
    subOrgs,
  }
}

/** CSV of every person in the subtree with the computed metrics. */
export function exportCsv(o, scope) {
  const head = ['Employee Id', 'Name', 'Job Title', 'Department', 'Entity', 'Manager Id', 'Salary', 'Direct Reports', 'Descendants', 'Non-leaf Descendants', 'Management Cost', 'IC Cost', 'Total Cost', 'Management Cost Ratio']
  const esc = (x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x))
  const lines = [head.join(',')]
  forEachInSubtree(o, scope, (v) => {
    const p = o.people[v]
    if (p.virtual) return
    const m = o.parent[v]
    const r = managementCostRatio(o, v)
    lines.push(
      [p.id, p.name, p.title, p.department, p.entity, m >= 0 && !o.people[m].virtual ? o.people[m].id : '', p.salary, o.childCount[v], o.descendants[v], o.nonLeafDescendants[v], o.managementCost[v], o.icCost[v], o.totalCost[v], r == null ? '' : r.toFixed(4)]
        .map(esc)
        .join(','),
    )
  })
  return lines.join('\n')
}

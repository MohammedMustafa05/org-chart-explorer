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

/**
 * Everything the analytics view needs for one subtree, in one walk.
 * Covers the people who report (directly or not) to `scope`, not the leader.
 */
export function computeAnalytics(o, scope) {
  const base = o.depth[scope]
  const layers = [] // index = layers below the leader (0 = direct reports)
  const depts = new Map()
  const spans = SPAN_BUCKETS.map((b) => ({ ...b, managers: 0 }))
  const heat = new Map() // dept -> per-layer headcount
  const narrow = [] // managers with a single report
  const wide = [] // managers with 13+ direct reports
  let managers = 0
  let directSum = 0

  forEachInSubtree(o, scope, (v) => {
    if (v === scope) return
    const layer = o.depth[v] - base - 1
    const isManager = o.childCount[v] > 0
    const p = o.people[v]
    const s = p.salary

    const L = (layers[layer] ??= { layer, managers: 0, ics: 0, cost: 0 })
    L.cost += s
    if (isManager) L.managers++
    else L.ics++

    const dept = p.department || 'Unassigned'
    const D = depts.get(dept) ?? { name: dept, managers: 0, ics: 0, mgmtCost: 0, icCost: 0 }
    if (isManager) {
      D.managers++
      D.mgmtCost += s
    } else {
      D.ics++
      D.icCost += s
    }
    depts.set(dept, D)

    const row = heat.get(dept) ?? []
    row[layer] = (row[layer] ?? 0) + 1
    heat.set(dept, row)

    if (isManager) {
      const directs = o.childCount[v]
      managers++
      directSum += directs
      spans.find((b) => directs >= b.min && directs <= b.max).managers++
      if (directs === 1) narrow.push(v)
      if (directs >= 13) wide.push(v)
    }
  })

  const deptList = [...depts.values()].sort((a, b) => b.mgmtCost + b.icCost - (a.mgmtCost + a.icCost))
  const layerCount = layers.length

  // Sub-orgs led by each direct report, sized by their whole org's cost (leader included)
  const subOrgs = []
  for (let k = o.childStart[scope]; k < o.childStart[scope + 1]; k++) {
    const c = o.childList[k]
    subOrgs.push({
      v: c,
      value: o.totalCost[c] + o.people[c].salary,
      people: o.descendants[c] + 1,
      mgmtShare: o.managementCost[c] + o.icCost[c] > 0 ? o.managementCost[c] / (o.managementCost[c] + o.icCost[c]) : 0,
    })
  }

  return {
    people: o.descendants[scope],
    managers,
    ics: o.descendants[scope] - managers,
    totalCost: o.totalCost[scope],
    mgmtCost: o.managementCost[scope],
    icCost: o.icCost[scope],
    ratio: managementCostRatio(o, scope),
    avgSpan: managers ? directSum / managers : 0,
    layerCount,
    layers,
    depts: deptList,
    spans,
    heat: { depts: deptList.map((d) => d.name), rows: heat, layerCount },
    narrow: narrow.sort((a, b) => o.people[b].salary - o.people[a].salary),
    wide: wide.sort((a, b) => o.childCount[b] - o.childCount[a]),
    subOrgs,
  }
}

/** CSV of every person in the subtree with the computed metrics. */
export function exportCsv(o, scope) {
  const head = ['Employee Id', 'Name', 'Job Title', 'Department', 'Manager Id', 'Salary', 'Direct Reports', 'Descendants', 'Non-leaf Descendants', 'Management Cost', 'IC Cost', 'Total Cost', 'Management Cost Ratio']
  const esc = (x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x))
  const lines = [head.join(',')]
  forEachInSubtree(o, scope, (v) => {
    const p = o.people[v]
    if (p.virtual) return
    const m = o.parent[v]
    const r = managementCostRatio(o, v)
    lines.push(
      [p.id, p.name, p.title, p.department, m >= 0 && !o.people[m].virtual ? o.people[m].id : '', p.salary, o.childCount[v], o.descendants[v], o.nonLeafDescendants[v], o.managementCost[v], o.icCost[v], o.totalCost[v], r == null ? '' : r.toFixed(4)]
        .map(esc)
        .join(','),
    )
  })
  return lines.join('\n')
}

// Builds the reporting hierarchy from flat CSV rows and computes every
// per-node metric in a single O(n) pass.
//
// Why it is fast: nodes are stored in typed arrays (struct-of-arrays) and the
// children of each node are packed into one contiguous Int32Array (CSR layout).
// A breadth-first walk from the root(s) gives an order where every parent comes
// before its children; walking that order backwards visits every child before
// its parent, so each node folds its finished totals into its parent exactly
// once. No recursion (a 40k-deep chain cannot blow the stack), no per-path
// recomputation, and nothing is recalculated when nodes expand or collapse.

/**
 * @param {Record<string, string>[]} rows  parsed CSV rows
 * @param {{id: string, manager: string, name?: string, title?: string,
 *          department?: string, location?: string, salary?: string,
 *          bonus?: string, entity?: string, level?: string}} cols
 */
export function buildOrg(rows, cols) {
  const warnings = { duplicateIds: 0, missingManagers: 0, cycles: 0, invalidSalaries: 0 }
  const people = []
  const indexById = new Map()

  for (const row of rows) {
    const id = clean(row[cols.id])
    if (!id) continue
    if (indexById.has(id)) {
      warnings.duplicateIds++
      continue
    }
    const salaryRaw = cols.salary ? row[cols.salary] : ''
    const salary = parseMoney(salaryRaw)
    if (cols.salary && clean(salaryRaw) && Number.isNaN(salary)) warnings.invalidSalaries++
    indexById.set(id, people.length)
    people.push({
      i: people.length,
      id,
      managerKey: clean(row[cols.manager]),
      name: (cols.name && clean(row[cols.name])) || id,
      title: (cols.title && clean(row[cols.title])) || '',
      department: (cols.department && clean(row[cols.department])) || '',
      location: (cols.location && clean(row[cols.location])) || '',
      salary: Number.isNaN(salary) ? 0 : salary,
      bonus: cols.bonus ? parseMoney(row[cols.bonus]) || 0 : 0,
      entity: (cols.entity && clean(row[cols.entity])) || '',
      level: (cols.level && clean(row[cols.level])) || '',
      virtual: false,
    })
  }

  // Some exports reference managers by name instead of id: fall back to a name lookup
  const indexByName = new Map()
  for (const p of people) if (!indexByName.has(p.name)) indexByName.set(p.name, p.i)

  let n = people.length
  const parent = new Int32Array(n + 1).fill(-1)
  for (const p of people) {
    if (!p.managerKey) continue
    const m = indexById.get(p.managerKey) ?? indexByName.get(p.managerKey)
    if (m === undefined) warnings.missingManagers++
    else if (m !== p.i) parent[p.i] = m
  }

  // Break reporting cycles (A -> B -> A) so the walk terminates: colour each
  // chain once, and cut the edge that closes a loop.
  const state = new Uint8Array(n) // 0 = unseen, 1 = on current chain, 2 = done
  const chain = []
  for (let s = 0; s < n; s++) {
    let v = s
    while (v !== -1 && state[v] === 0) {
      state[v] = 1
      chain.push(v)
      v = parent[v]
    }
    if (v !== -1 && state[v] === 1) {
      parent[v] = -1
      warnings.cycles++
    }
    for (const c of chain) state[c] = 2
    chain.length = 0
  }

  // Multiple top-level people become children of one synthetic company node
  let roots = []
  for (let i = 0; i < n; i++) if (parent[i] === -1) roots.push(i)
  let root = roots[0] ?? -1
  if (roots.length > 1) {
    root = n
    people.push({ i: n, id: '__root__', name: 'Company', title: `${roots.length} top-level leaders`, department: '', location: '', entity: '', level: '', salary: 0, bonus: 0, virtual: true })
    for (const r of roots) parent[r] = root
    parent[root] = -1
    n += 1
  }
  const size = n

  // CSR children layout
  const childCount = new Int32Array(size)
  for (let i = 0; i < size; i++) if (parent[i] !== -1) childCount[parent[i]]++
  const childStart = new Int32Array(size + 1)
  for (let i = 0; i < size; i++) childStart[i + 1] = childStart[i] + childCount[i]
  const childList = new Int32Array(childStart[size])
  const cursor = childStart.slice(0, size)
  for (let i = 0; i < size; i++) if (parent[i] !== -1) childList[cursor[parent[i]]++] = i

  // BFS order (parents before children) + depth
  const order = new Int32Array(size)
  const depth = new Int32Array(size)
  let head = 0
  let tail = 0
  if (root !== -1) order[tail++] = root
  while (head < tail) {
    const v = order[head++]
    for (let k = childStart[v]; k < childStart[v + 1]; k++) {
      const c = childList[k]
      depth[c] = depth[v] + 1
      order[tail++] = c
    }
  }

  // The single bottom-up pass
  const salary = new Float64Array(size)
  for (let i = 0; i < size; i++) salary[i] = people[i].salary
  const descendants = new Int32Array(size)
  const nonLeafDescendants = new Int32Array(size)
  const managementCost = new Float64Array(size)
  const icCost = new Float64Array(size)
  const totalCost = new Float64Array(size)
  const height = new Int32Array(size) // layers below this node

  for (let k = tail - 1; k > 0; k--) {
    const v = order[k]
    const p = parent[v]
    const isManager = childCount[v] > 0
    descendants[p] += 1 + descendants[v]
    nonLeafDescendants[p] += (isManager ? 1 : 0) + nonLeafDescendants[v]
    managementCost[p] += (isManager ? salary[v] : 0) + managementCost[v]
    icCost[p] += (isManager ? 0 : salary[v]) + icCost[v]
    totalCost[p] += salary[v] + totalCost[v]
    if (height[v] + 1 > height[p]) height[p] = height[v] + 1
  }

  // Display order: managers with the biggest orgs first, then ICs by name
  for (let v = 0; v < size; v++) {
    const s = childStart[v]
    const e = childStart[v + 1]
    if (e - s < 2) continue
    const kids = Array.from(childList.subarray(s, e))
    kids.sort((a, b) => descendants[b] - descendants[a] || people[a].name.localeCompare(people[b].name))
    childList.set(kids, s)
  }

  return {
    people,
    size,
    root,
    realCount: people.filter((p) => !p.virtual).length,
    parent,
    depth,
    height,
    childStart,
    childList,
    childCount,
    order: order.subarray(0, tail),
    descendants,
    nonLeafDescendants,
    managementCost,
    icCost,
    totalCost,
    warnings,
  }
}

/** Children of node v as a plain array (already in display order). */
export function childrenOf(org, v) {
  return Array.from(org.childList.subarray(org.childStart[v], org.childStart[v + 1]))
}

/** Root-to-node index path. */
export function pathTo(org, v) {
  const path = []
  for (let x = v; x !== -1; x = org.parent[x]) path.push(x)
  return path.reverse()
}

/**
 * IC cost relative to management cost: how many dollars go to individual
 * contributors for every dollar spent on managers beneath this node.
 * Returns null when there is no management cost below the node.
 */
export function managementCostRatio(org, v) {
  const m = org.managementCost[v]
  return m > 0 ? org.icCost[v] / m : null
}

/** Visit every node in v's subtree (including v), parents first, no recursion. */
export function forEachInSubtree(org, v, fn) {
  const stack = [v]
  while (stack.length) {
    const x = stack.pop()
    fn(x)
    for (let k = org.childStart[x + 1] - 1; k >= org.childStart[x]; k--) stack.push(org.childList[k])
  }
}

function clean(v) {
  return v == null ? '' : String(v).trim()
}

function parseMoney(v) {
  const s = clean(v).replace(/[$,\s]|CAD|USD/gi, '')
  if (!s) return 0
  return Number(s)
}

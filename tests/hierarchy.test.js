import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { buildOrg, managementCostRatio, forEachInSubtree } from '../src/lib/hierarchy.js'
import { parseCsv } from '../src/lib/csv.js'

// The 40k file is gitignored on main (see README); fetch it from the data branch when it isn't local
const LOCAL = new URL('../public/giga-corp.csv', import.meta.url)
const DATA_URL = 'https://raw.githubusercontent.com/MohammedMustafa05/org-chart-explorer/data/giga-corp.csv'
async function loadSample() {
  if (existsSync(LOCAL)) return readFileSync(LOCAL, 'utf8')
  const res = await fetch(DATA_URL).catch(() => null)
  return res?.ok ? res.text() : null
}
const sample = await loadSample()
const noSample = !sample && 'giga-corp.csv is not in public/ and could not be downloaded'

const cols = { id: 'id', manager: 'mgr', name: 'name', salary: 'salary' }
const row = (id, mgr, salary) => ({ id, mgr, name: id, salary: String(salary) })

//        A(100)
//       /      \
//    B(50)    C(40)
//    /   \
//  D(10) E(20)
//   |
//  F(5)
const small = [row('A', '', 100), row('B', 'A', 50), row('C', 'A', 40), row('D', 'B', 10), row('E', 'B', 20), row('F', 'D', 5)]

test('counts descendants and non-leaf descendants', () => {
  const org = buildOrg(small, cols)
  const at = (id) => org.people.find((p) => p.id === id).i
  assert.equal(org.descendants[at('A')], 5)
  assert.equal(org.nonLeafDescendants[at('A')], 2) // B, D
  assert.equal(org.descendants[at('B')], 3)
  assert.equal(org.nonLeafDescendants[at('B')], 1) // D
  assert.equal(org.descendants[at('F')], 0)
})

test('splits cost into management and IC cost', () => {
  const org = buildOrg(small, cols)
  const a = org.people.find((p) => p.id === 'A').i
  assert.equal(org.managementCost[a], 50 + 10) // B, D
  assert.equal(org.icCost[a], 40 + 20 + 5) // C, E, F
  assert.equal(org.totalCost[a], 125)
  assert.equal(managementCostRatio(org, a), 65 / 60)
})

test('joins multiple roots under one company node and survives cycles', () => {
  const org = buildOrg([row('A', '', 1), row('B', '', 2), row('X', 'Y', 3), row('Y', 'X', 4)], cols)
  assert.ok(org.people[org.root].virtual)
  assert.equal(org.descendants[org.root], 4)
  assert.equal(org.warnings.cycles, 1)
})

test('skips duplicate ids, keeps people with unknown managers, parses formatted salaries', () => {
  const org = buildOrg([row('A', '', '$120,000'), row('B', 'A', '50,000'), row('B', 'A', 1), row('C', 'nobody', 'n/a')], cols)
  assert.equal(org.warnings.duplicateIds, 1)
  assert.equal(org.warnings.missingManagers, 1)
  assert.equal(org.warnings.invalidSalaries, 1)
  assert.equal(org.realCount, 3)
  // A and C are both top level, so they're joined under the company node
  assert.ok(org.people[org.root].virtual)
  const a = org.people.find((p) => p.id === 'A').i
  assert.equal(org.people[a].salary, 120000)
  assert.equal(org.totalCost[a], 50000)
})

test('matches a brute-force count on the 40k sample', { skip: noSample }, () => {
  const { rows, cols: c } = parseCsv(sample)
  const t0 = performance.now()
  const org = buildOrg(rows, c)
  const ms = performance.now() - t0
  console.log(`  built ${org.size} nodes in ${ms.toFixed(1)} ms`)
  for (const v of [org.root, org.childList[0], org.childList[3]]) {
    let d = -1, nl = -1, total = -org.people[v].salary
    forEachInSubtree(org, v, (x) => {
      d++
      if (org.childCount[x] > 0) nl++
      total += org.people[x].salary
    })
    assert.equal(org.descendants[v], d)
    assert.equal(org.nonLeafDescendants[v], nl)
    assert.equal(Math.round(org.totalCost[v]), Math.round(total))
  }
})

test('agrees with d3-hierarchy stratify + sum on every node of the real file', { skip: noSample }, async () => {
  const { stratify } = await import('d3-hierarchy')
  const { rows, cols: c } = parseCsv(sample)
  const org = buildOrg(rows, c)
  const root = stratify()
    .id((r) => r[c.id])
    .parentId((r) => r[c.manager] || null)(rows)
  // d3's sum() includes each node's own value, so subtract it back out
  root.sum((r) => Number(r[c.salary]) || 0)
  const index = new Map(org.people.map((p) => [p.id, p.i]))
  let checked = 0
  root.each((n) => {
    const v = index.get(n.id)
    const own = Number(n.data[c.salary]) || 0
    const descendants = n.descendants().length - 1
    assert.equal(org.descendants[v], descendants)
    assert.ok(Math.abs(org.totalCost[v] - (n.value - own)) < 1e-3 * Math.max(1, n.value))
    checked++
  })
  assert.equal(checked, org.realCount)
})

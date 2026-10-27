// Times buildOrg on synthetic orgs of increasing size, as a random tree and as
// a single chain (the deepest possible org, which would overflow the stack in
// a recursive implementation).
//
// Usage: node scripts/bench.mjs [size ...]

import { buildOrg } from '../src/lib/hierarchy.js'

const sizes = process.argv.slice(2).map(Number).filter(Boolean)
const cols = { id: 'id', manager: 'manager', name: 'name', salary: 'salary' }

for (const n of sizes.length ? sizes : [40_000, 400_000, 1_000_000]) {
  // Each person reports to someone hired before them, so the tree is valid
  const tree = [{ id: 'p0', manager: '', name: 'CEO', salary: '250000' }]
  for (let i = 1; i < n; i++) tree.push({ id: `p${i}`, manager: `p${Math.floor(Math.random() * i)}`, name: `Person ${i}`, salary: String(50000 + (i % 100000)) })
  const chain = tree.map((r, i) => ({ ...r, manager: i ? `p${i - 1}` : '' }))

  for (const [shape, rows] of [['random tree', tree], ['single chain', chain]]) {
    buildOrg(rows, cols) // warm up the JIT
    const t0 = performance.now()
    const org = buildOrg(rows, cols)
    const ms = performance.now() - t0
    console.log(`${n.toLocaleString().padStart(9)} people, ${shape.padEnd(12)} ${ms.toFixed(0).padStart(5)} ms  (${org.descendants[org.root].toLocaleString()} below the root)`)
  }
}

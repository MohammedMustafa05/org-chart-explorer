// Generates a deterministic, realistic sample org (default 40,000 people) at
// public/giga-corp.csv so the app runs out of the box. Replace that file with
// the real Giga Corp export (or drop the CSV into the app) to use real data.
//
// Usage: node scripts/generate-giga-corp.mjs [count]

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TARGET = Number(process.argv[2] ?? 40000)
const OUT = fileURLToPath(new URL('../public/giga-corp.csv', import.meta.url))

// mulberry32: small seeded PRNG so every run produces the same org
let seed = 20241127
function rand() {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))

const FIRST = ['Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Mia', 'Lucas', 'Amir', 'Priya', 'Chen', 'Sofia', 'Mateo', 'Yuki', 'Fatima', 'Omar', 'Hana', 'Diego', 'Zara', 'Ethan', 'Isla', 'Kofi', 'Leila', 'Arjun', 'Maya', 'Jonah', 'Aisha', 'Ravi', 'Elena', 'Kai', 'Nora', 'Samir', 'Grace', 'Theo', 'Ines', 'Malik', 'Rosa', 'Felix', 'Anya', 'Hugo', 'Layla']
const LAST = ['Nguyen', 'Patel', 'Smith', 'Kim', 'Garcia', 'Chen', 'Singh', 'Martin', 'Okafor', 'Rossi', 'Haddad', 'Tanaka', 'Silva', 'Novak', 'Ahmed', 'Brown', 'Lopez', 'Wong', 'Murphy', 'Cohen', 'Dubois', 'Ivanova', 'Mensah', 'Khan', 'Larsen', 'Moreau', 'Sato', 'Reyes', 'Fischer', 'Ali']
const LOCATIONS = ['Toronto', 'Vancouver', 'San Francisco', 'New York', 'London', 'Berlin', 'Singapore', 'Austin', 'Remote']

const DEPARTMENTS = [
  { name: 'Engineering', share: 0.34, ic: ['Software Engineer', 'Senior Software Engineer', 'Staff Engineer', 'QA Engineer', 'SRE'], base: 125000 },
  { name: 'Sales', share: 0.17, ic: ['Account Executive', 'Sales Development Rep', 'Solutions Consultant'], base: 95000 },
  { name: 'Customer Success', share: 0.12, ic: ['Customer Success Manager', 'Support Specialist', 'Implementation Consultant'], base: 78000 },
  { name: 'Product', share: 0.07, ic: ['Product Manager', 'Product Designer', 'UX Researcher'], base: 130000 },
  { name: 'Marketing', share: 0.08, ic: ['Marketing Manager', 'Content Strategist', 'Growth Analyst'], base: 92000 },
  { name: 'Operations', share: 0.1, ic: ['Operations Analyst', 'Program Manager', 'Procurement Specialist'], base: 85000 },
  { name: 'Finance', share: 0.06, ic: ['Financial Analyst', 'Accountant', 'FP&A Analyst'], base: 98000 },
  { name: 'People', share: 0.06, ic: ['HR Business Partner', 'Recruiter', 'People Ops Specialist'], base: 82000 },
]

// Probability that a person at this depth manages others (depth 1 = dept heads)
const MANAGER_P = [1, 1, 0.95, 0.75, 0.5, 0.25, 0.08, 0]
const MGMT_TITLES = ['Chief Executive Officer', 'SVP', 'VP', 'Director', 'Senior Manager', 'Manager', 'Team Lead', 'Team Lead']
const MGMT_PAY = [520000, 340000, 250000, 195000, 165000, 145000, 130000, 125000]

const people = []
function add(parent, depth, dept) {
  const p = { id: people.length + 1, parent, depth, dept, children: 0, manager: false }
  people.push(p)
  if (parent) parent.children++
  return p
}

const ceo = add(null, 0, null)
ceo.manager = true

// Dept heads sized by share; each dept then grows breadth-first until its quota is met
for (const d of DEPARTMENTS) {
  const quota = Math.round((TARGET - 1) * d.share)
  const head = add(ceo, 1, d)
  head.manager = true
  let made = 1
  const queue = [head]
  const leaves = []
  while (made < quota) {
    // Ran out of managers before the quota: promote a shallow IC to grow a new team
    if (!queue.length) {
      const i = leaves.findIndex((l) => l.depth < MANAGER_P.length - 1 && l.children === 0)
      const [promoted] = leaves.splice(i, 1)
      promoted.manager = true
      queue.push(promoted)
    }
    const m = queue.shift()
    const span = m.depth === 1 ? between(4, 7) : between(3, 9)
    for (let i = 0; i < span && made < quota; i++) {
      const c = add(m, m.depth + 1, d)
      made++
      if (rand() < (MANAGER_P[c.depth] ?? 0)) {
        c.manager = true
        queue.push(c)
      } else {
        leaves.push(c)
      }
    }
  }
}

function salaryFor(p) {
  if (p.children > 0) {
    const base = MGMT_PAY[Math.min(p.depth, MGMT_PAY.length - 1)]
    return Math.round((base * (0.9 + rand() * 0.25)) / 500) * 500
  }
  const base = p.dept.base * (0.75 + rand() * 0.6)
  return Math.round(base / 500) * 500
}

function titleFor(p) {
  if (p.depth === 0) return MGMT_TITLES[0]
  if (p.depth === 1) return `SVP, ${p.dept.name}`
  if (p.children > 0) return `${MGMT_TITLES[Math.min(p.depth, MGMT_TITLES.length - 1)]}, ${p.dept.name}`
  return pick(p.dept.ic)
}

const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const lines = ['Employee Id,Name,Job Title,Department,Location,Salary,Manager Id']
for (const p of people) {
  lines.push(
    [
      p.id,
      `${pick(FIRST)} ${pick(LAST)}`,
      titleFor(p),
      p.dept ? p.dept.name : 'Executive',
      p.depth <= 1 ? 'Toronto' : pick(LOCATIONS),
      salaryFor(p),
      p.parent ? p.parent.id : '',
    ]
      .map(esc)
      .join(','),
  )
}

writeFileSync(OUT, lines.join('\n') + '\n')
console.log(`Wrote ${people.length.toLocaleString()} people to ${OUT}`)

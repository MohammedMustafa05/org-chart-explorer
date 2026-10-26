import { reactive, shallowRef, ref, markRaw } from 'vue'
import { parseCsv } from './csv.js'
import { buildOrg, pathTo } from './hierarchy.js'
import { SERIES, OTHER } from './format.js'

// The org itself is large and immutable once built, so it lives in a
// shallowRef: Vue never walks its 40k nodes or typed arrays. Expansion state
// is a plain Set plus a version counter that views watch.
export const org = shallowRef(null)
export const expandedVersion = ref(0)
const expanded = new Set()

export const ui = reactive({
  status: 'idle', // idle | loading | ready | error | mapping
  error: '',
  fileName: '',
  view: typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'chart',
  selected: -1,
  scope: -1, // analytics subtree
  focusRequest: 0, // bumped to ask the chart to centre on ui.selected
  loadMs: 0,
  loadId: 0, // bumped per loaded file so views remount cleanly
  pending: null, // { rows, headers, cols } awaiting manual column mapping
  progress: null, // { loaded, total } bytes while the default file downloads
  source: null, // last URL list, so a failed load can be retried
})

export const deptColor = new Map()

export function isExpanded(v) {
  return expanded.has(v)
}

export function toggle(v) {
  if (expanded.has(v)) expanded.delete(v)
  else expanded.add(v)
  expandedVersion.value++
}

export function collapseAll() {
  expanded.clear()
  if (org.value) expanded.add(org.value.root)
  expandedVersion.value++
}

/** Expand breadth-first, one more layer at a time, without exceeding `cap` visible nodes. */
export function expandNextLevel(cap = 3000) {
  const o = org.value
  if (!o) return
  let frontier = [o.root]
  let visible = 1
  // walk the currently open part to find the first closed layer
  while (frontier.length) {
    const next = []
    let anyClosed = false
    for (const v of frontier) {
      if (o.childCount[v] === 0) continue
      if (!expanded.has(v)) anyClosed = true
      else for (let k = o.childStart[v]; k < o.childStart[v + 1]; k++) next.push(o.childList[k])
    }
    visible += next.length
    if (anyClosed) break
    frontier = next
  }
  for (const v of frontier) {
    if (o.childCount[v] === 0 || expanded.has(v)) continue
    if (visible + o.childCount[v] > cap) break
    expanded.add(v)
    visible += o.childCount[v]
  }
  expandedVersion.value++
}

export function reveal(v) {
  const o = org.value
  for (const x of pathTo(o, v).slice(0, -1)) expanded.add(x)
  expandedVersion.value++
  ui.selected = v
  ui.focusRequest++
}

export function select(v) {
  ui.selected = v
}

export function analyze(v) {
  ui.scope = v
  ui.view = 'analytics'
}

// Tries each URL in turn. A missing file comes back from the Vite dev server
// as index.html with a 200, so HTML responses count as misses too.
export async function loadFromUrl(urls, name) {
  ui.status = 'loading'
  ui.fileName = name
  ui.source = { urls, name }
  ui.progress = null
  try {
    for (const url of [].concat(urls)) {
      const res = await fetch(url).catch(() => null)
      if (!res?.ok || res.headers.get('content-type')?.includes('text/html')) continue
      loadText(await readWithProgress(res), name)
      return
    }
    throw new Error(`${name} couldn't be downloaded. Check your connection and try again, or load a CSV from your computer.`)
  } catch (e) {
    ui.status = 'error'
    ui.error = e.message
  } finally {
    ui.progress = null
  }
}

export function retryLoad() {
  if (ui.source) loadFromUrl(ui.source.urls, ui.source.name)
}

// Streams the body so the loading screen can show how much has arrived.
// A compressed response's Content-Length isn't the decoded size, so the
// total is only trusted for uncompressed responses.
async function readWithProgress(res) {
  if (!res.body) return res.text()
  const total = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    ui.progress = { loaded, total }
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer())
}

export function loadText(text, name) {
  ui.status = 'loading'
  ui.fileName = name
  // Defer so the loading state paints before the parse blocks the thread
  setTimeout(() => {
    try {
      const parsed = parseCsv(text)
      if (parsed.missing.length) {
        ui.pending = markRaw(parsed)
        ui.status = 'mapping'
        return
      }
      finish(parsed.rows, parsed.cols)
    } catch (e) {
      ui.status = 'error'
      ui.error = e.message
    }
  }, 16)
}

export function applyMapping(cols) {
  const { rows } = ui.pending
  ui.pending = null
  finish(rows, cols)
}

function finish(rows, cols) {
  const t0 = performance.now()
  const built = buildOrg(rows, cols)
  ui.loadMs = performance.now() - t0
  if (built.root === -1) {
    ui.status = 'error'
    ui.error = 'No people found in that file.'
    return
  }
  // Colour follows the department, fixed by headcount rank at load time
  const tally = new Map()
  for (const p of built.people) if (!p.virtual) tally.set(p.department, (tally.get(p.department) ?? 0) + 1)
  deptColor.clear()
  ;[...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([d], i) => deptColor.set(d, SERIES[i] ?? OTHER))

  built.search = built.people.map((p) => `${p.name} ${p.title} ${p.department} ${p.id}`.toLowerCase())
  org.value = markRaw(built)
  expanded.clear()
  expanded.add(built.root)
  expandedVersion.value++
  // Below desktop the details panel overlays the chart, so start with nothing selected
  ui.selected = window.innerWidth >= 1024 ? built.root : -1
  ui.scope = built.root
  ui.loadId++
  ui.status = 'ready'
  applyHash()
}

// ---- URL state: #/view?person=<id>&scope=<id>, so views can be shared and
// the browser's back button steps between views and analytics scopes.
const VIEWS = ['chart', 'list', 'analytics']

export function hashFor() {
  const o = org.value
  const q = new URLSearchParams()
  if (ui.selected >= 0 && !o.people[ui.selected].virtual) q.set('person', o.people[ui.selected].id)
  if (ui.view === 'analytics' && ui.scope !== o.root && ui.scope >= 0) q.set('scope', o.people[ui.scope].id)
  const qs = q.toString()
  return `#/${ui.view}${qs ? '?' + qs : ''}`
}

export function applyHash() {
  const o = org.value
  if (!o) return
  const m = location.hash.match(/^#\/(\w+)(?:\?(.*))?$/)
  if (!m || !VIEWS.includes(m[1])) return
  const q = new URLSearchParams(m[2] ?? '')
  ui.view = m[1]
  const scope = o.indexById.get(q.get('scope'))
  ui.scope = scope ?? o.root
  const person = o.indexById.get(q.get('person'))
  if (person != null) reveal(person)
  else if (q.has('person') || ui.view === 'analytics') ui.selected = -1
}

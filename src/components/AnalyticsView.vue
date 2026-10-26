<script setup>
import { computed, ref } from 'vue'
import { treemap, hierarchy, treemapSquarify } from 'd3-hierarchy'
import { org, ui, reveal, select } from '../lib/store.js'
import { pathTo } from '../lib/hierarchy.js'
import { computeAnalytics, exportCsv } from '../lib/analytics.js'
import { count, money, moneyFull, ratio, pct, short, MGMT_COLOR, IC_COLOR, BLUE_RAMP } from '../lib/format.js'
import { showTip, hideTip } from '../lib/tooltip.js'

const o = org.value
const scope = computed(() => (ui.scope >= 0 ? ui.scope : o.root))
const a = computed(() => computeAnalytics(o, scope.value))
const leader = computed(() => o.people[scope.value])
const crumbs = computed(() => pathTo(o, scope.value))
const setScope = (v) => (ui.scope = v)

// ---- department cost (stacked management vs IC)
const maxDeptCost = computed(() => Math.max(1, ...a.value.depts.map((d) => d.mgmtCost + d.icCost)))
const showAllDepts = ref(false)
const depts = computed(() => (showAllDepts.value ? a.value.depts : a.value.depts.slice(0, 8)))

// ---- pyramid (managers left, ICs right, same headcount scale)
const maxLayer = computed(() => Math.max(1, ...a.value.layers.map((l) => Math.max(l.managers, l.ics))))
const topHeavy = computed(() => {
  const ls = a.value.layers
  if (ls.length < 3) return null
  const peak = ls.reduce((best, l) => (l.managers + l.ics > best.managers + best.ics ? l : best), ls[0])
  return peak.layer < ls.length / 2 - 1 ? 'top-heavy' : peak.layer >= ls.length - 2 ? 'bottom-heavy' : 'balanced'
})

// ---- span of control
const maxSpan = computed(() => Math.max(1, ...a.value.spans.map((s) => s.managers)))

// ---- heatmap (department x layer headcount), quantised into the blue ramp
const heatMax = computed(() => {
  let m = 1
  for (const row of a.value.heat.rows.values()) for (const x of row) if (x > m) m = x
  return m
})
function heatStep(x) {
  if (!x) return -1
  // log scale so a few huge cells don't wash out the rest
  return Math.min(BLUE_RAMP.length - 1, Math.floor((Math.log(x) / Math.log(heatMax.value + 1)) * BLUE_RAMP.length))
}
const heatLayers = computed(() => Math.min(a.value.heat.layerCount, 12))

// ---- treemap of sub-orgs, sized by cost, shaded by management share
const tmW = 1000
const tmH = 420
const tiles = computed(() => {
  const root = hierarchy({ children: a.value.subOrgs }).sum((d) => d.value ?? 0)
  treemap().size([tmW, tmH]).paddingInner(2).tile(treemapSquarify.ratio(1.3))(root)
  const shares = a.value.subOrgs.map((s) => s.mgmtShare)
  const lo = Math.min(...shares)
  const hi = Math.max(...shares)
  return root.leaves().map((n) => {
    const t = hi > lo ? (n.data.mgmtShare - lo) / (hi - lo) : 0.5
    const step = Math.round(1 + t * 4) // steps 1..5 of the ramp
    return { ...n.data, x: n.x0, y: n.y0, w: n.x1 - n.x0, h: n.y1 - n.y0, fill: BLUE_RAMP[step], dark: step >= 3 }
  })
})

function download() {
  const blob = new Blob([exportCsv(o, scope.value)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${leader.value.name.replace(/\s+/g, '-').toLowerCase()}-org-metrics.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function openPerson(v) {
  select(v)
}
function showInChart(v) {
  ui.view = 'chart'
  reveal(v)
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-6">
      <!-- scope -->
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <nav class="mb-1 flex flex-wrap items-center gap-1 text-xs text-ink-3" aria-label="Scope">
            <template v-for="(x, i) in crumbs" :key="x">
              <button class="rounded px-1 hover:bg-black/5 hover:text-ink" @click="setScope(x)">{{ o.people[x].name }}</button>
              <span v-if="i < crumbs.length - 1">›</span>
            </template>
          </nav>
          <h1 class="text-xl font-semibold md:text-2xl">{{ leader.virtual ? 'Whole company' : `${leader.name}'s organization` }}</h1>
          <p class="text-sm text-ink-2">{{ count(a.people) }} people report into {{ leader.virtual ? 'the company' : leader.name.split(' ')[0] }} across {{ a.layerCount }} layers</p>
        </div>
        <div class="flex gap-2">
          <button v-if="scope !== o.root" class="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-medium hover:border-ink" @click="setScope(o.root)">Whole company</button>
          <button class="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/85" @click="download">Export CSV</button>
        </div>
      </div>

      <!-- KPI tiles -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div class="rounded-xl border border-black/10 bg-white p-4">
          <div class="text-[11px] font-medium uppercase tracking-wide text-ink-3">Total cost</div>
          <div class="mt-1 text-2xl font-semibold">{{ money(a.totalCost) }}</div>
          <div class="text-xs text-ink-2">{{ money(a.totalCost / Math.max(1, a.people)) }} per person</div>
        </div>
        <div class="rounded-xl border border-black/10 bg-white p-4">
          <div class="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3"><span class="h-2 w-2 rounded-sm" :style="{ background: MGMT_COLOR }" />Management</div>
          <div class="mt-1 text-2xl font-semibold">{{ money(a.mgmtCost) }}</div>
          <div class="text-xs text-ink-2">{{ count(a.managers) }} managers</div>
        </div>
        <div class="rounded-xl border border-black/10 bg-white p-4">
          <div class="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3"><span class="h-2 w-2 rounded-sm" :style="{ background: IC_COLOR }" />IC cost</div>
          <div class="mt-1 text-2xl font-semibold">{{ money(a.icCost) }}</div>
          <div class="text-xs text-ink-2">{{ count(a.ics) }} individual contributors</div>
        </div>
        <div class="rounded-xl border border-black/10 bg-white p-4">
          <div class="text-[11px] font-medium uppercase tracking-wide text-ink-3">Mgmt cost ratio</div>
          <div class="mt-1 text-2xl font-semibold">{{ ratio(a.ratio) }}</div>
          <div class="text-xs text-ink-2">IC $ per management $</div>
        </div>
        <div class="rounded-xl border border-black/10 bg-white p-4">
          <div class="text-[11px] font-medium uppercase tracking-wide text-ink-3">Avg span</div>
          <div class="mt-1 text-2xl font-semibold">{{ a.avgSpan.toFixed(1) }}</div>
          <div class="text-xs text-ink-2">direct reports per manager</div>
        </div>
        <div class="rounded-xl border border-black/10 bg-white p-4">
          <div class="text-[11px] font-medium uppercase tracking-wide text-ink-3">Layers</div>
          <div class="mt-1 text-2xl font-semibold">{{ a.layerCount }}</div>
          <div class="text-xs text-ink-2">{{ topHeavy ? topHeavy : 'below the leader' }}</div>
        </div>
      </div>

      <!-- treemap -->
      <section v-if="a.subOrgs.length > 1" class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 class="font-semibold">Where the money goes</h2>
            <p class="text-xs text-ink-2">Each tile is a direct report's whole org, sized by cost. Darker tiles spend a larger share on management. Click to drill in.</p>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-ink-3">
            Lower mgmt share
            <span class="flex h-2 overflow-hidden rounded-sm"><span v-for="c in BLUE_RAMP.slice(1, 6)" :key="c" class="w-4" :style="{ background: c }" /></span>
            Higher
          </div>
        </div>
        <div class="relative w-full" :style="{ aspectRatio: `${tmW} / ${tmH}` }">
          <button
            v-for="t in tiles"
            :key="t.v"
            class="absolute overflow-hidden rounded-[4px] p-2 text-left transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            :style="{ left: (t.x / tmW) * 100 + '%', top: (t.y / tmH) * 100 + '%', width: (t.w / tmW) * 100 + '%', height: (t.h / tmH) * 100 + '%', background: t.fill, color: t.dark ? '#fff' : '#0b0b0b' }"
            :aria-label="`${o.people[t.v].name}: ${money(t.value)}`"
            @click="o.childCount[t.v] > 0 ? setScope(t.v) : openPerson(t.v)"
            @mousemove="showTip($event, o.people[t.v].name, [
              { label: 'Org cost', value: moneyFull(t.value) },
              { label: 'People', value: count(t.people) },
              { label: 'Mgmt share', value: pct(t.mgmtShare) },
            ])"
            @mouseleave="hideTip"
          >
            <template v-if="t.w > 90 && t.h > 44">
              <div class="truncate text-xs font-semibold">{{ o.people[t.v].name }}</div>
              <div class="truncate text-[11px] opacity-80">{{ money(t.value) }} · {{ count(t.people) }}</div>
            </template>
          </button>
        </div>
      </section>

      <div class="grid gap-5 lg:grid-cols-2">
        <!-- department cost -->
        <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
          <div class="mb-3 flex items-baseline justify-between gap-2">
            <h2 class="font-semibold">Cost by department</h2>
            <div class="flex gap-3 text-[11px] text-ink-2">
              <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: MGMT_COLOR }" />Management</span>
              <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: IC_COLOR }" />IC</span>
            </div>
          </div>
          <div class="space-y-2.5">
            <div
              v-for="d in depts"
              :key="d.name"
              class="grid grid-cols-[150px_1fr_56px] items-center gap-3 text-sm"
              @mousemove="showTip($event, d.name, [
                { label: 'Management', value: moneyFull(d.mgmtCost), color: MGMT_COLOR },
                { label: 'IC', value: moneyFull(d.icCost), color: IC_COLOR },
                { label: 'Mgmt share', value: pct(d.mgmtCost / Math.max(1, d.mgmtCost + d.icCost)) },
                { label: 'Managers / ICs', value: `${count(d.managers)} / ${count(d.ics)}` },
              ])"
              @mouseleave="hideTip"
            >
              <div class="truncate text-ink-2">{{ d.name }}</div>
              <div class="flex h-4 gap-[2px]" :style="{ width: ((d.mgmtCost + d.icCost) / maxDeptCost) * 100 + '%' }">
                <div class="h-full" :style="{ width: (d.mgmtCost / Math.max(1, d.mgmtCost + d.icCost)) * 100 + '%', background: MGMT_COLOR }" />
                <div class="h-full flex-1 rounded-r" :style="{ background: IC_COLOR }" />
              </div>
              <div class="tabular text-right text-xs font-medium">{{ money(d.mgmtCost + d.icCost) }}</div>
            </div>
          </div>
          <button v-if="a.depts.length > 8" class="mt-3 text-xs font-medium text-ink-2 hover:text-ink" @click="showAllDepts = !showAllDepts">
            {{ showAllDepts ? 'Show top 8' : `Show all ${a.depts.length}` }}
          </button>
        </section>

        <!-- pyramid -->
        <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
          <div class="mb-3 flex items-baseline justify-between gap-2">
            <div>
              <h2 class="font-semibold">Layer pyramid</h2>
              <p class="text-xs text-ink-2">Headcount at each layer below the leader<span v-if="topHeavy"> — this org looks <b class="font-semibold text-ink">{{ topHeavy }}</b></span></p>
            </div>
          </div>
          <div class="mb-1 grid grid-cols-[1fr_44px_1fr] text-[11px] text-ink-3">
            <span class="flex items-center justify-end gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: MGMT_COLOR }" />Managers</span>
            <span />
            <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: IC_COLOR }" />ICs</span>
          </div>
          <div class="space-y-1.5">
            <div
              v-for="l in a.layers"
              :key="l.layer"
              class="grid grid-cols-[1fr_44px_1fr] items-center"
              @mousemove="showTip($event, `Layer ${l.layer + 1}`, [
                { label: 'Managers', value: count(l.managers), color: MGMT_COLOR },
                { label: 'ICs', value: count(l.ics), color: IC_COLOR },
                { label: 'Cost', value: money(l.cost) },
              ])"
              @mouseleave="hideTip"
            >
              <div class="flex justify-end">
                <div class="h-4 rounded-l" :style="{ width: (l.managers / maxLayer) * 100 + '%', background: MGMT_COLOR, minWidth: l.managers ? '2px' : 0 }" />
              </div>
              <div class="tabular text-center text-[11px] text-ink-3">L{{ l.layer + 1 }}</div>
              <div class="h-4 rounded-r" :style="{ width: (l.ics / maxLayer) * 100 + '%', background: IC_COLOR, minWidth: l.ics ? '2px' : 0 }" />
            </div>
          </div>
        </section>

        <!-- span of control -->
        <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
          <h2 class="font-semibold">Span of control</h2>
          <p class="mb-4 text-xs text-ink-2">Managers grouped by number of direct reports · average {{ a.avgSpan.toFixed(1) }}</p>
          <div class="flex h-44 items-end gap-2 border-b border-[#c3c2b7]">
            <div
              v-for="s in a.spans"
              :key="s.label"
              class="flex h-full flex-1 flex-col items-center justify-end"
              @mousemove="showTip($event, `${s.label} direct report${s.label === '1' ? '' : 's'}`, [
                { label: 'Managers', value: count(s.managers) },
                { label: 'Share', value: pct(s.managers / Math.max(1, a.managers)) },
              ])"
              @mouseleave="hideTip"
            >
              <span class="tabular mb-1 text-[11px] font-medium">{{ count(s.managers) }}</span>
              <div class="w-full max-w-[56px] rounded-t" :style="{ height: (s.managers / maxSpan) * 80 + '%', background: s.max <= 2 ? '#86b6ef' : MGMT_COLOR, minHeight: s.managers ? '2px' : 0 }" />
            </div>
          </div>
          <div class="mt-1.5 flex gap-2">
            <span v-for="s in a.spans" :key="s.label" class="tabular flex-1 text-center text-[11px] text-ink-3">{{ s.label }}</span>
          </div>
          <p class="mt-3 text-xs text-ink-2">Lighter bars: narrow spans (1–2 reports), often a sign of an extra layer.</p>
        </section>

        <!-- health flags -->
        <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
          <h2 class="font-semibold">Org design flags</h2>
          <p class="mb-3 text-xs text-ink-2">Places worth a closer look before the next planning cycle</p>
          <div class="space-y-4 text-sm">
            <div>
              <div class="flex items-baseline justify-between">
                <span class="font-medium">Managers with one direct report</span>
                <span class="tabular text-ink-2">{{ count(a.narrow.length) }}</span>
              </div>
              <p class="text-xs text-ink-3">{{ money(a.narrow.reduce((s, v) => s + o.people[v].salary, 0)) }} in salary for layers that may be collapsible</p>
              <ul class="mt-2 divide-y divide-line">
                <li v-for="v in a.narrow.slice(0, 4)" :key="v" class="flex items-center justify-between gap-2 py-1.5">
                  <button class="min-w-0 truncate text-left hover:underline" @click="showInChart(v)">{{ o.people[v].name }} <span class="text-ink-3">· {{ o.people[v].title }}</span></button>
                  <span class="tabular shrink-0 text-xs text-ink-2">{{ money(o.people[v].salary) }}</span>
                </li>
              </ul>
            </div>
            <div>
              <div class="flex items-baseline justify-between">
                <span class="font-medium">Managers with 13+ direct reports</span>
                <span class="tabular text-ink-2">{{ count(a.wide.length) }}</span>
              </div>
              <p class="text-xs text-ink-3">Very wide spans can leave reports without enough support</p>
              <ul class="mt-2 divide-y divide-line">
                <li v-for="v in a.wide.slice(0, 4)" :key="v" class="flex items-center justify-between gap-2 py-1.5">
                  <button class="min-w-0 truncate text-left hover:underline" @click="showInChart(v)">{{ o.people[v].name }} <span class="text-ink-3">· {{ o.people[v].title }}</span></button>
                  <span class="tabular shrink-0 text-xs text-ink-2">{{ o.childCount[v] }} reports</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <!-- heatmap -->
      <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
        <h2 class="font-semibold">Headcount by department and layer</h2>
        <p class="mb-3 text-xs text-ink-2">Spot which departments are deep, and where their people sit</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] table-fixed border-separate text-xs" style="border-spacing: 2px">
            <thead>
              <tr>
                <th class="w-44 text-left font-medium text-ink-3"></th>
                <th v-for="i in heatLayers" :key="i" class="tabular font-medium text-ink-3">L{{ i }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in a.heat.depts.slice(0, 12)" :key="d">
                <td class="truncate pr-2 text-ink-2">{{ d }}</td>
                <td
                  v-for="i in heatLayers"
                  :key="i"
                  class="tabular h-8 rounded-[4px] text-center"
                  :style="{
                    background: heatStep(a.heat.rows.get(d)[i - 1]) >= 0 ? BLUE_RAMP[heatStep(a.heat.rows.get(d)[i - 1])] : '#f4f3ef',
                    color: heatStep(a.heat.rows.get(d)[i - 1]) >= 3 ? '#fff' : '#0b0b0b',
                  }"
                  @mousemove="showTip($event, `${d} · layer ${i}`, [{ label: 'People', value: count(a.heat.rows.get(d)[i - 1] ?? 0) }])"
                  @mouseleave="hideTip"
                >
                  {{ a.heat.rows.get(d)[i - 1] ? short(a.heat.rows.get(d)[i - 1]) : '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

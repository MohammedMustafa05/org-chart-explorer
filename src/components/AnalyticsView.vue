<script setup>
import { computed, ref, watch } from 'vue'
import { treemap, hierarchy, treemapSquarify } from 'd3-hierarchy'
import { org, ui, reveal, select } from '../lib/store.js'
import { pathTo } from '../lib/hierarchy.js'
import { computeAnalytics, exportCsv, availableDimensions, SPAN_BUCKETS } from '../lib/analytics.js'
import { count, money, moneyFull, ratio, pct, short, SERIES, OTHER, MGMT_COLOR, IC_COLOR, BLUE_RAMP } from '../lib/format.js'
import { showTip, hideTip } from '../lib/tooltip.js'
import IcicleChart from './IcicleChart.vue'

const o = org.value
const dims = availableDimensions(o)
const groupBy = ref(dims[0]?.key ?? 'department')
const scope = computed(() => (ui.scope >= 0 ? ui.scope : o.root))
const a = computed(() => computeAnalytics(o, scope.value, groupBy.value))
const leader = computed(() => o.people[scope.value])
const crumbs = computed(() => pathTo(o, scope.value))
const setScope = (v) => (ui.scope = v)
const dimLabel = computed(() => dims.find((d) => d.key === groupBy.value)?.label ?? 'Group')

// ---- colour per group value: fixed slot order by company-wide headcount,
// so a value keeps its colour when the scope changes; past seven -> "Other"
const groupColors = computed(() => {
  const tally = new Map()
  for (const p of o.people) {
    if (p.virtual) continue
    const k = p[groupBy.value] || 'Unassigned'
    tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  const m = new Map()
  ;[...tally.entries()].sort((x, y) => y[1] - x[1]).forEach(([k], i) => m.set(k, i < 7 ? SERIES[i] : OTHER))
  return m
})
const colorOfPerson = (v) => (o.people[v].virtual ? '#52514e' : groupColors.value.get(o.people[v][groupBy.value] || 'Unassigned') ?? OTHER)
const legend = computed(() => {
  const named = [...groupColors.value.entries()].filter(([, c]) => c !== OTHER)
  return groupColors.value.size > named.length ? [...named, ['Other', OTHER]] : named
})

// ---- org map: treemap of direct reports' orgs, or an icicle of the hierarchy
const mapMode = ref('treemap')
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

// ---- hub: one breakdown chart at a time, grouped by a chosen dimension
const CHARTS = [
  { key: 'cost', label: 'Headcount cost' },
  { key: 'stacked', label: 'Stacked cost (salary + bonus)' },
  { key: 'avgSpan', label: 'Average span of control' },
  { key: 'layers', label: 'Headcount heatmap (layers)' },
  { key: 'layerSpan', label: 'Layers & span of control' },
]
const chart = ref('cost')
const asPct = ref(false)
const showTable = ref(false)
const showAll = ref(false)
watch([groupBy, chart], () => (showAll.value = false))

const rows = computed(() => (showAll.value ? a.value.groups : a.value.groups.slice(0, 12)))
const totalWithBonus = computed(() => a.value.totalCost + a.value.bonus)
const maxCost = computed(() => Math.max(1, ...a.value.groups.map((g) => (chart.value === 'stacked' ? g.salary + g.bonus : g.salary))))
const maxAvgSpan = computed(() => Math.max(1, ...a.value.groups.map((g) => g.avgSpan)))
const SALARY_COLOR = SERIES[2]
const BONUS_COLOR = SERIES[6]

const fmtCost = (v, total) => (asPct.value ? pct(v / Math.max(1, total)) : money(v))

// heatmaps: quantise into the blue ramp on a log scale so a few huge cells don't wash the rest out
function makeHeat(getRow, cols) {
  let max = 1
  for (const g of a.value.groups) for (let i = 0; i < cols; i++) max = Math.max(max, getRow(g)[i] ?? 0)
  return (x) => (x ? Math.min(BLUE_RAMP.length - 1, Math.floor((Math.log(x) / Math.log(max + 1)) * BLUE_RAMP.length)) : -1)
}
const layerCols = computed(() => Math.min(a.value.layerCount, 12))
const layerStep = computed(() => makeHeat((g) => g.byLayer, layerCols.value))
const spanStep = computed(() => makeHeat((g) => g.bySpan, SPAN_BUCKETS.length))
const cellText = (x, total) => (!x ? '' : asPct.value ? pct(x / Math.max(1, total)) : short(x))

// ---- pyramid & span distribution
const maxLayer = computed(() => Math.max(1, ...a.value.layers.map((l) => Math.max(l.managers, l.ics))))
const shape = computed(() => {
  const ls = a.value.layers
  if (ls.length < 3) return null
  const peak = ls.reduce((best, l) => (l.managers + l.ics > best.managers + best.ics ? l : best), ls[0])
  return peak.layer < ls.length / 2 - 1 ? 'top-heavy' : peak.layer >= ls.length - 3 ? 'bottom-heavy' : 'balanced'
})
const maxSpan = computed(() => Math.max(1, ...a.value.spans.map((s) => s.managers)))

function download() {
  const blob = new Blob([exportCsv(o, scope.value)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${leader.value.name.replace(/\s+/g, '-').toLowerCase()}-org-metrics.csv`
  link.click()
  URL.revokeObjectURL(url)
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
          <div class="text-xs text-ink-2">{{ shape ?? 'below the leader' }}</div>
        </div>
      </div>

      <!-- org map -->
      <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
        <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-semibold">Org map</h2>
            <p class="text-xs text-ink-2">
              <template v-if="mapMode === 'treemap'">Each tile is a direct report's whole org, sized by cost. Darker tiles spend a larger share on management.</template>
              <template v-else>The hierarchy as bands: each row is a layer, each width is that person's org cost. Coloured by {{ dimLabel.toLowerCase() }}.</template>
              Click to drill in.
            </p>
          </div>
          <div class="flex rounded-lg bg-black/5 p-0.5 text-xs font-medium">
            <button class="rounded-md px-2.5 py-1" :class="mapMode === 'treemap' ? 'bg-white shadow-sm' : 'text-ink-2'" @click="mapMode = 'treemap'">Treemap</button>
            <button class="rounded-md px-2.5 py-1" :class="mapMode === 'icicle' ? 'bg-white shadow-sm' : 'text-ink-2'" @click="mapMode = 'icicle'">Icicle</button>
          </div>
        </div>

        <template v-if="mapMode === 'treemap'">
          <div v-if="a.subOrgs.length" class="relative w-full" :style="{ aspectRatio: `${tmW} / ${tmH}` }">
            <button
              v-for="t in tiles"
              :key="t.v"
              class="absolute overflow-hidden rounded-[4px] p-2 text-left transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              :style="{ left: (t.x / tmW) * 100 + '%', top: (t.y / tmH) * 100 + '%', width: (t.w / tmW) * 100 + '%', height: (t.h / tmH) * 100 + '%', background: t.fill, color: t.dark ? '#fff' : '#0b0b0b' }"
              :aria-label="`${o.people[t.v].name}: ${money(t.value)}`"
              @click="o.childCount[t.v] > 0 ? setScope(t.v) : select(t.v)"
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
          <div class="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
            Lower mgmt share
            <span class="flex h-2 overflow-hidden rounded-sm"><span v-for="c in BLUE_RAMP.slice(1, 6)" :key="c" class="w-4" :style="{ background: c }" /></span>
            Higher
          </div>
        </template>

        <template v-else>
          <IcicleChart :scope="scope" :color-of="colorOfPerson" @drill="setScope" @pick="select" />
          <div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
            <span v-for="[name, c] in legend" :key="name" class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: c }" />{{ name }}</span>
          </div>
        </template>
      </section>

      <!-- hub: breakdown by dimension -->
      <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <h2 class="mr-auto font-semibold">Breakdown</h2>
          <select v-model="chart" class="rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-sm" aria-label="Chart">
            <option v-for="c in CHARTS" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
          <label class="flex items-center gap-1.5 text-sm text-ink-2">
            by
            <select v-model="groupBy" class="rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-sm text-ink" aria-label="Group by">
              <option v-for="d in dims" :key="d.key" :value="d.key">{{ d.label }}</option>
            </select>
          </label>
          <div v-if="chart !== 'avgSpan'" class="flex rounded-lg bg-black/5 p-0.5 text-xs font-medium" role="group" aria-label="Units">
            <button class="rounded-md px-2.5 py-1" :class="!asPct ? 'bg-white shadow-sm' : 'text-ink-2'" @click="asPct = false">#</button>
            <button class="rounded-md px-2.5 py-1" :class="asPct ? 'bg-white shadow-sm' : 'text-ink-2'" @click="asPct = true">%</button>
          </div>
        </div>

        <!-- cost bars (management vs IC, or salary vs bonus) -->
        <template v-if="(chart === 'cost' || chart === 'stacked') && !showTable">
          <div class="mb-3 flex gap-3 text-[11px] text-ink-2">
            <template v-if="chart === 'cost'">
              <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: MGMT_COLOR }" />Management</span>
              <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: IC_COLOR }" />IC</span>
            </template>
            <template v-else>
              <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: SALARY_COLOR }" />Salary</span>
              <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :style="{ background: BONUS_COLOR }" />Bonus</span>
            </template>
          </div>
          <div class="space-y-2.5">
            <div
              v-for="g in rows"
              :key="g.name"
              class="grid grid-cols-[minmax(0,170px)_1fr_64px] items-center gap-3 text-sm"
              @mousemove="showTip($event, g.name, chart === 'cost'
                ? [
                    { label: 'Management', value: moneyFull(g.mgmtCost), color: MGMT_COLOR },
                    { label: 'IC', value: moneyFull(g.icCost), color: IC_COLOR },
                    { label: 'Managers / ICs', value: `${count(g.managers)} / ${count(g.ics)}` },
                  ]
                : [
                    { label: 'Salary', value: moneyFull(g.salary), color: SALARY_COLOR },
                    { label: 'Bonus', value: moneyFull(g.bonus), color: BONUS_COLOR },
                    { label: 'People', value: count(g.people) },
                  ])"
              @mouseleave="hideTip"
            >
              <div class="truncate text-ink-2">{{ g.name }}</div>
              <div class="flex h-4 gap-[2px]" :style="{ width: ((chart === 'cost' ? g.salary : g.salary + g.bonus) / maxCost) * 100 + '%' }">
                <template v-if="chart === 'cost'">
                  <div class="h-full" :style="{ width: (g.mgmtCost / Math.max(1, g.salary)) * 100 + '%', background: MGMT_COLOR }" />
                  <div class="h-full flex-1 rounded-r" :style="{ background: IC_COLOR }" />
                </template>
                <template v-else>
                  <div class="h-full" :style="{ width: (g.salary / Math.max(1, g.salary + g.bonus)) * 100 + '%', background: SALARY_COLOR }" />
                  <div class="h-full flex-1 rounded-r" :style="{ background: BONUS_COLOR }" />
                </template>
              </div>
              <div class="tabular text-right text-xs font-medium">
                {{ chart === 'cost' ? fmtCost(g.salary, a.totalCost) : fmtCost(g.salary + g.bonus, totalWithBonus) }}
              </div>
            </div>
          </div>
          <p v-if="chart === 'stacked'" class="mt-3 text-xs text-ink-3">Bonus comes from the CSV's Bonus column. Every other cost figure in the app uses salary only, as the brief defines.</p>
        </template>

        <!-- average span -->
        <template v-else-if="chart === 'avgSpan' && !showTable">
          <div class="space-y-2.5">
            <div
              v-for="g in rows"
              :key="g.name"
              class="grid grid-cols-[minmax(0,170px)_1fr_48px] items-center gap-3 text-sm"
              @mousemove="showTip($event, g.name, [{ label: 'Average span', value: g.avgSpan.toFixed(2) }, { label: 'Managers', value: count(g.managers) }])"
              @mouseleave="hideTip"
            >
              <div class="truncate text-ink-2">{{ g.name }}</div>
              <div class="relative h-4">
                <div class="h-full rounded-r" :style="{ width: (g.avgSpan / maxAvgSpan) * 100 + '%', background: MGMT_COLOR }" />
                <div class="absolute inset-y-[-3px] w-px bg-ink" :style="{ left: (a.avgSpan / maxAvgSpan) * 100 + '%' }" />
              </div>
              <div class="tabular text-right text-xs font-medium">{{ g.avgSpan.toFixed(1) }}</div>
            </div>
          </div>
          <p class="mt-3 flex items-center gap-1.5 text-xs text-ink-3"><span class="inline-block h-3 w-px bg-ink" /> Average for this whole org: {{ a.avgSpan.toFixed(2) }}</p>
        </template>

        <!-- heatmaps -->
        <div v-else-if="(chart === 'layers' || chart === 'layerSpan') && !showTable" class="overflow-x-auto">
          <table class="w-full min-w-[560px] table-fixed border-separate text-xs" style="border-spacing: 2px">
            <thead>
              <tr>
                <th class="w-44 text-left font-medium text-ink-3">{{ dimLabel }}</th>
                <template v-if="chart === 'layers'">
                  <th v-for="i in layerCols" :key="i" class="tabular font-medium text-ink-3">L{{ i }}</th>
                </template>
                <template v-else>
                  <th v-for="b in SPAN_BUCKETS" :key="b.label" class="tabular font-medium text-ink-3">1:{{ b.label }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in rows" :key="g.name">
                <td class="truncate pr-2 text-ink-2">{{ g.name }}</td>
                <template v-if="chart === 'layers'">
                  <td
                    v-for="i in layerCols"
                    :key="i"
                    class="tabular h-8 rounded-[4px] text-center"
                    :style="{ background: layerStep(g.byLayer[i - 1]) >= 0 ? BLUE_RAMP[layerStep(g.byLayer[i - 1])] : '#f4f3ef', color: layerStep(g.byLayer[i - 1]) >= 3 ? '#fff' : '#0b0b0b' }"
                    @mousemove="showTip($event, `${g.name} · layer ${i}`, [{ label: 'People', value: count(g.byLayer[i - 1] ?? 0) }])"
                    @mouseleave="hideTip"
                  >
                    {{ cellText(g.byLayer[i - 1], g.people) }}
                  </td>
                </template>
                <template v-else>
                  <td
                    v-for="(b, i) in SPAN_BUCKETS"
                    :key="b.label"
                    class="tabular h-8 rounded-[4px] text-center"
                    :style="{ background: spanStep(g.bySpan[i]) >= 0 ? BLUE_RAMP[spanStep(g.bySpan[i])] : '#f4f3ef', color: spanStep(g.bySpan[i]) >= 3 ? '#fff' : '#0b0b0b' }"
                    @mousemove="showTip($event, `${g.name} · span 1:${b.label}`, [{ label: 'Managers', value: count(g.bySpan[i]) }])"
                    @mouseleave="hideTip"
                  >
                    {{ cellText(g.bySpan[i], g.managers) }}
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-xs text-ink-3">
            {{ chart === 'layers' ? 'People at each layer below the leader.' : 'Managers by number of direct reports.' }}
            <template v-if="asPct">Percentages are within each row.</template>
          </p>
        </div>

        <!-- table view of the same numbers -->
        <div v-if="showTable" class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead class="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <tr class="border-b border-line">
                <th class="py-2 font-medium">{{ dimLabel }}</th>
                <th class="py-2 text-right font-medium">People</th>
                <th class="py-2 text-right font-medium">Managers</th>
                <th class="py-2 text-right font-medium">Mgmt cost</th>
                <th class="py-2 text-right font-medium">IC cost</th>
                <th class="py-2 text-right font-medium">Salary</th>
                <th class="py-2 text-right font-medium">Bonus</th>
                <th class="py-2 text-right font-medium">Avg span</th>
              </tr>
            </thead>
            <tbody class="tabular">
              <tr v-for="g in rows" :key="g.name" class="border-b border-line/70">
                <td class="py-2 text-ink-2">{{ g.name }}</td>
                <td class="py-2 text-right">{{ count(g.people) }}</td>
                <td class="py-2 text-right">{{ count(g.managers) }}</td>
                <td class="py-2 text-right">{{ fmtCost(g.mgmtCost, a.totalCost) }}</td>
                <td class="py-2 text-right">{{ fmtCost(g.icCost, a.totalCost) }}</td>
                <td class="py-2 text-right">{{ fmtCost(g.salary, a.totalCost) }}</td>
                <td class="py-2 text-right">{{ fmtCost(g.bonus, a.bonus) }}</td>
                <td class="py-2 text-right">{{ g.avgSpan.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <label class="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input v-model="showTable" type="checkbox" class="peer sr-only" />
            <span class="relative h-5 w-9 rounded-full bg-black/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink" />
            Show table
          </label>
          <button v-if="a.groups.length > 12" class="text-xs font-medium text-ink-2 hover:text-ink" @click="showAll = !showAll">
            {{ showAll ? 'Show top 12' : `Show all ${a.groups.length}` }}
          </button>
        </div>
      </section>

      <div class="grid gap-5 lg:grid-cols-2">
        <!-- pyramid -->
        <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
          <h2 class="font-semibold">Pyramid</h2>
          <p class="mb-3 text-xs text-ink-2">Headcount at each layer below the leader<span v-if="shape"> — this org looks <b class="font-semibold text-ink">{{ shape }}</b></span></p>
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
          <h2 class="font-semibold">Span of control distribution</h2>
          <p class="mb-4 text-xs text-ink-2">Managers grouped by number of direct reports · average {{ a.avgSpan.toFixed(1) }}</p>
          <div class="flex h-44 items-end gap-2 border-b border-[#c3c2b7]">
            <div
              v-for="s in a.spans"
              :key="s.label"
              class="flex h-full flex-1 flex-col items-center justify-end"
              @mousemove="showTip($event, `1:${s.label}`, [
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
            <span v-for="s in a.spans" :key="s.label" class="tabular flex-1 text-center text-[11px] text-ink-3">1:{{ s.label }}</span>
          </div>
          <p class="mt-3 text-xs text-ink-2">Lighter bars: narrow spans (1–2 reports), often a sign of an extra layer.</p>
        </section>
      </div>

      <!-- flags -->
      <section class="rounded-xl border border-black/10 bg-white p-4 md:p-5">
        <h2 class="font-semibold">Org design flags</h2>
        <p class="mb-3 text-xs text-ink-2">Places worth a closer look before the next planning cycle</p>
        <div class="grid gap-5 text-sm md:grid-cols-2">
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
  </div>
</template>

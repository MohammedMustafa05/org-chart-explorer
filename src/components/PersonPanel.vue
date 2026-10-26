<script setup>
import { computed } from 'vue'
import { org, ui, reveal, analyze, deptColor } from '../lib/store.js'
import { pathTo, managementCostRatio } from '../lib/hierarchy.js'
import { count, money, moneyFull, ratio, initials, onColor, OTHER, MGMT_COLOR, IC_COLOR } from '../lib/format.js'

defineEmits(['close'])
const o = org.value
const v = computed(() => ui.selected)
const p = computed(() => o.people[v.value])
const chain = computed(() => pathTo(o, v.value).slice(0, -1))
const mcr = computed(() => managementCostRatio(o, v.value))
const below = computed(() => o.managementCost[v.value] + o.icCost[v.value])
const mgmtShare = computed(() => (below.value ? o.managementCost[v.value] / below.value : 0))
const ics = computed(() => o.descendants[v.value] - o.nonLeafDescendants[v.value])
const color = computed(() => (p.value.virtual ? '#0b0b0b' : deptColor.get(p.value.department) ?? OTHER))
</script>

<template>
  <aside class="flex h-full flex-col overflow-y-auto bg-white">
    <div class="flex items-start gap-3 border-b border-line p-4 pt-2 md:p-5">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold" :style="{ background: color, color: onColor(color) }" aria-hidden="true">
        {{ initials(p.name) }}
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-lg font-semibold leading-tight">{{ p.name }}</h2>
        <p class="text-sm text-ink-2">{{ p.title }}</p>
        <p class="mt-1 text-xs text-ink-3">
          <span v-if="p.department">{{ p.department }}</span>
          <span v-if="p.location"> · {{ p.location }}</span>
          <span v-if="!p.virtual"> · {{ moneyFull(p.salary) }}</span>
        </p>
      </div>
      <button class="-mr-1 -mt-1 rounded-lg p-2.5 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label="Close details" @click="$emit('close')">
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" /></svg>
      </button>
    </div>

    <div v-if="chain.length" class="border-b border-line px-4 py-3 md:px-5">
      <div class="mb-1.5 text-xs font-medium text-ink-3">Reports up to</div>
      <div class="flex flex-wrap items-center gap-1 text-xs">
        <template v-for="(x, i) in chain" :key="x">
          <button class="rounded-md px-1.5 py-1 text-ink-2 hover:bg-black/5 hover:text-ink" @click="reveal(x)">{{ o.people[x].name }}</button>
          <span v-if="i < chain.length - 1" class="text-ink-3">›</span>
        </template>
      </div>
    </div>

    <div v-if="o.childCount[v] > 0" class="grid grid-cols-2 gap-px border-b border-line bg-line">
      <div class="bg-white px-4 py-3 md:p-4">
        <div class="text-xs font-medium text-ink-3">Descendants</div>
        <div class="tabular mt-1 text-2xl font-semibold">{{ count(o.descendants[v]) }}</div>
        <div class="text-xs text-ink-2">{{ count(o.childCount[v]) }} direct</div>
      </div>
      <div class="bg-white px-4 py-3 md:p-4">
        <div class="text-xs font-medium text-ink-3">Non-leaf descendants</div>
        <div class="tabular mt-1 text-2xl font-semibold">{{ count(o.nonLeafDescendants[v]) }}</div>
        <div class="text-xs text-ink-2">{{ count(ics) }} individual contributors</div>
      </div>
    </div>

    <div class="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5">
      <div v-if="o.childCount[v] > 0">
        <div class="flex items-baseline justify-between">
          <span class="text-sm font-medium">Total cost</span>
          <span class="tabular text-lg font-semibold">{{ moneyFull(o.totalCost[v]) }}</span>
        </div>
        <p class="text-xs text-ink-3">Sum of every descendant's salary</p>
      </div>

      <div v-if="below > 0">
        <div class="flex h-2.5 w-full gap-[2px] overflow-hidden rounded">
          <div class="h-full rounded-l" :style="{ width: mgmtShare * 100 + '%', background: MGMT_COLOR }" />
          <div class="h-full flex-1 rounded-r" :style="{ background: IC_COLOR }" />
        </div>
        <dl class="mt-3 space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <dt class="flex items-center gap-2 text-ink-2"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: MGMT_COLOR }" />Management cost</dt>
            <dd class="tabular font-medium">{{ moneyFull(o.managementCost[v]) }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="flex items-center gap-2 text-ink-2"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: IC_COLOR }" />IC cost</dt>
            <dd class="tabular font-medium">{{ moneyFull(o.icCost[v]) }}</dd>
          </div>
          <div class="flex items-center justify-between border-t border-line pt-2">
            <dt class="text-ink-2" title="IC cost ÷ management cost among descendants">Management cost ratio</dt>
            <dd class="tabular font-semibold">{{ ratio(mcr) }}</dd>
          </div>
        </dl>
        <p class="mt-1 text-xs text-ink-3">
          {{ mcr == null ? 'No managers below this person.' : `$${mcr.toFixed(2)} of IC salary for every $1 of management salary.` }}
        </p>
      </div>
      <p v-else class="text-sm text-ink-2">Individual contributor — no one reports to {{ p.name.split(' ')[0] }}.</p>

      <div class="flex flex-wrap gap-2 pt-1">
        <button class="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:border-ink sm:py-1.5" @click="ui.view = 'chart'; reveal(v)">Show in org</button>
        <button v-if="o.childCount[v] > 0" class="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/85 sm:py-1.5" @click="analyze(v)">
          Analyze this org
        </button>
      </div>
    </div>
  </aside>
</template>

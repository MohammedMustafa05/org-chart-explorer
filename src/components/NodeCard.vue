<script setup>
import { computed } from 'vue'
import { org, deptColor } from '../lib/store.js'
import { managementCostRatio } from '../lib/hierarchy.js'
import { count, money, ratio, initials, onColor, tint, OTHER } from '../lib/format.js'

const props = defineProps({
  v: { type: Number, required: true },
  expanded: Boolean,
  selected: Boolean,
  compact: Boolean, // zoomed far out: show identity only
})
const emit = defineEmits(['toggle', 'select'])

const o = org.value
const p = computed(() => o.people[props.v])
const color = computed(() => (p.value.virtual ? '#0b0b0b' : deptColor.get(p.value.department) ?? OTHER))
const directs = computed(() => o.childCount[props.v])
// The CSV's level column when present, otherwise depth below the top
const level = computed(() => p.value.level || o.depth[props.v] - o.depth[o.root] + (o.people[o.root].virtual ? 0 : 1))
const metrics = computed(() => {
  const v = props.v
  return [
    ['Management cost', money(o.managementCost[v])],
    ['IC cost', money(o.icCost[v])],
    ['Total cost', money(o.totalCost[v])],
    ['Management cost ratio', ratio(managementCostRatio(o, v))],
  ]
})
</script>

<template>
  <div
    class="relative h-full w-full rounded-2xl border shadow-sm transition-shadow hover:shadow-md"
    :class="selected ? 'border-ink ring-2 ring-ink/80' : 'border-black/[0.08]'"
    :style="{ background: tint(color, 0.07) }"
  >
    <!-- The whole card selects; a sibling button (not a nested one) toggles reports -->
    <button
      class="absolute inset-0 rounded-2xl focus-visible:outline-offset-4"
      :aria-label="`${p.name}, ${p.title || 'no title'}. ${directs ? count(o.descendants[v]) + ' reports' : 'Individual contributor'}`"
      :aria-pressed="selected"
      @click.stop="emit('select', v)"
    />

    <div
      class="pointer-events-none absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-semibold ring-4 ring-plane"
      :class="compact ? 'h-20 w-20 text-2xl' : 'h-11 w-11 text-sm'"
      :style="{ background: color, color: onColor(color) }"
      aria-hidden="true"
    >
      {{ initials(p.name) }}
    </div>

    <div v-if="compact" class="pointer-events-none relative flex h-full flex-col items-center px-4 pt-14 text-center" aria-hidden="true">
      <div class="w-full truncate text-2xl font-semibold">{{ p.name }}</div>
      <div class="tabular mt-1 w-full truncate text-xl text-ink-2">{{ directs ? `${count(o.descendants[v])} people` : p.title }}</div>
    </div>

    <div v-else class="pointer-events-none relative flex h-full flex-col items-center px-3 pb-3 pt-7 text-center" aria-hidden="true">
      <div class="w-full truncate text-sm font-semibold leading-5">{{ p.name }}</div>
      <div class="w-full truncate text-xs leading-4 text-ink-3">{{ p.title || '—' }}</div>

      <div class="mt-2.5 flex w-full flex-col items-center gap-1 text-[11px] font-medium leading-none">
        <span v-if="p.department" class="max-w-full truncate rounded-full border px-2 py-[3px]" :style="{ borderColor: color, background: tint(color, 0.14) }">{{ p.department }}</span>
        <div class="flex max-w-full items-center justify-center gap-1">
          <span v-if="p.location" class="flex min-w-0 items-center gap-0.5 rounded-full px-2 py-1" :style="{ background: tint(color, 0.2) }">
            <svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 11s3.5-3.2 3.5-6a3.5 3.5 0 0 0-7 0c0 2.8 3.5 6 3.5 6Z" /><circle cx="6" cy="5" r="1.2" /></svg>
            <span class="truncate">{{ p.location }}</span>
          </span>
          <span class="shrink-0 rounded-full px-2 py-1" :style="{ background: tint(color, 0.2) }">Level {{ level }}</span>
        </div>
        <template v-if="directs">
          <span class="tabular rounded-full px-2 py-1" :style="{ background: tint(color, 0.2) }">{{ count(o.nonLeafDescendants[v]) }} managers below</span>
          <span v-for="[label, value] in metrics" :key="label" class="tabular rounded-full px-2 py-1" :style="{ background: tint(color, 0.2) }">{{ label }}: <b class="font-semibold">{{ value }}</b></span>
        </template>
        <span v-else class="tabular rounded-full px-2 py-1" :style="{ background: tint(color, 0.2) }">Salary: <b class="font-semibold">{{ money(p.salary) }}</b></span>
      </div>
    </div>

    <button
      v-if="directs > 0"
      class="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-1 whitespace-nowrap rounded-full font-semibold transition-colors before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-['']"
      :class="[expanded ? 'bg-ink text-white' : 'bg-ink/85 text-white hover:bg-ink', compact ? 'h-20 px-6 text-2xl' : 'h-8 px-3 text-xs']"
      :aria-label="`${expanded ? 'Collapse' : 'Expand'} ${directs} direct reports of ${p.name}`"
      :aria-expanded="expanded"
      @click.stop="emit('toggle', v)"
    >
      <span class="tabular">{{ count(directs) }} / {{ count(o.descendants[v]) }}</span>
      <svg class="transition-transform" aria-hidden="true" :class="[expanded ? 'rotate-180' : '', compact ? 'h-6 w-6' : 'h-3 w-3']" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 4.5 6 7.5 9 4.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>

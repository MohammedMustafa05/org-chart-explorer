<script setup>
import { computed } from 'vue'
import { org, deptColor } from '../lib/store.js'
import { count, money, initials, onColor, OTHER } from '../lib/format.js'

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
</script>

<template>
  <div
    class="group relative h-full w-full rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md"
    :class="selected ? 'border-ink ring-2 ring-ink/80' : 'border-black/10'"
  >
    <!-- The whole card selects; a sibling button (not a nested one) toggles reports -->
    <button
      class="absolute inset-0 rounded-xl focus-visible:outline-offset-4"
      :aria-label="`${p.name}, ${p.title || 'no title'}. ${directs ? count(o.descendants[v]) + ' reports' : 'Individual contributor'}`"
      :aria-pressed="selected"
      @click.stop="emit('select', v)"
    />
    <div class="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-xl" :style="{ background: color }" />

    <div v-if="compact" class="pointer-events-none relative flex h-full items-center gap-3 px-4" aria-hidden="true">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold" :style="{ background: color, color: onColor(color) }">
        {{ initials(p.name) }}
      </div>
      <div class="min-w-0">
        <div class="truncate text-xl font-semibold">{{ p.name }}</div>
        <div class="tabular text-lg text-ink-2">{{ count(o.descendants[v]) }} people</div>
      </div>
    </div>

    <div v-else class="pointer-events-none relative flex h-full flex-col px-4 pb-3 pt-4" aria-hidden="true">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold" :style="{ background: color, color: onColor(color) }">
          {{ initials(p.name) }}
        </div>
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold leading-tight">{{ p.name }}</div>
          <div class="truncate text-xs text-ink-2">{{ p.title || '—' }}</div>
        </div>
      </div>

      <div v-if="directs === 0" class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
        <span class="truncate text-ink-2">{{ p.department }}<span v-if="p.location" class="text-ink-3"> · {{ p.location }}</span></span>
        <span class="tabular shrink-0 font-semibold">{{ money(p.salary) }}</span>
      </div>
      <div v-else class="mt-auto grid grid-cols-3 gap-1 border-t border-line pt-2 text-center">
        <div>
          <div class="tabular text-sm font-semibold">{{ count(o.descendants[v]) }}</div>
          <div class="text-[10px] text-ink-3">Reports</div>
        </div>
        <div>
          <div class="tabular text-sm font-semibold">{{ count(o.nonLeafDescendants[v]) }}</div>
          <div class="text-[10px] text-ink-3">Managers</div>
        </div>
        <div>
          <div class="tabular text-sm font-semibold">{{ money(o.totalCost[v]) }}</div>
          <div class="text-[10px] text-ink-3">Org cost</div>
        </div>
      </div>
    </div>

    <button
      v-if="directs > 0"
      class="absolute -bottom-4 left-1/2 z-10 flex h-8 min-w-[2.75rem] -translate-x-1/2 items-center justify-center gap-1 rounded-full border px-3 text-xs font-semibold shadow-sm transition-colors before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-['']"
      :class="expanded ? 'border-ink bg-ink text-white' : 'border-black/15 bg-white text-ink hover:border-ink'"
      :aria-label="`${expanded ? 'Collapse' : 'Expand'} ${directs} direct reports of ${p.name}`"
      :aria-expanded="expanded"
      @click.stop="emit('toggle', v)"
    >
      <svg class="h-3 w-3 transition-transform" aria-hidden="true" :class="expanded ? 'rotate-180' : ''" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 4.5 6 7.5 9 4.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="tabular">{{ directs }}</span>
    </button>
  </div>
</template>

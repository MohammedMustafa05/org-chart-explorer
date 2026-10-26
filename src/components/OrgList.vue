<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { org, ui, expandedVersion, isExpanded, toggle, select } from '../lib/store.js'
import { count, money, initials, OTHER } from '../lib/format.js'
import { deptColor } from '../lib/store.js'

// Outline view: the expanded tree flattened into rows, virtualised so even a
// fully expanded 40k org scrolls smoothly (only ~30 rows are ever in the DOM).
const ROW = 56
const scroller = ref(null)
const scrollTop = ref(0)
const height = ref(600)

const rows = computed(() => {
  expandedVersion.value // re-flatten when anything opens or closes
  const o = org.value
  const out = []
  const stack = [o.root]
  while (stack.length) {
    const v = stack.pop()
    out.push(v)
    if (o.childCount[v] > 0 && isExpanded(v)) {
      for (let k = o.childStart[v + 1] - 1; k >= o.childStart[v]; k--) stack.push(o.childList[k])
    }
  }
  return out
})

const first = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW) - 8))
const last = computed(() => Math.min(rows.value.length, Math.ceil((scrollTop.value + height.value) / ROW) + 8))
const slice = computed(() => rows.value.slice(first.value, last.value))

const o = org.value
const rootDepth = o.depth[o.root]
const color = (v) => (o.people[v].virtual ? '#0b0b0b' : deptColor.get(o.people[v].department) ?? OTHER)

watch(
  () => ui.focusRequest,
  () =>
    nextTick(() => {
      const i = rows.value.indexOf(ui.selected)
      if (i >= 0 && scroller.value) scroller.value.scrollTop = Math.max(0, i * ROW - height.value / 3)
    }),
)

let ro
onMounted(() => {
  ro = new ResizeObserver(([e]) => (height.value = e.contentRect.height))
  ro.observe(scroller.value)
  const i = rows.value.indexOf(ui.selected)
  if (i > 0) scroller.value.scrollTop = Math.max(0, i * ROW - height.value / 3)
})
onBeforeUnmount(() => ro?.disconnect())

function onKey(e, v) {
  if (e.key === 'ArrowRight' && o.childCount[v] > 0 && !isExpanded(v)) toggle(v)
  else if (e.key === 'ArrowLeft' && isExpanded(v)) toggle(v)
  else if (e.key === 'Enter') select(v)
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <div class="grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3 sm:grid-cols-[1fr_140px_80px_80px_90px]">
      <div>Person</div>
      <div class="hidden sm:block">Department</div>
      <div class="text-right">Reports</div>
      <div class="text-right">Managers</div>
      <div class="hidden text-right sm:block">Org cost</div>
    </div>
    <div ref="scroller" class="relative flex-1 overflow-y-auto" @scroll="scrollTop = $event.target.scrollTop">
      <div :style="{ height: rows.length * ROW + 'px' }" class="relative">
        <div
          v-for="(v, i) in slice"
          :key="v"
          class="absolute inset-x-0 grid cursor-pointer grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-line/70 px-4 outline-none focus-visible:bg-black/5 sm:grid-cols-[1fr_140px_80px_80px_90px]"
          :class="ui.selected === v ? 'bg-[#2a78d6]/[0.07]' : 'hover:bg-black/[0.03]'"
          :style="{ top: (first + i) * ROW + 'px', height: ROW + 'px' }"
          tabindex="0"
          role="treeitem"
          :aria-expanded="o.childCount[v] > 0 ? isExpanded(v) : undefined"
          @click="select(v)"
          @keydown="onKey($event, v)"
        >
          <div class="flex min-w-0 items-center gap-2" :style="{ paddingLeft: Math.min(o.depth[v] - rootDepth, 12) * 18 + 'px' }">
            <button
              v-if="o.childCount[v] > 0"
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-black/10"
              :aria-label="isExpanded(v) ? 'Collapse' : 'Expand'"
              @click.stop="toggle(v)"
            >
              <svg class="h-3.5 w-3.5 transition-transform" :class="isExpanded(v) ? 'rotate-90' : ''" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4.5 3 7.5 6 4.5 9" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span v-else class="w-6 shrink-0" />
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" :style="{ background: color(v) }">
              {{ initials(o.people[v].name) }}
            </div>
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">{{ o.people[v].name }}</div>
              <div class="truncate text-xs text-ink-2">{{ o.people[v].title }}</div>
            </div>
          </div>
          <div class="hidden truncate text-xs text-ink-2 sm:block">{{ o.people[v].department }}</div>
          <template v-if="o.childCount[v] > 0">
            <div class="tabular text-right text-sm">{{ count(o.descendants[v]) }}</div>
            <div class="tabular text-right text-sm">{{ count(o.nonLeafDescendants[v]) }}</div>
            <div class="tabular hidden text-right text-sm sm:block">{{ money(o.totalCost[v]) }}</div>
          </template>
          <template v-else>
            <div class="text-right text-sm text-ink-3">—</div>
            <div class="text-right text-sm text-ink-3">—</div>
            <div class="hidden text-right text-xs text-ink-3 sm:block">IC</div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

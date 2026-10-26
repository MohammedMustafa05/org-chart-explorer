<script setup>
import { computed } from 'vue'
import { hierarchy, partition } from 'd3-hierarchy'
import { org } from '../lib/store.js'
import { childrenOf } from '../lib/hierarchy.js'
import { count, money, onColor } from '../lib/format.js'
import { showTip, hideTip } from '../lib/tooltip.js'

// Icicle: the org chart as stacked bands. Each row is a layer, and each
// person's width is the cost of their whole org (their salary + everyone
// below), so it reads as "where does the money sit" at every level at once.
const props = defineProps({
  scope: { type: Number, required: true },
  colorOf: { type: Function, required: true }, // person index -> colour
  rows: { type: Number, default: 5 }, // deeper layers are reached by drilling in
})
const emit = defineEmits(['drill', 'pick'])

const W = 1000
const ROW_H = 46

const cells = computed(() => {
  const o = org.value
  const top = o.depth[props.scope]
  // Only the first `rows` layers are drawn, so only those are materialised;
  // values come straight from the precomputed totals instead of re-summing.
  const root = hierarchy(props.scope, (v) => (o.depth[v] - top < props.rows - 1 ? childrenOf(o, v) : null))
  root.each((n) => {
    n.value = o.totalCost[n.data] + o.people[n.data].salary
  })
  partition().size([W, props.rows * ROW_H]).padding(1).round(false)(root)
  const out = []
  root.each((n) => {
    if (n.x1 - n.x0 < 1.2) return // sub-pixel slivers add DOM without adding information
    out.push({ v: n.data, x: n.x0, y: n.y0, w: n.x1 - n.x0, h: n.y1 - n.y0, depth: n.depth })
  })
  return out
})
const height = computed(() => Math.min(props.rows, 1 + Math.max(0, ...cells.value.map((c) => c.depth))) * ROW_H)

function tip(e, c) {
  const o = org.value
  const p = o.people[c.v]
  showTip(e, p.name, [
    { label: p.title || 'Person', value: '' },
    { label: 'Org cost', value: money(o.totalCost[c.v] + p.salary) },
    { label: 'People', value: count(o.descendants[c.v] + 1) },
  ])
}
</script>

<template>
  <div class="relative w-full overflow-hidden" :style="{ height: height + 'px' }" role="img" :aria-label="`Icicle chart of ${org.people[scope].name}'s organization by cost`">
    <button
      v-for="c in cells"
      :key="c.v"
      class="absolute overflow-hidden rounded-[3px] px-1.5 text-left text-[11px] leading-[44px] transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
      :style="{ left: (c.x / W) * 100 + '%', top: c.y + 'px', width: (c.w / W) * 100 + '%', height: c.h + 'px', background: colorOf(c.v), color: onColor(colorOf(c.v)) }"
      @click="org.childCount[c.v] > 0 && c.v !== scope ? emit('drill', c.v) : emit('pick', c.v)"
      @mousemove="tip($event, c)"
      @mouseleave="hideTip"
    >
      <span v-if="c.w > 110" class="block truncate font-medium">{{ org.people[c.v].name }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { tip } from '../lib/tooltip.js'

// Keep the tooltip on screen: flip left/up near the right/bottom edges
const style = computed(() => {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  const left = tip.x > w - 240 ? tip.x - 236 : tip.x + 14
  const top = tip.y > h - 160 ? tip.y - 120 : tip.y + 14
  return { left: `${left}px`, top: `${top}px` }
})
</script>

<template>
  <div
    v-if="tip.visible"
    class="pointer-events-none fixed z-50 min-w-[160px] max-w-[220px] rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-lg"
    :style="style"
  >
    <div class="mb-1 font-semibold text-ink">{{ tip.title }}</div>
    <div v-for="r in tip.rows" :key="r.label" class="flex items-center justify-between gap-3 py-0.5">
      <span class="flex items-center gap-1.5 text-ink-2">
        <span v-if="r.color" class="h-2 w-2 rounded-full" :style="{ background: r.color }" />
        {{ r.label }}
      </span>
      <span class="tabular font-medium text-ink">{{ r.value }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import OrgChart from './components/OrgChart.vue';
import AnalyticsView from './components/AnalyticsView.vue';
import SearchBox from './components/SearchBox.vue';
import { useOrg } from './store.js';
import { fmtInt } from './lib/format.js';

const { org, view, error, stats, loadDefault, loadCSV, expandTo } = useOrg();
const zoom = ref(1);

function setZoom(delta) {
  zoom.value = Math.min(1.4, Math.max(0.4, +(zoom.value + delta).toFixed(2)));
}

function onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadCSV(String(reader.result), file.name);
    e.target.value = '';
  };
  reader.readAsText(file);
}

// Load the provided Giga Corp CSV (falls back to the generated sample)
onMounted(() => setTimeout(loadDefault, 30));
</script>

<template>
  <header class="hdr gutter" style="padding-block: 10px">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="flex items-center gap-2 mr-2">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <rect x="8" y="1" width="6" height="5" rx="1.5" fill="var(--ink)" />
          <rect x="1" y="15" width="6" height="5" rx="1.5" fill="var(--accent)" />
          <rect x="15" y="15" width="6" height="5" rx="1.5" fill="var(--accent)" />
          <path d="M11 6v4.5M4 15v-4.5h14V15" stroke="var(--muted)" stroke-width="1.5" fill="none" />
        </svg>
        <span class="font-bold text-[15px]">Org Explorer</span>
        <span v-if="org" class="pill">{{ org.source }}</span>
      </div>

      <nav class="flex gap-1" role="tablist" aria-label="Views">
        <button class="tab" role="tab" :aria-selected="view === 'chart'" @click="view = 'chart'">Org chart</button>
        <button class="tab" role="tab" :aria-selected="view === 'analytics'" @click="view = 'analytics'">Cost analytics</button>
      </nav>

      <SearchBox />

      <label class="btn primary ml-auto">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 10V2M3.5 5.5 7 2l3.5 3.5M2 12h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
        </svg>
        Load CSV
        <input id="csv" type="file" accept=".csv,text/csv" class="sr-only" @change="onFile" />
      </label>
    </div>
  </header>

  <div class="gutter flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line" style="padding-block: 8px">
    <div v-if="org" class="text-[12.5px] text-muted">
      <span class="num text-ink">{{ fmtInt(org.count) }}</span> people ·
      tree built and every node's metrics computed in
      <span class="num text-ink">{{ org.ms.toFixed(1) }} ms</span> (one post-order pass)
      <span v-if="org.orphans"> · {{ org.orphans }} rows skipped (cyclic reporting lines)</span>
    </div>
    <div v-if="error" class="text-[12.5px]" style="color: var(--bad)">{{ error }}</div>

    <div v-if="view === 'chart' && org" class="flex flex-wrap items-center gap-2 ml-auto">
      <button class="btn" @click="expandTo(1)">Collapse all</button>
      <button class="btn" @click="expandTo(2)">Expand 2 levels</button>
      <button class="btn" @click="expandTo(3)">Expand 3 levels</button>
      <div class="flex items-center gap-1 ml-1">
        <button class="btn" aria-label="Zoom out" @click="setZoom(-0.1)">−</button>
        <span class="num text-xs w-11 text-center">{{ Math.round(zoom * 100) }}%</span>
        <button class="btn" aria-label="Zoom in" @click="setZoom(0.1)">+</button>
      </div>
    </div>
  </div>

  <div v-if="!org" class="flex-1 grid place-items-center text-muted">Loading Giga Corp…</div>

  <!-- v-show keeps the chart's expanded state and scroll position when switching tabs -->
  <OrgChart v-show="org && view === 'chart'" v-model:zoom="zoom" />
  <AnalyticsView v-if="org && view === 'analytics' && stats" />
</template>

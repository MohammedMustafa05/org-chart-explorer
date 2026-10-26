<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { org, ui, loadFromUrl, loadText, applyMapping, reveal, select } from './lib/store.js'
import { count, money, initials } from './lib/format.js'
import OrgChart from './components/OrgChart.vue'
import OrgList from './components/OrgList.vue'
import PersonPanel from './components/PersonPanel.vue'
import AnalyticsView from './components/AnalyticsView.vue'
import ChartTooltip from './components/ChartTooltip.vue'

// The CSV lives on the repo's `data` branch so `main` stays small enough to
// import into StackBlitz; a local copy in public/ is used when present.
const DATA_URL = 'https://raw.githubusercontent.com/MohammedMustafa05/org-chart-explorer/data/giga-corp.csv'
onMounted(() => loadFromUrl([`${import.meta.env.BASE_URL}giga-corp.csv`, DATA_URL], 'giga-corp.csv'))

// ---- search
const query = ref('')
const searchOpen = ref(false)
const active = ref(0)
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const o = org.value
  if (!o || q.length < 2) return []
  const out = []
  for (let i = 0; i < o.search.length && out.length < 8; i++) if (o.search[i].includes(q)) out.push(i)
  return out
})
function choose(v) {
  query.value = ''
  searchOpen.value = false
  if (ui.view === 'analytics') ui.view = 'chart'
  reveal(v)
}
function onSearchKey(e) {
  if (e.key === 'ArrowDown') active.value = Math.min(active.value + 1, results.value.length - 1)
  else if (e.key === 'ArrowUp') active.value = Math.max(active.value - 1, 0)
  else if (e.key === 'Enter' && results.value[active.value] != null) choose(results.value[active.value])
  else if (e.key === 'Escape') searchOpen.value = false
  else return
  e.preventDefault()
}

// ---- loading a different CSV (button or drag & drop)
const fileInput = ref(null)
const dragging = ref(false)
function readFile(file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => loadText(reader.result, file.name)
  reader.readAsText(file)
}
function onDrop(e) {
  dragging.value = false
  readFile(e.dataTransfer.files[0])
}

// ---- manual column mapping when headers aren't recognised
const FIELDS = [
  ['id', 'Employee ID', true],
  ['manager', 'Manager ID', true],
  ['name', 'Name'],
  ['title', 'Job title'],
  ['department', 'Department'],
  ['location', 'Location'],
  ['salary', 'Salary'],
]
const mapping = reactive({})
const mappingReady = computed(() => mapping.id && mapping.manager)
watch(
  () => ui.status,
  (s) => {
    if (s !== 'mapping') return
    for (const k of Object.keys(mapping)) delete mapping[k]
    Object.assign(mapping, ui.pending?.cols ?? {})
  },
)

const panelOpen = computed(() => ui.status === 'ready' && ui.selected >= 0 && ui.view !== 'analytics')
const views = [
  ['chart', 'Org chart'],
  ['list', 'List'],
  ['analytics', 'Cost analytics'],
]
</script>

<template>
  <div
    class="flex h-full flex-col"
    @dragover.prevent="dragging = true"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <!-- header -->
    <header class="z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-black/10 bg-white px-4 py-2.5 md:flex-nowrap">
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="6" height="4" rx="1" /><rect x="2" y="14" width="6" height="4" rx="1" /><rect x="12" y="14" width="6" height="4" rx="1" /><path d="M10 6v4M5 14v-2h10v2" /></svg>
        </div>
        <div class="leading-tight">
          <div class="text-sm font-semibold">Giga Corp</div>
          <div v-if="org" class="tabular text-[11px] text-ink-3">{{ count(org.realCount) }} people · {{ money(org.totalCost[org.root] + org.people[org.root].salary) }}</div>
        </div>
      </div>

      <nav class="order-3 flex w-full rounded-lg bg-black/5 p-0.5 text-sm md:order-none md:w-auto" aria-label="Views">
        <button
          v-for="[key, label] in views"
          :key="key"
          class="flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors md:flex-none"
          :class="ui.view === key ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink'"
          :aria-current="ui.view === key ? 'page' : undefined"
          @click="ui.view = key"
        >
          {{ label }}
        </button>
      </nav>

      <div class="relative ml-auto w-full max-w-xs flex-1 sm:w-auto">
        <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5" /><path d="m11 11 3 3" stroke-linecap="round" /></svg>
        <input
          v-model="query"
          :disabled="ui.status !== 'ready'"
          type="search"
          placeholder="Search people, titles, teams"
          class="w-full rounded-lg border border-black/10 bg-plane py-2 pl-9 pr-3 text-sm outline-none focus:border-ink/40 focus:bg-white"
          role="combobox"
          :aria-expanded="searchOpen && results.length > 0"
          @focus="searchOpen = true"
          @input="searchOpen = true; active = 0"
          @blur="searchOpen = false"
          @keydown="onSearchKey"
        />
        <ul v-if="searchOpen && results.length" class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg" role="listbox">
          <li
            v-for="(v, i) in results"
            :key="v"
            class="flex cursor-pointer items-center gap-2.5 px-3 py-2"
            :class="i === active ? 'bg-black/5' : ''"
            role="option"
            :aria-selected="i === active"
            @mousedown.prevent="choose(v)"
            @mouseenter="active = i"
          >
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/80 text-[10px] font-semibold text-white">{{ initials(org.people[v].name) }}</span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ org.people[v].name }}</span>
              <span class="block truncate text-xs text-ink-2">{{ org.people[v].title }} · {{ org.people[v].department }}</span>
            </span>
          </li>
        </ul>
      </div>

      <button class="hidden shrink-0 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium hover:border-ink sm:block" @click="fileInput.click()">
        Load CSV
      </button>
      <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="readFile($event.target.files[0])" />
    </header>

    <!-- body -->
    <main class="relative flex min-h-0 flex-1">
      <div v-if="ui.status === 'loading' || ui.status === 'idle'" class="flex flex-1 items-center justify-center text-sm text-ink-2">
        <div class="flex items-center gap-3">
          <span class="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
          Building the hierarchy for {{ ui.fileName || 'Giga Corp' }}…
        </div>
      </div>

      <div v-else-if="ui.status === 'error'" class="flex flex-1 items-center justify-center p-6">
        <div class="max-w-sm rounded-xl border border-black/10 bg-white p-6 text-center">
          <p class="font-medium">Couldn't load the org</p>
          <p class="mt-1 text-sm text-ink-2">{{ ui.error }}</p>
          <button class="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white" @click="fileInput.click()">Choose a CSV</button>
        </div>
      </div>

      <div v-else-if="ui.status === 'mapping'" class="flex flex-1 items-center justify-center p-6">
        <div class="w-full max-w-md rounded-xl border border-black/10 bg-white p-6">
          <p class="font-semibold">Match your columns</p>
          <p class="mt-1 text-sm text-ink-2">We couldn't recognise every column in {{ ui.fileName }}. Pick which column holds each field.</p>
          <div class="mt-4 space-y-3">
            <label v-for="[key, label, required] in FIELDS" :key="key" class="grid grid-cols-[120px_1fr] items-center gap-3 text-sm">
              <span>{{ label }}<span v-if="required" class="text-[#d03b3b]">*</span></span>
              <select v-model="mapping[key]" class="rounded-lg border border-black/15 bg-white px-2 py-1.5">
                <option :value="undefined">—</option>
                <option v-for="h in ui.pending.headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </label>
          </div>
          <button class="mt-5 w-full rounded-lg bg-ink py-2 text-sm font-medium text-white disabled:opacity-40" :disabled="!mappingReady" @click="applyMapping({ ...mapping })">
            Build org chart
          </button>
        </div>
      </div>

      <template v-else>
        <div class="min-w-0 flex-1">
          <OrgChart v-if="ui.view === 'chart'" :key="ui.loadId" />
          <OrgList v-else-if="ui.view === 'list'" :key="ui.loadId" />
          <AnalyticsView v-else :key="ui.loadId" />
        </div>

        <!-- details: side panel on desktop, bottom sheet on mobile -->
        <transition
          enter-from-class="translate-y-full md:translate-y-0 md:translate-x-full"
          leave-to-class="translate-y-full md:translate-y-0 md:translate-x-full"
          enter-active-class="transition-transform duration-200"
          leave-active-class="transition-transform duration-200"
        >
          <div
            v-if="panelOpen"
            class="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-hidden rounded-t-2xl border-t border-black/10 shadow-2xl md:static md:z-auto md:max-h-none md:w-[360px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none"
          >
            <PersonPanel :key="ui.selected" @close="select(-1)" />
          </div>
        </transition>
      </template>

      <div v-if="dragging" class="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-ink/40 bg-white/80 text-sm font-medium">
        Drop a CSV to load a different org
      </div>
    </main>

    <ChartTooltip />
  </div>
</template>

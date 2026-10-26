<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive, watch } from 'vue'
import { org, ui, loadFromUrl, loadText, applyMapping, reveal, select, retryLoad, hashFor, applyHash } from './lib/store.js'
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
function onWindowKey(e) {
  if (e.key === 'Escape' && panelOpen.value && !searchOpen.value) select(-1)
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey))

// ---- keep the URL in step: view and scope changes add a history entry,
// selecting a person just rewrites the current one
let lastKey = ''
watch(
  () => (ui.status === 'ready' ? hashFor() : null),
  (h) => {
    if (!h) return
    const key = `${ui.view}:${ui.scope}`
    const push = lastKey !== '' && key !== lastKey
    lastKey = key
    if (h !== location.hash) history[push ? 'pushState' : 'replaceState'](null, '', h)
  },
)
onMounted(() => window.addEventListener('popstate', applyHash))
onBeforeUnmount(() => window.removeEventListener('popstate', applyHash))

const mb = (b) => (b / 1e6).toFixed(1)
const loadingText = computed(() => {
  const p = ui.progress
  if (!p) return `Building the org for ${ui.fileName || 'Giga Corp'}…`
  return p.total ? `Downloading ${ui.fileName}: ${mb(p.loaded)} of ${mb(p.total)} MB` : `Downloading ${ui.fileName}: ${mb(p.loaded)} MB`
})

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
    <a href="#main" class="sr-only z-50 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-3 focus:top-3">Skip to content</a>

    <!-- header -->
    <header class="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/10 bg-white px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] md:flex-nowrap md:gap-x-4">
      <div class="flex min-w-0 items-center gap-2.5">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="6" height="4" rx="1" /><rect x="2" y="14" width="6" height="4" rx="1" /><rect x="12" y="14" width="6" height="4" rx="1" /><path d="M10 6v4M5 14v-2h10v2" /></svg>
        </div>
        <div class="min-w-0 leading-tight">
          <div class="text-sm font-semibold">Giga Corp</div>
          <div v-if="org" class="tabular text-xs text-ink-3">{{ count(org.realCount) }} people<span class="hidden sm:inline"> · {{ money(org.totalCost[org.root] + org.people[org.root].salary) }}</span></div>
        </div>
      </div>

      <nav class="order-3 flex w-full rounded-lg bg-black/5 p-0.5 text-sm md:order-none md:w-auto" aria-label="Views">
        <button
          v-for="[key, label] in views"
          :key="key"
          class="flex-1 whitespace-nowrap rounded-md px-2 py-2 font-medium transition-colors sm:px-3 md:flex-none md:py-1.5"
          :class="ui.view === key ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink'"
          :aria-current="ui.view === key ? 'page' : undefined"
          @click="ui.view = key"
        >
          {{ label }}
        </button>
      </nav>

      <div class="ml-auto min-w-0 max-w-xs flex-1 sm:relative">
        <div class="relative">
          <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5" /><path d="m11 11 3 3" stroke-linecap="round" /></svg>
          <input
            v-model="query"
            :disabled="ui.status !== 'ready'"
            type="search"
            placeholder="Search"
            aria-label="Search people, titles or departments"
            aria-autocomplete="list"
            aria-controls="search-results"
            :aria-activedescendant="searchOpen && results.length ? `search-option-${active}` : undefined"
            class="w-full rounded-lg border border-black/10 bg-plane py-2 pl-9 pr-3 text-base outline-none focus:border-ink/40 focus:bg-white focus-visible:outline-none sm:text-sm"
            role="combobox"
            :aria-expanded="searchOpen && query.trim().length >= 2"
            @focus="searchOpen = true"
            @input="searchOpen = true; active = 0"
            @blur="searchOpen = false"
            @keydown="onSearchKey"
          />
        </div>
        <ul v-if="searchOpen && query.trim().length >= 2" id="search-results" class="absolute inset-x-3 top-full z-30 mt-1 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg sm:inset-x-auto sm:right-0 sm:w-[22rem]" role="listbox">
          <li v-if="!results.length" class="px-3 py-3 text-sm text-ink-2" role="option" aria-disabled="true">No one matches “{{ query.trim() }}”. Try a name, job title or department.</li>
          <li
            v-for="(v, i) in results"
            :id="`search-option-${i}`"
            :key="v"
            class="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 sm:py-2"
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

      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 text-sm font-medium hover:border-ink sm:h-auto sm:w-auto sm:px-3 sm:py-2"
        aria-label="Load CSV"
        @click="fileInput.click()"
      >
        <svg class="h-4 w-4 sm:hidden" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 5l3-3 3 3M2 10v3h12v-3" /></svg>
        <span class="hidden sm:inline">Load CSV</span>
      </button>
      <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="readFile($event.target.files[0])" />
    </header>

    <!-- body -->
    <main id="main" tabindex="-1" class="relative flex min-h-0 flex-1 outline-none">
      <div v-if="ui.status === 'loading' || ui.status === 'idle'" class="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-2" role="status" aria-live="polite">
        <div class="w-full max-w-xs">
          <div class="flex items-center justify-center gap-3">
            <span class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-ink motion-reduce:animate-none" aria-hidden="true" />
            <span class="tabular">{{ loadingText }}</span>
          </div>
          <div v-if="ui.progress?.total" class="mt-3 h-1 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
            <div class="h-full origin-left bg-ink transition-transform duration-150" :style="{ transform: `scaleX(${ui.progress.loaded / ui.progress.total})` }" />
          </div>
        </div>
      </div>

      <div v-else-if="ui.status === 'error'" class="flex flex-1 items-center justify-center p-6">
        <div class="max-w-sm rounded-xl border border-black/10 bg-white p-6 text-center" role="alert">
          <p class="font-medium">Couldn't load the org</p>
          <p class="mt-1 text-sm text-ink-2">{{ ui.error }}</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <button v-if="ui.source" class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/85" @click="retryLoad">Try again</button>
            <button class="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:border-ink" @click="fileInput.click()">Choose a CSV</button>
          </div>
        </div>
      </div>

      <div v-else-if="ui.status === 'mapping'" class="flex flex-1 items-center justify-center p-6">
        <div class="w-full max-w-md rounded-xl border border-black/10 bg-white p-6">
          <p class="font-semibold">Match your columns</p>
          <p class="mt-1 text-sm text-ink-2">We couldn't recognise every column in {{ ui.fileName }}. Pick which column holds each field.</p>
          <div class="mt-4 space-y-3">
            <label v-for="[key, label, required] in FIELDS" :key="key" class="grid grid-cols-[minmax(0,110px)_1fr] items-center gap-3 text-sm">
              <span>{{ label }}<span v-if="required" class="text-[#d03b3b]">*</span></span>
              <select v-model="mapping[key]" class="min-w-0 rounded-lg border border-black/15 bg-white px-2 py-2 text-base sm:py-1.5 sm:text-sm">
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

        <!-- details: bottom sheet on phones, overlay drawer on tablets, side panel on desktop -->
        <transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity duration-200" leave-active-class="transition-opacity duration-150">
          <div v-if="panelOpen" class="fixed inset-0 z-30 bg-black/20 md:absolute lg:hidden" aria-hidden="true" @click="select(-1)" />
        </transition>
        <transition
          enter-from-class="translate-y-full md:translate-y-0 md:translate-x-full"
          leave-to-class="translate-y-full md:translate-y-0 md:translate-x-full"
          enter-active-class="transition-transform duration-200 ease-out"
          leave-active-class="transition-transform duration-150 ease-in"
        >
          <div
            v-if="panelOpen"
            class="fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl border-t border-black/10 bg-white shadow-2xl md:absolute md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[380px] md:rounded-none md:border-l md:border-t-0 lg:static lg:z-auto lg:w-[360px] lg:shrink-0 lg:shadow-none"
            role="dialog"
            aria-label="Person details"
          >
            <div class="flex justify-center pb-1 pt-2 md:hidden" aria-hidden="true"><span class="h-1 w-10 rounded-full bg-black/15" /></div>
            <PersonPanel :key="ui.selected" class="min-h-0 flex-1" @close="select(-1)" />
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

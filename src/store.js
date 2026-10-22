import { ref, shallowRef, reactive, computed, nextTick, markRaw } from 'vue';
import { buildOrg } from './lib/hierarchy.js';
import { recordsFromCSV } from './lib/csv.js';
import { generateGigaCorp } from './lib/sampleData.js';
import { computeStats } from './lib/analytics.js';

export const CHILD_LIMIT = 24;

/*
 * App-wide state. The 40k-node tree is held with shallowRef + markRaw so Vue
 * never proxies it; only the small UI state (expanded ids, limits, etc.) is reactive.
 */
const org = shallowRef(null);
const view = ref('chart');
const expanded = reactive(new Set());
const limits = reactive({});
const highlight = ref(null);
const scopeId = ref(null);
const error = ref('');
// Set by OrgChart so actions can scroll the canvas
const canvasEl = ref(null);

function load(o) {
  org.value = markRaw(o);
  expanded.clear();
  for (const k in limits) delete limits[k];
  expanded.add(o.root.id);
  scopeId.value = o.root.id;
  highlight.value = null;
  nextTick(centerCanvas);
}

function loadSample() {
  load(buildOrg(generateGigaCorp(40000), 'Giga Corp sample · 40k'));
}

function loadCSV(text, filename) {
  try {
    error.value = '';
    load(buildOrg(recordsFromCSV(text), filename));
    return true;
  } catch (err) {
    error.value = err.message;
    return false;
  }
}

/**
 * On start, load the provided Giga Corp CSV from public/data/giga-corp.csv.
 * If it isn't there (or can't be parsed), fall back to the generated sample
 * so the app always opens with data.
 */
async function loadDefault() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/giga-corp.csv`);
    const text = res.ok ? await res.text() : '';
    // Dev servers answer a missing file with index.html, so check it's really CSV
    if (text && !text.trimStart().startsWith('<') && loadCSV(text, 'Giga Corp · 40k')) return;
  } catch {
    // network or parse problem: use the sample below
  }
  loadSample();
}

function centerCanvas() {
  const el = canvasEl.value;
  if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
}

function toggle(n) {
  expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id);
}

function showMore(n) {
  limits[n.id] = (limits[n.id] || CHILD_LIMIT) + CHILD_LIMIT;
}

function analyze(n) {
  scopeId.value = n.id;
  view.value = 'analytics';
}

/** Expand every manager above `depth` levels (1 = only the root card). */
function expandTo(depth) {
  expanded.clear();
  const root = org.value.root;
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n.level - root.level < depth - 1 && n.children.length) {
      expanded.add(n.id);
      for (const c of n.children) stack.push(c);
    }
  }
  if (depth === 1) expanded.add(root.id);
  nextTick(centerCanvas);
}

/** Expand the path to a person, make sure they're within the shown children, and scroll to them. */
function reveal(n) {
  for (let c = n, p = n.parent; p; c = p, p = p.parent) {
    expanded.add(p.id);
    const idx = p.children.indexOf(c);
    if (idx >= (limits[p.id] || CHILD_LIMIT)) {
      limits[p.id] = Math.ceil((idx + 1) / CHILD_LIMIT) * CHILD_LIMIT;
    }
  }
  highlight.value = n.id;
  view.value = 'chart';
  nextTick(() => {
    const el = canvasEl.value?.querySelector(`[data-id="${CSS.escape(n.id)}"] > .card`);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  });
}

function search(query, max = 8) {
  const s = query.trim().toLowerCase();
  if (s.length < 2 || !org.value) return [];
  const out = [];
  for (const n of org.value.list) {
    if (n.name.toLowerCase().includes(s) || n.title.toLowerCase().includes(s)) {
      out.push(n);
      if (out.length === max) break;
    }
  }
  return out;
}

const scope = computed(() => org.value && (org.value.byId.get(scopeId.value) || org.value.root));
const scopePath = computed(() => {
  const p = [];
  for (let n = scope.value; n; n = n.parent) p.unshift(n);
  return p;
});
const stats = computed(() => (scope.value ? computeStats(scope.value) : null));

export function useOrg() {
  return {
    org, view, expanded, limits, highlight, scopeId, error, canvasEl,
    scope, scopePath, stats,
    loadDefault, loadSample, loadCSV, toggle, showMore, analyze, expandTo, reveal, search,
  };
}

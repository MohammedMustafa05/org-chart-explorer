<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import { org, ui, expandedVersion, isExpanded, toggle, select, collapseAll, expandNextLevel } from '../lib/store.js'
import { layoutOrg, CARD_W, CARD_H, GAP_Y } from '../lib/layout.js'
import { pathTo } from '../lib/hierarchy.js'
import { count } from '../lib/format.js'
import NodeCard from './NodeCard.vue'

const viewport = ref(null)
const size = ref({ w: 800, h: 600 })
const t = ref({ x: 0, y: 40, k: 0.85 }) // world -> screen transform
const animate = ref(false)
const layout = shallowRef(layoutOrg(org.value, isExpanded))
let anchor = null // keeps a toggled card fixed on screen across relayouts

watch(expandedVersion, () => {
  const before = anchor != null ? layout.value.pos.get(anchor) : null
  layout.value = layoutOrg(org.value, isExpanded)
  const after = anchor != null ? layout.value.pos.get(anchor) : null
  if (before && after) {
    t.value = { ...t.value, x: t.value.x - (after.left - before.left) * t.value.k, y: t.value.y - (after.top - before.top) * t.value.k }
  }
  anchor = null
})

function onToggle(v) {
  anchor = v
  toggle(v)
}

// ---- viewport culling: only cards intersecting the screen are in the DOM
const MARGIN = 200
const view = computed(() => {
  const { x, y, k } = t.value
  return {
    left: -x / k - MARGIN,
    top: -y / k - MARGIN,
    right: (size.value.w - x) / k + MARGIN,
    bottom: (size.value.h - y) / k + MARGIN,
  }
})
const inView = (b) => b.left + b.w > view.value.left && b.left < view.value.right && b.top + b.h > view.value.top && b.top < view.value.bottom
const visibleCards = computed(() => layout.value.cards.filter(inView))
const visibleGroups = computed(() => layout.value.groups.filter(inView))
const visibleLinks = computed(() =>
  layout.value.links.filter((l) => {
    const lx = Math.min(l.x1, l.x2)
    const rx = Math.max(l.x1, l.x2)
    return rx > view.value.left && lx < view.value.right && l.y2 > view.value.top && l.y1 < view.value.bottom
  }),
)
const compact = computed(() => t.value.k < 0.45)

// Links on the selected person's chain of command are drawn darker
const chain = computed(() => new Set(ui.selected >= 0 ? pathTo(org.value, ui.selected) : []))
function linkPath(l) {
  const mid = l.y1 + GAP_Y / 2
  const r = Math.min(10, Math.abs(l.x2 - l.x1) / 2)
  if (r < 1) return `M${l.x1},${l.y1}V${l.y2}`
  const dir = l.x2 > l.x1 ? 1 : -1
  return `M${l.x1},${l.y1}V${mid - r}Q${l.x1},${mid} ${l.x1 + dir * r},${mid}H${l.x2 - dir * r}Q${l.x2},${mid} ${l.x2},${mid + r}V${l.y2}`
}
function linkOnChain(l) {
  if (l.child !== -1) return chain.value.has(l.child)
  const o = org.value
  const sel = ui.selected
  return sel >= 0 && o.parent[sel] === l.manager && o.childCount[sel] === 0
}

// ---- pan & zoom (pointer + wheel + pinch), no library
const pointers = new Map()
let dragStart = null
let moved = false
let pinch = null

function onPointerDown(e) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  moved = false
  if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY, tx: t.value.x, ty: t.value.y }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: t.value.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: t.value.x, ty: t.value.y }
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const k = clampK(pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d))
    zoomAround(pinch.cx, pinch.cy, k, { x: pinch.tx, y: pinch.ty, k: pinch.k })
    moved = true
  } else if (dragStart) {
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    // Capture only once it's really a drag, so plain clicks still reach the cards
    if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
      moved = true
      viewport.value.setPointerCapture?.(e.pointerId)
    }
    if (moved) t.value = { ...t.value, x: dragStart.tx + dx, y: dragStart.ty + dy }
  }
}

function onPointerUp(e) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  if (pointers.size === 0) dragStart = null
  else if (pointers.size === 1) {
    const [p] = [...pointers.values()]
    dragStart = { x: p.x, y: p.y, tx: t.value.x, ty: t.value.y }
  }
}

// A drag that ends over a card must not also select it
function onClickCapture(e) {
  if (moved) {
    e.stopPropagation()
    moved = false
  }
}

function onWheel(e) {
  e.preventDefault()
  animate.value = false
  if (e.ctrlKey || e.metaKey) {
    const rect = viewport.value.getBoundingClientRect()
    zoomAround(e.clientX - rect.left, e.clientY - rect.top, clampK(t.value.k * Math.exp(-e.deltaY * 0.01)))
  } else {
    t.value = { ...t.value, x: t.value.x - e.deltaX, y: t.value.y - e.deltaY }
  }
}

const clampK = (k) => Math.min(1.6, Math.max(0.08, k))

function zoomAround(sx, sy, k, from = t.value) {
  const wx = (sx - from.x) / from.k
  const wy = (sy - from.y) / from.k
  t.value = { x: sx - wx * k, y: sy - wy * k, k }
}

function zoomBy(f) {
  smooth()
  zoomAround(size.value.w / 2, size.value.h / 2, clampK(t.value.k * f))
}

function smooth() {
  animate.value = true
  clearTimeout(smooth.timer)
  smooth.timer = setTimeout(() => (animate.value = false), 400)
}

function fit() {
  const b = layout.value.bounds
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  const k = clampK(Math.min((size.value.w - 48) / bw, (size.value.h - 120) / bh, 1))
  smooth()
  t.value = { k, x: (size.value.w - bw * k) / 2 - b.minX * k, y: 72 }
}

function centerOn(v) {
  const box = layout.value.pos.get(v)
  if (!box) return
  const k = Math.max(t.value.k, 0.75)
  smooth()
  t.value = { k, x: size.value.w / 2 - (box.left + box.w / 2) * k, y: size.value.h / 3 - (box.top + box.h / 2) * k }
}

watch(
  () => ui.focusRequest,
  () => nextTick(() => centerOn(ui.selected)),
)

// keyboard: arrows pan, +/- zoom, 0 fits
function onKey(e) {
  const step = 80
  const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
  if (map[e.key]) {
    e.preventDefault()
    t.value = { ...t.value, x: t.value.x + map[e.key][0], y: t.value.y + map[e.key][1] }
  } else if (e.key === '+' || e.key === '=') zoomBy(1.2)
  else if (e.key === '-') zoomBy(1 / 1.2)
  else if (e.key === '0') fit()
}

let ro
onMounted(() => {
  ro = new ResizeObserver(([entry]) => {
    size.value = { w: entry.contentRect.width, h: entry.contentRect.height }
  })
  ro.observe(viewport.value)
  viewport.value.addEventListener('wheel', onWheel, { passive: false })
  const rect = viewport.value.getBoundingClientRect()
  size.value = { w: rect.width, h: rect.height }
  // Start fitted to the screen, but never zoomed in past a comfortable 85%
  const b = layout.value.bounds
  const fitK = Math.min((rect.width - 48) / (b.maxX - b.minX), (rect.height - 120) / (b.maxY - b.minY), 0.85)
  if (fitK >= 0.5) {
    t.value = { k: fitK, x: rect.width / 2 - ((b.minX + b.maxX) / 2) * fitK, y: 72 }
  } else {
    // Too wide to fit legibly (e.g. a phone): keep cards readable and centre the root
    const root = layout.value.pos.get(org.value.root)
    t.value = { k: 0.6, x: rect.width / 2 - (root.left + CARD_W / 2) * 0.6, y: 120 }
  }
  if (ui.selected !== org.value.root) centerOn(ui.selected)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  viewport.value?.removeEventListener('wheel', onWheel)
})

const worldStyle = computed(() => ({
  transform: `translate(${t.value.x}px, ${t.value.y}px) scale(${t.value.k})`,
  transition: animate.value ? 'transform 350ms cubic-bezier(.2,.7,.2,1)' : 'none',
}))
const shown = computed(() => layout.value.cards.length)
</script>

<template>
  <div class="relative h-full w-full overflow-hidden">
    <div
      ref="viewport"
      class="h-full w-full cursor-grab touch-none select-none outline-none active:cursor-grabbing"
      style="background-image: radial-gradient(#e1e0d9 1px, transparent 1px); background-size: 22px 22px"
      tabindex="0"
      aria-label="Org chart canvas. Drag or use arrow keys to pan, plus and minus to zoom, 0 to fit."
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @click.capture="onClickCapture"
      @keydown="onKey"
    >
      <div class="absolute left-0 top-0 origin-top-left" :style="worldStyle">
        <svg class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
          <path
            v-for="l in visibleLinks"
            :key="l.key"
            :d="linkPath(l)"
            fill="none"
            :stroke="linkOnChain(l) ? '#0b0b0b' : '#c3c2b7'"
            :stroke-width="linkOnChain(l) ? 2 : 1.5"
          />
        </svg>

        <div
          v-for="g in visibleGroups"
          :key="g.key"
          class="absolute rounded-2xl border border-dashed border-black/15 bg-black/[0.025]"
          :style="{ left: g.left + 'px', top: g.top + 'px', width: g.w + 'px', height: g.h + 'px' }"
        >
          <div class="px-4 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
            {{ g.size }} individual contributors
          </div>
        </div>

        <div
          v-for="c in visibleCards"
          :key="c.v"
          class="absolute"
          :style="{ left: c.left + 'px', top: c.top + 'px', width: CARD_W + 'px', height: CARD_H + 'px' }"
        >
          <NodeCard :v="c.v" :expanded="isExpanded(c.v)" :selected="ui.selected === c.v" :compact="compact" @toggle="onToggle" @select="select" />
        </div>
      </div>
    </div>

    <!-- toolbar -->
    <div class="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
      <div class="pointer-events-auto flex items-center gap-1 rounded-xl border border-black/10 bg-white/95 p-1 text-sm shadow-sm backdrop-blur">
        <button class="rounded-lg px-3 py-1.5 font-medium hover:bg-black/5" @click="expandNextLevel()">Expand a level</button>
        <button class="rounded-lg px-3 py-1.5 font-medium hover:bg-black/5" @click="collapseAll(); fit()">Collapse all</button>
      </div>
      <div class="pointer-events-auto rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-xs text-ink-2 shadow-sm backdrop-blur">
        <span class="tabular font-semibold text-ink">{{ count(shown) }}</span> of {{ count(org.realCount) }} people shown
      </div>
    </div>

    <div class="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-black/10 bg-white/95 p-1 text-sm shadow-sm backdrop-blur">
      <button class="h-8 w-8 rounded-lg text-lg leading-none hover:bg-black/5" aria-label="Zoom out" @click="zoomBy(1 / 1.25)">−</button>
      <span class="tabular w-12 text-center text-xs text-ink-2">{{ Math.round(t.k * 100) }}%</span>
      <button class="h-8 w-8 rounded-lg text-lg leading-none hover:bg-black/5" aria-label="Zoom in" @click="zoomBy(1.25)">+</button>
      <button class="rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-black/5" @click="fit">Fit</button>
    </div>

    <div class="pointer-events-none absolute bottom-4 left-4 hidden text-xs text-ink-3 md:block">
      Drag or scroll to pan · Pinch or ⌘/Ctrl + scroll to zoom
    </div>
  </div>
</template>

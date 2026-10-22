<script setup>
import { computed } from 'vue';
import { useOrg, CHILD_LIMIT } from '../store.js';
import { money, ratio, fmtInt, hueFor, initials } from '../lib/format.js';

defineOptions({ name: 'OrgNode' });
const props = defineProps({ node: { type: Object, required: true } });
const { expanded, limits, highlight, toggle, showMore, analyze } = useOrg();

const isManager = computed(() => props.node.children.length > 0);
const open = computed(() => expanded.has(props.node.id));
const shown = computed(() => props.node.children.slice(0, limits[props.node.id] || CHILD_LIMIT));
const hidden = computed(() => props.node.children.length - shown.value.length);
const isHighlighted = computed(() => highlight.value === props.node.id);
</script>

<template>
  <li :data-id="node.id">
    <div class="card" :class="{ hl: isHighlighted }" :style="{ '--h': hueFor(node.dept) }">
      <div class="avatar" aria-hidden="true">{{ initials(node.name) }}</div>
      <div class="nm">{{ node.name }}</div>
      <div class="tt">{{ node.title }}</div>

      <div v-if="!node.virtual" class="pills">
        <span class="pill dept">{{ node.dept }}</span>
        <span class="pill">{{ node.location }}</span>
        <span class="pill">Level {{ node.level }}</span>
      </div>

      <dl v-if="isManager" class="metrics">
        <dt>Mgmt cost</dt><dd>{{ money(node.mgmt) }}</dd>
        <dt>IC cost</dt><dd>{{ money(node.ic) }}</dd>
        <dt>Total cost</dt><dd>{{ money(node.total) }}</dd>
        <dt>Mgmt cost ratio</dt><dd>{{ ratio(node) }}</dd>
      </dl>
      <dl v-else class="metrics">
        <dt>Salary</dt><dd>{{ money(node.salary) }}</dd>
      </dl>

      <div v-if="isManager" class="actions">
        <button
          class="toggle"
          :aria-expanded="open"
          :title="`${node.children.length} direct reports`"
          @click="toggle(node)"
        >
          <span><span class="num">{{ fmtInt(node.desc) }}</span> in org · <span class="num">{{ fmtInt(node.nonLeaf) }}</span> mgrs</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
          </svg>
        </button>
        <button class="iconbtn" title="Analyze team" aria-label="Analyze this team's cost" @click="analyze(node)">
          <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
            <path d="M2 11V7M6.5 11V2M11 11V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <span v-else class="text-[11px] text-muted">Individual contributor</span>
    </div>

    <!-- Only expanded nodes render their children; large teams are paged -->
    <ul v-if="open" class="children">
      <OrgNode v-for="c in shown" :key="c.id" :node="c" />
      <li v-if="hidden > 0">
        <button class="more" @click="showMore(node)">+{{ fmtInt(hidden) }} more</button>
      </li>
    </ul>
  </li>
</template>

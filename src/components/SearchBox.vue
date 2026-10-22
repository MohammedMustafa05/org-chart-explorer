<script setup>
import { ref, computed } from 'vue';
import { useOrg } from '../store.js';

const { search, reveal } = useOrg();
const q = ref('');
const results = computed(() => search(q.value));

function pick(n) {
  q.value = '';
  reveal(n);
}
</script>

<template>
  <div class="relative flex-1 min-w-[180px] max-w-[340px]">
    <input
      id="search"
      v-model="q"
      class="field"
      placeholder="Find a person or title…"
      autocomplete="off"
      @keydown.enter="results[0] && pick(results[0])"
      @keydown.esc="q = ''"
    />
    <div v-if="results.length" class="dropdown">
      <button v-for="r in results" :key="r.id" @click="pick(r)">
        <div class="font-semibold">{{ r.name }}</div>
        <div class="text-xs text-muted">{{ r.title }} · {{ r.dept }} · Level {{ r.level }}</div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import OrgNode from './OrgNode.vue';
import { useOrg } from '../store.js';

const { org, canvasEl, zoom } = useOrg();

// Drag-to-pan for mouse; touch keeps native scrolling.
const dragging = ref(false);
let start = null;

function panStart(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button,input,a,label')) return;
  const el = canvasEl.value;
  start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  dragging.value = true;
}
function panMove(e) {
  if (!start) return;
  canvasEl.value.scrollLeft = start.left - (e.clientX - start.x);
  canvasEl.value.scrollTop = start.top - (e.clientY - start.y);
}
function panEnd() {
  start = null;
  dragging.value = false;
}
</script>

<template>
  <div
    ref="canvasEl"
    class="canvas"
    :class="{ dragging }"
    @pointerdown="panStart"
    @pointermove="panMove"
    @pointerup="panEnd"
    @pointercancel="panEnd"
    @pointerleave="panEnd"
  >
    <div v-if="org" class="tree" :style="{ zoom }">
      <ul class="rootul">
        <OrgNode :node="org.root" />
      </ul>
    </div>
  </div>
</template>

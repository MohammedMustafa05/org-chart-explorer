<script setup>
import { computed } from 'vue';
import { useOrg } from '../store.js';
import { money, pct, ratio, fmtInt } from '../lib/format.js';

const { org, scope, scopePath, scopeId, stats, reveal } = useOrg();

const heading = computed(() => {
  const s = scope.value;
  if (s.virtual) return 'Whole organization';
  if (s === org.value.root) return `Whole company under ${s.name}`;
  return `${s.name}'s organization`;
});
const icsPerManager = computed(() => (stats.value.ics / Math.max(1, scope.value.nonLeaf)).toFixed(1));
</script>

<template>
  <main class="flex-1 min-h-0 overflow-auto">
    <div class="gutter max-w-[1240px] mx-auto flex flex-col gap-5" style="padding-block: 22px 48px">
      <div>
        <div class="eyebrow">Scope</div>
        <div class="flex flex-wrap items-center gap-1 mt-1 text-[13px]">
          <template v-for="(p, i) in scopePath" :key="p.id">
            <span v-if="i > 0" class="text-muted">/</span>
            <button v-if="i < scopePath.length - 1" class="crumb" @click="scopeId = p.id">{{ p.name }}</button>
            <span v-else class="font-semibold">{{ p.name }}</span>
          </template>
        </div>
        <h2 class="text-[22px] font-bold mt-2" style="text-wrap: balance">{{ heading }}</h2>
        <p class="text-muted text-[13px] mt-1">
          Everything below counts people who roll up to this node, matching the numbers on its org chart card.
          Use “Analyze team” on any manager card to narrow the scope.
        </p>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="eyebrow">Headcount</div><div class="v">{{ fmtInt(scope.desc) }}</div><div class="s">{{ fmtInt(scope.children.length) }} direct reports</div></div>
        <div class="kpi"><div class="eyebrow">Total cost</div><div class="v">{{ money(scope.total) }}</div><div class="s">avg {{ money(scope.total / Math.max(1, scope.desc)) }} / person</div></div>
        <div class="kpi"><div class="eyebrow">Managers</div><div class="v">{{ fmtInt(scope.nonLeaf) }}</div><div class="s">{{ pct(scope.nonLeaf / Math.max(1, scope.desc)) }} of headcount</div></div>
        <div class="kpi"><div class="eyebrow">ICs per manager</div><div class="v">{{ icsPerManager }}</div><div class="s">{{ fmtInt(stats.ics) }} individual contributors</div></div>
        <div class="kpi"><div class="eyebrow">Avg span</div><div class="v">{{ stats.avgSpan.toFixed(1) }}</div><div class="s">direct reports per manager</div></div>
        <div class="kpi"><div class="eyebrow">Layers</div><div class="v">{{ stats.layers }}</div><div class="s">levels below this node</div></div>
        <div class="kpi"><div class="eyebrow">Mgmt cost ratio</div><div class="v">{{ ratio(scope) }}</div><div class="s">mgmt cost ÷ IC cost</div></div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <section class="panel">
          <h3>Cost by department</h3>
          <p class="sub">Where the money goes, split into management and IC salary. Long dark segments mean a department is manager-heavy.</p>
          <div class="text-xs text-muted mt-3">
            <span class="swatch seg-m"></span>Management
            <span class="swatch seg-i ml-3"></span>Individual contributors
          </div>
          <div class="flex flex-col gap-3 mt-3">
            <div v-for="d in stats.depts" :key="d.name">
              <div class="flex justify-between gap-3 text-[13px]">
                <span class="font-semibold truncate">{{ d.name }} <span class="text-muted font-normal">· {{ fmtInt(d.count) }}</span></span>
                <span class="num">{{ money(d.total) }} <span class="text-muted">· {{ pct(d.mgmt / Math.max(1, d.total)) }} mgmt</span></span>
              </div>
              <div class="track mt-1" :style="{ width: (d.total / stats.deptMax) * 100 + '%' }">
                <div class="seg-m" :style="{ width: (d.mgmt / Math.max(1, d.total)) * 100 + '%' }"></div>
                <div class="seg-i" style="flex: 1"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <h3>Span of control</h3>
          <p class="sub">How many direct reports each manager has. Spans of 1–2 add a layer without much leverage; spans of 15+ risk managers who can't support their team.</p>
          <div class="hist mt-5">
            <div v-for="(b, i) in stats.spanBuckets" :key="b.label" class="col">
              <span class="num text-[10.5px] text-muted mb-1">{{ b.count ? fmtInt(b.count) : '' }}</span>
              <div class="bar" :class="{ flag: i < 2 || i === 11 }" :style="{ height: (b.count / stats.spanMax) * 100 + '%' }"></div>
            </div>
          </div>
          <div class="flex gap-[6px] mt-1">
            <div v-for="b in stats.spanBuckets" :key="b.label" class="flex-1 text-center num text-[10.5px] text-muted min-w-0">{{ b.label }}</div>
          </div>
          <div class="text-xs text-muted mt-2 text-center">direct reports</div>
        </section>

        <section class="panel">
          <h3>Layers</h3>
          <p class="sub">Headcount and salary cost at each level of the hierarchy. A wide base and a narrow top is healthy; a bulge in the middle layers often signals excess management.</p>
          <div class="overflow-x-auto mt-3">
            <table class="tbl">
              <thead><tr><th>Level</th><th>Headcount</th><th class="r">Managers</th><th class="r">Avg salary</th><th class="r">Cost</th></tr></thead>
              <tbody>
                <tr v-for="l in stats.levels" :key="l.level">
                  <td class="num">L{{ l.level }}</td>
                  <td style="min-width: 140px">
                    <div class="flex items-center gap-2">
                      <div class="track flex-1"><div class="seg-i" :style="{ width: (l.count / stats.levelMax) * 100 + '%' }"></div></div>
                      <span class="num text-xs w-12 text-right">{{ fmtInt(l.count) }}</span>
                    </div>
                  </td>
                  <td class="r num">{{ fmtInt(l.mgrs) }}</td>
                  <td class="r num">{{ money(l.cost / l.count) }}</td>
                  <td class="r num">{{ money(l.cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <h3>Locations</h3>
          <p class="sub">Headcount and average salary by office, to spot where cost per head is highest.</p>
          <div class="overflow-x-auto mt-3">
            <table class="tbl">
              <thead><tr><th>Location</th><th class="r">People</th><th class="r">Avg salary</th><th class="r">Cost</th></tr></thead>
              <tbody>
                <tr v-for="l in stats.locs" :key="l.name">
                  <td>{{ l.name }}</td>
                  <td class="r num">{{ fmtInt(l.count) }}</td>
                  <td class="r num">{{ money(l.cost / l.count) }}</td>
                  <td class="r num">{{ money(l.cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="panel">
        <h3>Restructuring candidates</h3>
        <p class="sub">Managers whose span falls outside 3–14 direct reports, ranked by the cost they oversee. Open one in the chart to see the team.</p>
        <div class="flex flex-wrap gap-2 mt-3 text-[12.5px]">
          <span class="flag-chip narrow">{{ fmtInt(stats.narrowCount) }} narrow spans</span>
          <span class="flag-chip wide">{{ fmtInt(stats.wideCount) }} wide spans</span>
        </div>
        <div class="overflow-x-auto mt-3">
          <table class="tbl">
            <thead><tr><th>Manager</th><th>Flag</th><th class="r">Directs</th><th class="r">Team size</th><th class="r">Total cost</th><th></th></tr></thead>
            <tbody>
              <tr v-for="f in stats.flags" :key="f.node.id">
                <td>
                  <div class="font-semibold">{{ f.node.name }}</div>
                  <div class="text-xs text-muted">{{ f.node.title }} · {{ f.node.dept }}</div>
                </td>
                <td><span class="flag-chip" :class="f.kind">{{ f.kind === 'narrow' ? 'Narrow span' : 'Wide span' }}</span></td>
                <td class="r num">{{ f.span }}</td>
                <td class="r num">{{ fmtInt(f.node.desc) }}</td>
                <td class="r num">{{ money(f.node.total) }}</td>
                <td class="r whitespace-nowrap"><button class="linkbtn" @click="reveal(f.node)">View in chart</button></td>
              </tr>
              <tr v-if="!stats.flags.length"><td colspan="6" class="text-muted">Every manager in this scope has 3–14 direct reports.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
</template>

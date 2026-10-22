import { mgmtCostRatio } from './hierarchy.js';

const nf = new Intl.NumberFormat('en-US');

export const fmtInt = (v) => nf.format(Math.round(v));

export const money = (v) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B`
  : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
  : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K`
  : `$${Math.round(v)}`;

export const pct = (v) => `${(v * 100).toFixed(1)}%`;

export const ratio = (n) => {
  const r = mgmtCostRatio(n);
  return r == null ? '—' : r.toFixed(2);
};

const KNOWN_HUES = {
  Executive: 222, Engineering: 212, Sales: 28, Product: 145, Operations: 262,
  'Customer Success': 182, Marketing: 330, Finance: 46, People: 0, Organization: 220,
};

/** Stable hue per department; unknown departments get a hashed hue. */
export function hueFor(dept) {
  if (dept in KNOWN_HUES) return KNOWN_HUES[dept];
  let h = 0;
  for (const ch of String(dept)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (KNOWN_HUES[dept] = h % 360);
}

export function initials(name) {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0] || '')[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '');
}

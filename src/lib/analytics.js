/**
 * Aggregates for the cost analytics view, over everyone who rolls up to `root`.
 * One O(size of subtree) walk; per-node totals come from buildOrg() and are not recomputed.
 */
export function computeStats(root){
  const depts = new Map(), levels = new Map(), locs = new Map();
  const spanCounts = new Array(12).fill(0);
  let spanSum = 0, mgrs = 0, maxLevel = root.level, narrowCount = 0, wideCount = 0;
  const flags = [];
  const stack = root.children.slice();
  while (stack.length){
    const n = stack.pop(); const k = n.children.length;
    let d = depts.get(n.dept); if (!d) depts.set(n.dept, d = { name:n.dept, count:0, mgmt:0, ic:0, total:0 });
    d.count++; if (k) d.mgmt += n.salary; else d.ic += n.salary;
    let l = levels.get(n.level); if (!l) levels.set(n.level, l = { level:n.level, count:0, cost:0, mgrs:0 });
    l.count++; l.cost += n.salary; if (k) l.mgrs++;
    let o = locs.get(n.location); if (!o) locs.set(n.location, o = { name:n.location, count:0, cost:0 });
    o.count++; o.cost += n.salary;
    if (n.level > maxLevel) maxLevel = n.level;
    if (k){
      mgrs++; spanSum += k; spanCounts[k >= 15 ? 11 : k >= 11 ? 10 : k - 1]++;
      if (k <= 2){ narrowCount++; flags.push({ node:n, span:k, kind:'narrow' }); }
      else if (k >= 15){ wideCount++; flags.push({ node:n, span:k, kind:'wide' }); }
      for (const c of n.children) stack.push(c);
    }
  }
  const deptList = [...depts.values()].map(d => (d.total = d.mgmt + d.ic, d)).sort((a,b) => b.total - a.total);
  const levelList = [...levels.values()].sort((a,b) => a.level - b.level);
  const labels = ['1','2','3','4','5','6','7','8','9','10','11–14','15+'];
  const spanBuckets = spanCounts.map((count, i) => ({ label:labels[i], count }));
  flags.sort((a,b) => b.node.total - a.node.total);
  return {
    depts:deptList, deptMax:Math.max(1, ...deptList.map(d => d.total)),
    levels:levelList, levelMax:Math.max(1, ...levelList.map(l => l.count)),
    locs:[...locs.values()].sort((a,b) => b.count - a.count).slice(0, 10),
    spanBuckets, spanMax:Math.max(1, ...spanCounts),
    avgSpan: mgrs ? spanSum / mgrs : 0, ics: root.desc - root.nonLeaf,
    layers: maxLevel - root.level, flags: flags.slice(0, 12), narrowCount, wideCount,
  };
}

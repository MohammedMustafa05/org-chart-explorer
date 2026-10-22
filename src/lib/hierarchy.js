/**
 * Builds the reporting tree and computes every node's metrics in O(n).
 *
 * records: [{ id, name, title, dept, location, salary, managerId }]
 *
 * Step 1 — link: index every record in a Map, then attach each person to
 *          their manager's `children`. O(n).
 * Step 2 — order: pre-order traversal with an explicit stack (no recursion,
 *          so a very deep hierarchy can't overflow the call stack). O(n).
 * Step 3 — roll up: iterate that order in REVERSE. Reverse pre-order guarantees
 *          every child is finished before its parent, so each node's values are
 *          built from its children's already-computed values. Each edge is
 *          visited once and no subtree is ever walked twice. O(n).
 *
 * Definitions (from the brief), all over descendants, excluding the node itself:
 *   desc     = number of descendants
 *   nonLeaf  = descendants who have at least one report (managers)
 *   mgmt     = sum of salaries of descendants who are managers
 *   ic       = sum of salaries of descendants who are individual contributors
 *   total    = mgmt + ic
 */
export function buildOrg(records, source = '') {
  const t0 = now();

  const byId = new Map();
  const nodes = records.map((r) => {
    const n = {
      id: String(r.id),
      name: r.name || 'Unnamed',
      title: r.title || '',
      dept: r.dept || 'Unassigned',
      location: r.location || '—',
      salary: +r.salary || 0,
      managerId: r.managerId == null ? '' : String(r.managerId),
      children: [],
      parent: null,
      level: 0,
      desc: 0, nonLeaf: 0, mgmt: 0, ic: 0, total: 0,
    };
    byId.set(n.id, n);
    return n;
  });

  // Step 1: link children to managers
  const roots = [];
  for (const n of nodes) {
    const p = n.managerId && n.managerId !== n.id ? byId.get(n.managerId) : null;
    if (p) p.children.push(n);
    else roots.push(n);
  }

  // Several top-level people -> hang them under a virtual root
  let root;
  if (roots.length === 1) {
    root = roots[0];
  } else {
    root = {
      id: '__org', name: 'Organization', title: `${roots.length} top-level people`,
      dept: 'Organization', location: '', salary: 0, virtual: true,
      children: roots, parent: null, level: 0,
      desc: 0, nonLeaf: 0, mgmt: 0, ic: 0, total: 0,
    };
    byId.set(root.id, root);
  }

  // Step 2: pre-order with an explicit stack
  root.level = root.virtual ? 0 : 1;
  const order = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    order.push(n);
    for (const c of n.children) {
      c.parent = n;
      c.level = n.level + 1;
      stack.push(c);
    }
  }

  // Step 3: reverse pre-order roll-up (children always before parents)
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    let desc = 0, nonLeaf = 0, mgmt = 0, ic = 0;
    for (const c of n.children) {
      const isMgr = c.children.length > 0;
      desc += c.desc + 1;
      nonLeaf += c.nonLeaf + (isMgr ? 1 : 0);
      mgmt += c.mgmt + (isMgr ? c.salary : 0);
      ic += c.ic + (isMgr ? 0 : c.salary);
    }
    n.desc = desc;
    n.nonLeaf = nonLeaf;
    n.mgmt = mgmt;
    n.ic = ic;
    n.total = mgmt + ic;
    // Show bigger orgs first in the chart
    if (n.children.length > 1) {
      n.children.sort((a, b) => b.desc - a.desc || a.name.localeCompare(b.name));
    }
  }

  const list = order.filter((n) => !n.virtual);
  return {
    root,
    byId,
    list,
    count: list.length,
    ms: now() - t0,
    source,
    // rows never reached from a root are in a reporting cycle
    orphans: nodes.length - list.length,
  };
}

/** Management cost ratio = management cost ÷ IC cost. */
export function mgmtCostRatio(n) {
  return n.ic > 0 ? n.mgmt / n.ic : null;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

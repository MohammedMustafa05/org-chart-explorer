# Giga Corp — Org Chart & Cost Analytics

Vue 3 + Tailwind app that turns a flat people CSV (40k rows) into an
interactive reporting hierarchy, with per-person descendant counts and cost
metrics, plus a cost-analytics view.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # metric tests, incl. a brute-force check on the 40k file
```

## Views

**Org chart.** Pan by dragging or scrolling, pinch or ⌘/Ctrl-scroll to zoom,
and use the arrow keys, `+`/`-` and `0` (fit). Every card shows:
- **Reports**: descendants.
- **Managers**: non-leaf descendants.
- **Org cost**.

Expanding a manager keeps their card fixed on screen. Individual contributors
who share a manager are packed into one team block rather than a single
very wide row. Selecting a person highlights their chain of command.

**List.** The same tree as a virtualised outline, the default on phones. Arrow
keys expand and collapse rows.

**Person panel.**
- descendants and non-leaf descendants
- management cost, IC cost, total cost and management cost ratio
- a clickable "reports up to" chain
- "Analyze this org", which scopes the analytics view to that person

**Search.** Find anyone by name, title or department. The chart expands the
path to them and centres on them.

**Cost analytics (bonus).** Modelled on the
[Agentnoon chart library](https://docs.agentnoon.com/hub/chart-library) and
scoped to the whole company or to any manager's org. Clicking a person drills
in, and the breadcrumb climbs back up.
- **KPI tiles:** total, management and IC cost, management cost ratio, average
  span of control, and layers.
- **Org map:** two views of the same org.
  - *Treemap:* each direct report's org, sized by cost and shaded by
    management share.
  - *Icicle:* the hierarchy as bands, built with `d3.partition`. Each row is a
    layer and each width is that person's org cost. It is coloured by the
    chosen grouping.
- **Breakdown (Hub-style):** one chart at a time, grouped by **Department,
  Entity, Location or Level**, with `#`/`%` and a **Show table** toggle.
  - Headcount cost (management vs IC)
  - Stacked cost (salary + bonus, from the CSV's Bonus column)
  - Average span of control, with the org average marked
  - Headcount heatmap (group × layer)
  - Layers & span of control (group × span)
- **Pyramid:** managers vs ICs at each layer, flagged as top-heavy,
  bottom-heavy or balanced.
- **Span of control distribution:** 1:1, 1:2, … 1:13+.
- **Org design flags:** managers with a single report (possibly collapsible
  layers) and managers with 13+ reports.
- **Export CSV:** every person in scope, with all computed metrics.

## How the metrics are computed

`src/lib/hierarchy.js` builds everything in **one O(n) pass, with no
recursion**:

1. Rows are indexed by id. Manager references resolve by id, or by name as a
   fallback. Reporting cycles are detected and cut, and multiple top-level
   people are joined under one company node.
2. Children are packed into a single `Int32Array` (CSR layout), and every
   metric lives in typed arrays. That avoids 40k objects with child arrays.
3. A breadth-first walk produces an order where parents come before children.
   Walking it **backwards** visits each child before its parent, so each node
   adds its finished totals into its parent exactly once:

```
descendants[p]        += 1 + descendants[c]
nonLeafDescendants[p] += (c is manager) + nonLeafDescendants[c]
managementCost[p]     += (c is manager ? salary[c] : 0) + managementCost[c]
icCost[p]             += (c is IC ? salary[c] : 0) + icCost[c]
totalCost[p]          += salary[c] + totalCost[c]
```

Every node's values are computed once at load, about 140 ms for the 40k-person
file, and read in O(1) afterwards. Expanding or collapsing never recalculates
anything.

**Checked against d3-hierarchy.** The test suite builds the same file with
`d3.stratify()` + `node.sum()` and checks every node's descendants and total
cost against the single pass. d3 is also used for layout: `partition`
(icicle), `treemap`, and flextree for the org chart. Its node objects are a
poor fit as the main store for 40k people, which is why the metrics live in
typed arrays.

**Rendering also scales.**
- The chart lays out only the expanded part of the tree, with
  [`d3-flextree`](https://github.com/Klortho/d3-flextree) for variable-size
  nodes.
- It mounts only the cards inside the viewport (culling).
- The list view is virtualised.

### Definitions

| Metric | Definition |
|---|---|
| Descendants | Everyone below the person, directly or indirectly |
| Non-leaf descendants | Descendants who have at least one report |
| Management cost | Sum of salaries of non-leaf descendants |
| IC cost | Sum of salaries of leaf descendants |
| Total cost | Sum of salaries of all descendants (= management + IC) |
| Management cost ratio | IC cost ÷ management cost, i.e. IC dollars per management dollar. Shown as "—" when nobody below is a manager |

The person's own salary is not part of their own costs, matching "sum of the
salary of every descendant".

## Data

`public/giga-corp.csv` is the Giga Corp file provided with the assessment:
40,000 people, one CEO, nine layers. It loads on start. To try another org,
use **Load CSV** or drag and drop a file onto the page.

**Column detection.** Columns are detected from common header names:
- Employee Id / Email
- Manager / Manager Id / Reports To
- Name or First + Last
- Job Title
- Department
- Location
- Salary

Salaries like `$120,000` are parsed. If the ID or manager column can't be
recognised, the app asks you to map the columns.

**Robustness.** Duplicate IDs, unknown managers and reporting cycles are
handled rather than crashing. Several top-level people are joined under one
company node.

**Synthetic data.** `npm run generate-data` writes a deterministic synthetic
org instead, for testing other shapes. It overwrites the file above.

## Structure

```
src/lib/hierarchy.js    build + single-pass metrics (pure, tested)
src/lib/csv.js          CSV parsing + column detection
src/lib/layout.js       chart layout (flextree + IC team blocks)
src/lib/analytics.js    subtree analytics + CSV export
src/lib/store.js        app state (org kept in a shallowRef, never deep-reactive)
src/components/         OrgChart, NodeCard, OrgList, PersonPanel, AnalyticsView
tests/                  node:test suite
```

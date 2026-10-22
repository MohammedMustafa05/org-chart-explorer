# Giga Corp Org Explorer

An org chart and cost analytics tool for a 40,000-person company, built with Vue 3 and Tailwind.

## Run it

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests for the hierarchy math and CSV import
npm run build   # production build
```

The app opens with the Giga Corp data in `public/data/giga-corp.csv`. If that file is missing it falls back to a seeded 40k-person sample. **Load CSV** in the header loads any other export.

## How the metrics are calculated

All of it lives in `src/lib/hierarchy.js` (`buildOrg`) and runs in **O(n)**:

1. **Link.** Index every row in a `Map` by id, then push each person into their manager's `children`.
2. **Order.** Pre-order traversal with an explicit stack, so deep hierarchies can't overflow the call stack.
3. **Roll up.** Iterate that order in reverse. Reverse pre-order guarantees every child is finished before its parent, so each node's values come from its children's already-computed values:

```js
desc    += child.desc + 1
nonLeaf += child.nonLeaf + (childIsManager ? 1 : 0)
mgmt    += child.mgmt + (childIsManager ? child.salary : 0)
ic      += child.ic   + (childIsManager ? 0 : child.salary)
total    = mgmt + ic
```

Each edge is visited once and no subtree is walked twice. 40k people take about 100 ms, and the app shows the measured time in the toolbar. The tests check the results against a brute-force recount.

### Definitions and assumptions

- **Descendants, management cost, IC cost and total cost** are over everyone below a person, not including their own salary, as defined in the brief.
- **Management cost ratio** = management cost ÷ IC cost. The brief's wording is ambiguous, so the analytics view also shows the headcount version (ICs per manager).
- Several top-level people are grouped under a virtual "Organization" root. Rows caught in a reporting cycle are skipped and counted in the toolbar.

## Rendering 40k people

- Only expanded nodes render; the rest of the tree never reaches the DOM.
- Large teams show 24 reports at a time with a "+N more" tile, biggest orgs first.
- The tree is held with `shallowRef` + `markRaw`, so Vue doesn't make 40k objects reactive. Only the expanded set and paging limits are reactive.
- Search scans all 40k people. Picking a result expands the path to them and scrolls them into view.

## Cost analytics (bonus)

Open it from the **Cost analytics** tab, or with the chart icon on any manager card to scope it to that team.

- **Summary figures:** headcount, total cost, share of managers, ICs per manager, average span, layers, management cost ratio
- **Cost by department,** split into management and IC salary
- **Span of control histogram** that flags spans of 1–2 and 15+
- **Layers:** headcount, managers and cost at each level
- **Locations:** headcount and average salary per office
- **Restructuring candidates:** out-of-range managers ranked by the cost they oversee, with a link back to the chart

## Project layout

```
src/
  lib/
    hierarchy.js       tree build + O(n) roll-up
    hierarchy.test.js  unit tests (vitest)
    csv.js             CSV parser + loose header mapping
    analytics.js       aggregates for the analytics view
    sampleData.js      seeded 40k-person sample
    format.js          money, numbers, department colours
  components/
    OrgChart.vue       pannable, zoomable canvas
    OrgNode.vue        recursive card + children
    AnalyticsView.vue  cost analytics
    SearchBox.vue
  store.js             shared UI state and actions
  App.vue
```

## CSV format

Headers are matched loosely. The importer looks for columns like `Employee Id`, `Name` (or `First Name` + `Last Name`), `Job Title`, `Department`, `Location`, `Salary` and `Manager`. The manager column can hold the manager's id, email or name.

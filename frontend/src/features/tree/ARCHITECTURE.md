# Family Tree Visualization — Architecture

## Library Comparison

### D3.js

| Criterion | Score | Notes |
|---|---|---|
| React integration | ⚠️ Poor | Imperative DOM mutations conflict with React's virtual DOM |
| Custom nodes | ✅ Excellent | Full SVG/Canvas control |
| Built-in zoom/pan | ✅ | d3-zoom, but wired manually |
| Drag & drop | ⚠️ Manual | d3-drag, significant boilerplate |
| Large graph perf | ✅ | Canvas renderer possible |
| Layout algorithms | ✅ | dagre-d3, cola, elk |
| TypeScript DX | ⚠️ | Types exist but loose |
| Mobile (touch) | ⚠️ Manual | Touch events on d3-zoom work but fragile |
| Learning curve | ❌ High | |

**Verdict:** Maximum flexibility but requires building an entire React binding layer. Wrong tool when React is the framework.

---

### Cytoscape.js

| Criterion | Score | Notes |
|---|---|---|
| React integration | ⚠️ | `react-cytoscapejs` wrapper, not truly React-native |
| Custom nodes | ⚠️ | Canvas-only; HTML overlays are a hack |
| Built-in zoom/pan | ✅ | First-class |
| Drag & drop | ✅ | First-class |
| Large graph perf | ✅ Excellent | Canvas renderer, WebGL via Cytoscape GL |
| Layout algorithms | ✅ Excellent | Cola, dagre, elk, breadthfirst, concentric |
| TypeScript DX | ✅ | Official types |
| Mobile (touch) | ✅ | First-class |
| Learning curve | Medium | |

**Verdict:** Best performance ceiling for 10,000+ nodes, but HTML-in-canvas custom nodes are painful. Not idiomatic React.

---

### React Flow (v11 — `reactflow`)

| Criterion | Score | Notes |
|---|---|---|
| React integration | ✅ Excellent | Nodes are React components — full ecosystem |
| Custom nodes | ✅ Excellent | Arbitrary JSX inside every node |
| Built-in zoom/pan | ✅ | Zero config |
| Drag & drop | ✅ | Zero config, with callbacks |
| Large graph perf | ✅ | Viewport culling; nodes outside viewport not rendered |
| Layout algorithms | ✅ | dagre, elk via adapters |
| TypeScript DX | ✅ Excellent | First-class TS, generic node/edge data |
| Mobile (touch) | ✅ | Built-in touch handling |
| Learning curve | ✅ Low | |

**Verdict:** Best fit for this stack. React-native, zero infrastructure overhead, nodes are plain React components.

---

## Recommendation: **React Flow + dagre**

React Flow wins on every criterion that matters for FamilyRoots:

1. **Nodes are React** — `PersonNode` uses the full design system (Avatar, Badge, Tailwind). No canvas hacks.
2. **Zoom / pan / drag** — built-in, battle-tested, works on mobile.
3. **Viewport culling** — unlimited generations without performance collapse. Only visible nodes render.
4. **dagre layout** — proven for hierarchical graphs, supports TB/LR, gap control, and the bipartite person↔family-group graph.
5. **TypeScript** — generic `Node<Data>` and `Edge<Data>` types align perfectly with our domain entities.

Cytoscape is the right choice only if node count exceeds ~5,000 AND custom node styling is unimportant. For a genealogy SaaS with rich person cards, React Flow is correct.

---

## Graph Model

The backend uses a **bipartite graph**: `PersonNode` ↔ `FamilyGroupNode`. The canvas mirrors this exactly.

```
[PersonNode]──parent-member──▶[FamilyGroupNode]──child-member──▶[PersonNode]
[PersonNode]──parent-member──▶[FamilyGroupNode]
```

This naturally handles:
- **Multiple spouses**: one person appears as parent-member in multiple FamilyGroupNodes
- **Adoption**: child-member edge carries `parentage_type = ADOPTIVE` → rendered as dashed line
- **Step relations**: `parentage_type = STEP` → dotted line
- **Childless couples**: FamilyGroupNode with two parents, zero children

---

## Rendering Strategy

```
API Response (persons + family_groups)
        │
        ▼
  useTreeTransform()          ← converts domain data to ReactFlow nodes/edges
        │
        ▼
  useTreeLayout()             ← applies chosen layout algorithm
        │
        ▼
  useExpandCollapse()         ← hides/shows subtrees
        │
        ▼
  <ReactFlow>                 ← renders with zoom/pan/drag
        │
   ┌────┴────┐
   │         │
PersonNode  FamilyGroupNode   ← custom React components
   │         │
ParentChildEdge  UnionEdge   ← custom SVG path edges
```

---

## Layout Algorithms

| Mode | Algorithm | Use Case |
|---|---|---|
| Vertical (TB) | dagre `rankdir: TB` | Standard top→down pedigree |
| Horizontal (LR) | dagre `rankdir: LR` | Wide screens, many siblings |
| Ancestor chart | Custom BFS up from focus | "Show my ancestors" |
| Descendant chart | dagre TB from focus | "Show my descendants" |
| Fan chart | Custom polar coordinates | Classic genealogy wheel |

---

## Performance Budget

| Nodes | Strategy |
|---|---|
| < 200 | Render all; no optimisation needed |
| 200–1,000 | Expand/collapse; viewport culling |
| 1,000–5,000 | Progressive loading per branch; simplified nodes at zoom < 0.3 |
| > 5,000 | Cytoscape GL (future v2 feature) |

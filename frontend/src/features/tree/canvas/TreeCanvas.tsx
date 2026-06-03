/**
 * TreeCanvas — the main interactive genealogy graph component.
 *
 * Responsibilities:
 *   - Renders the React Flow canvas with custom node/edge types
 *   - Orchestrates layout algorithm selection
 *   - Manages expand/collapse
 *   - Handles node selection → opens side panel
 *   - Person nodes are freely draggable (positions persist until layout change)
 *   - Large-family optimisation via viewport culling (built into React Flow)
 */

import React, { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { AncestryFanChart } from './AncestryFanChart';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  type OnMove,
  type OnNodesChange,
  applyNodeChanges,
  SelectionMode,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { PersonNode } from './nodes/PersonNode';
import { FamilyGroupNode } from './nodes/FamilyGroupNode';
import { ParentChildEdge } from './edges/ParentChildEdge';
import { UnionEdge } from './edges/UnionEdge';
import { TreeControls } from './controls/TreeControls';
import { useTreeLayout } from './useTreeLayout';
import { useExpandCollapse } from './useExpandCollapse';
import { ancestorSubgraphIds, descendantSubgraphIds } from './algorithms/ancestorChart';
import { useCanvasStore } from '@store/canvas.store';
import { useThemeStore } from '@store/theme.store';
import type { ApiTreeGraph, TreeNode, PersonNodeData } from '../types';
import { DEFAULT_LAYOUT_OPTIONS } from '../types';

// ── Ctrl+drag helper ───────────────────────────────────────────────────────

/**
 * BFS over familyGroups to collect every visible descendant node ID
 * (both FamilyGroup nodes and child Person nodes) below a given person.
 */
function getDescendantNodeIds(
  personId: string,
  graph: ApiTreeGraph,
  visibleIds: Set<string>,
): Set<string> {
  const result  = new Set<string>();
  const queue   = [personId];
  const seen    = new Set<string>();

  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (seen.has(pid)) continue;
    seen.add(pid);

    for (const fg of graph.familyGroups) {
      if (!fg.parentIds.includes(pid)) continue;
      if (visibleIds.has(fg.id))   result.add(fg.id);

      for (const childId of Object.keys(fg.children)) {
        if (visibleIds.has(childId)) result.add(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}


// ── Static maps ────────────────────────────────────────────────────────────

// ── Chart legend ──────────────────────────────────────────────────────────

function LegendRow({
  icon, label, count, color, textColor,
}: { icon: string; label: string; count: number; color: string; textColor: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color, width: 14, textAlign: 'center', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
        {icon}
      </span>
      <span className="text-xs flex-1" style={{ color: textColor }}>{label}</span>
      <span className="text-xs font-bold tabular-nums" style={{ color: textColor }}>{count}</span>
    </div>
  );
}

import type { LayoutMode } from '../types';

const LEGEND_TITLES: Record<LayoutMode, string> = {
  vertical:       'Family Tree',
  horizontal:     'Family Tree',
  fan:            'Fan Chart',
  'ancestry-fan': 'Ancestry Fan',
  ancestor:       'Ancestor Chart',
  descendant:     'Descendant Chart',
  pedigree:       'Pedigree Chart',
};

// For focus-scoped modes: max generations the chart shows.
// Absent from this map → full visible tree (vertical / horizontal).
const FOCUS_MAX_GENS: Partial<Record<LayoutMode, number>> = {
  fan:            4,
  'ancestry-fan': 4,
  pedigree:       4,
  ancestor:       6,
  descendant:     6,
};

function ChartLegend({
  graph,
  focusPersonId,
  mode,
  visiblePersonIds,
}: {
  graph:            ApiTreeGraph;
  focusPersonId:    string | null;
  mode:             LayoutMode;
  /** IDs of persons currently rendered — used for non-focus modes. */
  visiblePersonIds: Set<string>;
}) {
  const stats = useMemo(() => {
    const maxG = FOCUS_MAX_GENS[mode];
    let people: typeof graph.persons;

    if (maxG !== undefined && focusPersonId) {
      // Focus-scoped: use the same subgraph the chart algorithm uses so counts
      // always match what is visible, not the full expanded-node list.
      const subIds =
        mode === 'descendant'
          ? descendantSubgraphIds(graph, focusPersonId, maxG)
          : ancestorSubgraphIds(graph, focusPersonId, maxG);
      people = graph.persons.filter((p) => subIds.has(p.id));
    } else {
      // Full-tree modes (vertical / horizontal): count every visible person.
      people = graph.persons.filter((p) => visiblePersonIds.has(p.id));
    }

    return {
      total:   people.length,
      male:    people.filter((p) => p.sex === 'MALE').length,
      female:  people.filter((p) => p.sex === 'FEMALE').length,
      living:  people.filter((p) => p.isLiving).length,
      dead:    people.filter((p) => p.isDeceased).length,
    };
  }, [graph, focusPersonId, mode, visiblePersonIds]);

  const theme = useThemeStore((s) => s.theme);

  if (stats.total === 0) return null;

  return (
    <div
      className="backdrop-blur rounded-xl shadow-lg p-3 min-w-[160px]"
      style={{ background: theme.nodeBg, border: `1px solid ${theme.nodeBorder}` }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: theme.nodeSubtext }}
        >
          {LEGEND_TITLES[mode]}
        </p>
        {/* Drag handle hint */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-2 shrink-0" style={{ color: theme.nodeSubtext }}>
          <circle cx="4" cy="3" r="1" fill="currentColor"/>
          <circle cx="8" cy="3" r="1" fill="currentColor"/>
          <circle cx="4" cy="6" r="1" fill="currentColor"/>
          <circle cx="8" cy="6" r="1" fill="currentColor"/>
          <circle cx="4" cy="9" r="1" fill="currentColor"/>
          <circle cx="8" cy="9" r="1" fill="currentColor"/>
        </svg>
      </div>
      <div className="space-y-1.5">
        <LegendRow icon="#" label="People"   count={stats.total}  color={theme.nodeSubtext} textColor={theme.nodeText} />
        <div className="h-px my-1.5" style={{ background: theme.nodeBorder }} />
        <LegendRow icon="♂" label="Male"     count={stats.male}   color="#3b82f6"            textColor={theme.nodeText} />
        <LegendRow icon="♀" label="Female"   count={stats.female} color="#ec4899"            textColor={theme.nodeText} />
        <div className="h-px my-1.5" style={{ background: theme.nodeBorder }} />
        <LegendRow icon="●" label="Living"   count={stats.living} color="#22c55e"            textColor={theme.nodeText} />
        <LegendRow icon="✝" label="Deceased" count={stats.dead}   color={theme.nodeSubtext}  textColor={theme.nodeText} />
      </div>
    </div>
  );
}

// ── Draggable legend wrapper ──────────────────────────────────────────────
// Sits absolutely within the canvas container (outside the ReactFlow
// viewport transform) so it stays fixed on screen while panning/zooming.

function DraggableLegend({ children }: { children: React.ReactNode }) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const selfRef    = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const origin     = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // Attach global move/up listeners once
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !origin.current) return;
      setDragPos({
        x: origin.current.px + e.clientX - origin.current.mx,
        y: origin.current.py + e.clientY - origin.current.my,
      });
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();   // prevent ReactFlow from starting a pan
    e.preventDefault();
    const el  = selfRef.current;
    const par = el?.offsetParent as HTMLElement | null;
    let px = dragPos?.x ?? 16;
    let py = dragPos?.y ?? 0;
    if (!dragPos && el && par) {
      // First drag: capture rendered position so transition is seamless
      const elR  = el.getBoundingClientRect();
      const parR = par.getBoundingClientRect();
      px = elR.left - parR.left;
      py = elR.top  - parR.top;
    }
    isDragging.current = true;
    origin.current     = { mx: e.clientX, my: e.clientY, px, py };
  }, [dragPos]);

  // Before first drag use CSS bottom/left so we don't need to know canvas height
  const posStyle: React.CSSProperties = dragPos
    ? { left: dragPos.x, top: dragPos.y }
    : { left: 16, bottom: 60 };

  return (
    <div
      ref={selfRef}
      className="cursor-grab active:cursor-grabbing"
      style={{ position: 'absolute', zIndex: 10, userSelect: 'none', ...posStyle }}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
}

// ── Ancestry fan chart node ────────────────────────────────────────────────
// Renders the full SVG fan chart as a single ReactFlow node so pan/zoom/
// minimap and all toolbar controls keep working normally.

interface FanNodeData { graph: ApiTreeGraph; focusPersonId: string }

const FanChartNode = memo(function FanChartNode({ data }: { data: FanNodeData }) {
  return (
    <AncestryFanChart
      graph={data.graph}
      focusPersonId={data.focusPersonId}
      maxGenerations={4}
    />
  );
});
FanChartNode.displayName = 'FanChartNode';

const NODE_TYPES: NodeTypes = {
  person: PersonNode,
  'family-group': FamilyGroupNode,
  'ancestry-fan': FanChartNode as any,
};

const EDGE_TYPES: EdgeTypes = {
  'parent-child': ParentChildEdge,
  union: UnionEdge,
};

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.8 };

// ── Lineage edge highlighting ──────────────────────────────────────────────

/**
 * Returns edge IDs for both the ancestor path (upward) and all descendant
 * paths (downward) from the selected person.
 */
function computeLineageEdgeIds(graph: ApiTreeGraph, selectedPersonId: string): Set<string> {
  const ids = new Set<string>();

  // ── Upward: trace through parent family groups to root ────────────
  const upQueue = [selectedPersonId];
  const upVisited = new Set<string>();

  while (upQueue.length > 0) {
    const personId = upQueue.shift()!;
    if (upVisited.has(personId)) continue;
    upVisited.add(personId);

    const fg = graph.familyGroups.find((g) => personId in g.children);
    if (!fg) continue;

    ids.add(`child-${fg.id}-${personId}`);
    for (const parentId of fg.parentIds) {
      ids.add(`union-${parentId}-${fg.id}`);
      upQueue.push(parentId);
    }
  }

  // ── Downward: trace through child family groups to leaves ─────────
  const downQueue = [selectedPersonId];
  const downVisited = new Set<string>();

  while (downQueue.length > 0) {
    const personId = downQueue.shift()!;
    if (downVisited.has(personId)) continue;
    downVisited.add(personId);

    const parentFgs = graph.familyGroups.filter((g) => g.parentIds.includes(personId));
    for (const fg of parentFgs) {
      // Highlight union edges for ALL parents in this group (the couple)
      for (const pid of fg.parentIds) {
        ids.add(`union-${pid}-${fg.id}`);
      }
      // Highlight parent-child edges and recurse into each child
      for (const childId of Object.keys(fg.children)) {
        ids.add(`child-${fg.id}-${childId}`);
        downQueue.push(childId);
      }
    }
  }

  return ids;
}

// ── Inner canvas ───────────────────────────────────────────────────────────

interface TreeCanvasInnerProps {
  graph: ApiTreeGraph | null;
  isLoading: boolean;
  onPersonSelect?: (personId: string) => void;
  onFamilyGroupSelect?: (familyGroupId: string) => void;
}

export interface TreeCanvasHandle {
  getPositions: () => Record<string, { x: number; y: number }>;
  loadPositions: (positions: Record<string, { x: number; y: number }>) => void;
  exportPdf: () => Promise<void>;
  scrollToNode: (personId: string) => void;
  refitView: () => void;
}

const TreeCanvasInner = forwardRef<TreeCanvasHandle, TreeCanvasInnerProps>(
function TreeCanvasInner({ graph, isLoading, onPersonSelect, onFamilyGroupSelect }, ref) {
  const { fitView } = useReactFlow();
  const canvasTheme = useThemeStore((s) => s.theme);

  const layoutMode          = useCanvasStore((s) => s.layoutMode);
  const focusPersonId       = useCanvasStore((s) => s.focusPersonId);
  const selectedPersonId    = useCanvasStore((s) => s.selectedPersonId);
  const setSelectedPersonId = useCanvasStore((s) => s.setSelectedPersonId);
  const setZoom             = useCanvasStore((s) => s.setZoom);
  const setPan              = useCanvasStore((s) => s.setPan);
  const layoutResetKey      = useCanvasStore((s) => s.layoutResetKey);

  const {
    expandedNodeIds,
    initializeExpanded,
    toggleExpand,
    expandAll,
    collapseAll,
  } = useExpandCollapse(graph);

  const setToggleExpand = useCanvasStore((s) => s.setToggleExpand);
  useEffect(() => { setToggleExpand(toggleExpand); }, [toggleExpand, setToggleExpand]);
  const setSetSelectedPersonId = useCanvasStore((s) => s.setSetSelectedPersonId);
  useEffect(() => { setSetSelectedPersonId(setSelectedPersonId); }, [setSelectedPersonId, setSetSelectedPersonId]);

  const graphLoaded = useRef(false);
  useEffect(() => {
    if (!graph || graphLoaded.current) return;
    graphLoaded.current = true;
    // Expand every branch immediately so the full tree is visible on open
    expandAll(graph);
    // Wait for ReactFlow to finish laying out all nodes before fitting
    setTimeout(() => fitView({ duration: 600, padding: 0.12 }), 150);
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const layoutOpts = useMemo(
    () => ({
      ...DEFAULT_LAYOUT_OPTIONS,
      mode: layoutMode,
      direction: layoutMode === 'horizontal' ? ('LR' as const) : ('TB' as const),
      focusPersonId: focusPersonId ?? undefined,
    }),
    [layoutMode, focusPersonId]
  );

  // ── Draggable node positions ───────────────────────────────────────────────
  //
  // displayNodes starts from the layout-computed positions and then diverges
  // as the user drags nodes. It resets to layout whenever the layout changes
  // (mode switch, expand/collapse, graph reload).

  const { nodes: layoutNodes, edges: rawEdges } = useTreeLayout(graph, expandedNodeIds, layoutOpts);

  // Highlight ancestor path when a person is selected; dim all other edges
  const edges = useMemo(() => {
    if (!selectedPersonId || !graph) return rawEdges;
    const lineageIds = computeLineageEdgeIds(graph, selectedPersonId);
    if (lineageIds.size === 0) return rawEdges;
    return rawEdges.map((e) => ({
      ...e,
      data: { ...e.data, isHighlighted: lineageIds.has(e.id) },
    }));
  }, [rawEdges, selectedPersonId, graph]);

  const [displayNodes, setDisplayNodes] = useState<TreeNode[]>([]);
  const prevLayoutKey = useRef('');
  const containerRef  = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    getPositions: () =>
      Object.fromEntries(displayNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])),
    loadPositions: (positions) => {
      setDisplayNodes((curr) =>
        curr.map((n) => ({ ...n, position: positions[n.id] ?? n.position }))
      );
      setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 80);
    },
    scrollToNode: (personId) => {
      fitView({ nodes: [{ id: personId }], duration: 600, padding: 0.5, minZoom: 0.8, maxZoom: 1.5 });
    },
    refitView: () => {
      fitView({ duration: 500, padding: 0.15, minZoom: 0.05 });
    },
    exportPdf: async () => {
      if (!containerRef.current) return;
      const { toPng }         = await import('html-to-image');
      const { default: jsPDF } = await import('jspdf');
      const dataUrl = await toPng(containerRef.current, { pixelRatio: 2, cacheBust: true });
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((r) => { img.onload = () => r(); });
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
      pdf.save('family-tree.pdf');
    },
  }), [displayNodes, fitView]);

  useEffect(() => {
    // Key covers structural changes: node added/removed or position moved by layout
    const key = layoutNodes.map((n) => `${n.id}:${n.position.x.toFixed(0)},${n.position.y.toFixed(0)}`).join('|');
    if (key !== prevLayoutKey.current) {
      // Structure changed — full reset (new/removed nodes, layout mode change, etc.)
      prevLayoutKey.current = key;
      setDisplayNodes(layoutNodes);
    } else {
      // Structure unchanged — only patch node data so edits (name, status, photo)
      // appear immediately without disturbing the user's manual drag positions
      const dataMap = new Map(layoutNodes.map((n) => [n.id, n.data]));
      setDisplayNodes((curr) =>
        curr.map((dn) => {
          const newData = dataMap.get(dn.id);
          return newData ? { ...dn, data: newData } : dn;
        }),
      );
    }
  }, [layoutNodes]);

  // Reset node positions + fit view when the reset button is pressed
  useEffect(() => {
    if (layoutResetKey === 0) return; // skip the initial mount
    setDisplayNodes(layoutNodes);
    setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 50);
  }, [layoutResetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Forward React Flow's node changes (drag, selection, etc.) to displayNodes
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setDisplayNodes((nds) => applyNodeChanges(changes, nds as any[]) as TreeNode[]),
    []
  );

  // ── Fit view on layout change ──────────────────────────────────────────────

  useEffect(() => {
    if (layoutNodes.length > 0) {
      setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 50);
    }
  }, [layoutMode, focusPersonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handlers ─────────────────────────────────────────────────────────

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type === 'person') {
        setSelectedPersonId(node.id);
        onPersonSelect?.(node.id);
      } else if (node.type === 'family-group') {
        onFamilyGroupSelect?.(node.id);
      }
    },
    [setSelectedPersonId, onPersonSelect, onFamilyGroupSelect]
  );

  const onPaneClick = useCallback(() => setSelectedPersonId(null), [setSelectedPersonId]);

  const onMoveEnd: OnMove = useCallback(
    (_, viewport) => {
      setZoom(viewport.zoom);
      setPan({ x: viewport.x, y: viewport.y });
    },
    [setZoom, setPan]
  );

  const handleExpandAll   = useCallback(() => { if (graph) expandAll(graph); }, [graph, expandAll]);
  const handleCollapseAll = useCallback(() => {
    if (focusPersonId) collapseAll(focusPersonId);
  }, [focusPersonId, collapseAll]);

  const miniMapNodeColor = useCallback((node: any) => {
    if (node.type === 'family-group') return '#e2e8f0';
    const colorMap: Record<string, string> = {
      MALE: '#3b82f6', FEMALE: '#ec4899', OTHER: '#8b5cf6', UNKNOWN: '#94a3b8',
    };
    return colorMap[node.data?.sex ?? 'UNKNOWN'] ?? '#94a3b8';
  }, []);

  // ── Ctrl+drag: move a person together with all visible descendants ─────────

  const ctrlDragRef = useRef<{
    anchorId: string;
    companionIds: Set<string>;
    lastPos: { x: number; y: number };
  } | null>(null);

  const [ctrlDragActive, setCtrlDragActive] = useState(false);
  const [ctrlDragNodeType, setCtrlDragNodeType] = useState<'person' | 'family-group'>('person');
  const [ctrlHeld, setCtrlHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(true);  };
    const up   = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const onNodeDragStart: NodeMouseHandler = useCallback(
    (event, node) => {
      if (!(event as unknown as MouseEvent).ctrlKey || !graph) {
        ctrlDragRef.current = null;
        return;
      }
      const visibleIds = new Set(displayNodes.map((n) => n.id));
      let companionIds: Set<string>;

      if (node.type === 'person') {
        companionIds = getDescendantNodeIds(node.id, graph, visibleIds);
        setCtrlDragNodeType('person');
      } else if (node.type === 'family-group') {
        // Ring union drags alone — no members travel with it
        setCtrlDragNodeType('family-group');
        ctrlDragRef.current = null;
        return;
      } else {
        ctrlDragRef.current = null;
        return;
      }

      ctrlDragRef.current = {
        anchorId:    node.id,
        companionIds,
        lastPos:     { x: node.position.x, y: node.position.y },
      };
      if (companionIds.size > 0) setCtrlDragActive(true);
    },
    [graph, displayNodes],
  );

  const onNodeDrag: NodeMouseHandler = useCallback(
    (_, node) => {
      const drag = ctrlDragRef.current;
      if (!drag || node.id !== drag.anchorId) return;
      const dx = node.position.x - drag.lastPos.x;
      const dy = node.position.y - drag.lastPos.y;
      if (dx === 0 && dy === 0) return;
      drag.lastPos = { x: node.position.x, y: node.position.y };
      setDisplayNodes((nds) =>
        nds.map((n) =>
          drag.companionIds.has(n.id)
            ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
            : n,
        ),
      );
    },
    [],
  );

  const onNodeDragStop: NodeMouseHandler = useCallback(() => {
    ctrlDragRef.current = null;
    setCtrlDragActive(false);
  }, []);

  // ── Ancestry fan chart node ───────────────────────────────────────────────
  // When in ancestry-fan mode, override displayNodes with a single custom node
  // that renders the SVG fan chart.  All ReactFlow infrastructure (pan, zoom,
  // minimap, toolbar) continues to work normally.

  const fanNode = useMemo(() => {
    if (layoutMode !== 'ancestry-fan' || !graph) return null;

    // Resolve focus person (same fallback logic as AncestryFanChart itself)
    const personSet = new Set(graph.persons.map((p) => p.id));
    let fid = focusPersonId ?? '';
    if (!fid || !personSet.has(fid)) {
      const childIds = new Set<string>();
      for (const fg of graph.familyGroups)
        for (const cId of Object.keys(fg.children))
          if (personSet.has(cId)) childIds.add(cId);
      fid = (graph.persons.find((p) => childIds.has(p.id)) ?? graph.persons[0])?.id ?? '';
    }

    const FOCUS_R = 80;
    const RING_W  = 110;
    const maxR    = FOCUS_R + 4 * RING_W;
    const viewW   = maxR * 2 + 40;
    const viewH   = maxR + FOCUS_R + 40;

    return {
      id:       '__ancestry-fan__',
      type:     'ancestry-fan',
      position: { x: -viewW / 2, y: -viewH / 2 },
      data:     { graph, focusPersonId: fid } satisfies FanNodeData,
      width:    viewW,
      height:   viewH,
      draggable:  false,
      selectable: false,
    } as unknown as TreeNode;
  }, [layoutMode, graph, focusPersonId]);

  const reactFlowNodes = useMemo(() => {
    const base = layoutMode === 'ancestry-fan' && fanNode ? [fanNode] : displayNodes;
    if (!ctrlHeld) return base;
    return base.map((n) => n.type === 'family-group' ? { ...n, draggable: true } : n);
  }, [layoutMode, fanNode, displayNodes, ctrlHeld]);
  const reactFlowEdges = layoutMode === 'ancestry-fan' ? [] : edges;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-muted">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading family tree…</p>
        </div>
      </div>
    );
  }

  if (!graph || graph.persons.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-muted">
        <div className="text-center">
          <div className="text-4xl mb-3">🌳</div>
          <p className="text-slate-700 font-medium">No people yet</p>
          <p className="text-sm text-slate-500 mt-1">Add a person to start your family tree</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ background: canvasTheme.canvasBg }}>
      {(ctrlDragActive || ctrlHeld) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg pointer-events-none select-none">
          {ctrlDragActive
            ? 'Ctrl drag · moving with descendants'
            : 'Ctrl · drag a union to move it'}
        </div>
      )}
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.05}
        maxZoom={3}
        selectionMode={SelectionMode.Partial}
        fitView
        fitViewOptions={{ padding: 0.12, duration: 600, minZoom: 0.05 }}
        onlyRenderVisibleElements
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        panOnDrag
        selectNodesOnDrag={false}
        elevateNodesOnSelect
        nodesFocusable
        edgesFocusable={false}
        nodesDraggable
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={canvasTheme.canvasDot} />

        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={0}
          maskColor="rgba(248,250,252,0.7)"
          className="!bottom-4 !right-4 !rounded-xl !border !border-slate-200 !shadow-card"
          pannable
          zoomable
        />

        <TreeControls
          graph={graph}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />

        <div className="absolute bottom-4 left-4 z-10 text-xs text-slate-400 bg-white/80 px-2 py-1 rounded-lg border border-slate-200">
          {graph.persons.length} people · {displayNodes.filter((n) => n.type === 'person').length} visible
        </div>
      </ReactFlow>

      {/* Draggable legend — outside ReactFlow so it stays viewport-fixed
          while the canvas pans/zooms. Shown for every layout mode. */}
      {graph && (
        <DraggableLegend>
          <ChartLegend
            graph={graph}
            focusPersonId={focusPersonId ?? null}
            mode={layoutMode}
            visiblePersonIds={new Set(
              reactFlowNodes
                .filter((n) => n.type === 'person')
                .map((n) => n.id)
            )}
          />
        </DraggableLegend>
      )}
    </div>
  );
}); // end forwardRef TreeCanvasInner

// ── Exported wrapper ───────────────────────────────────────────────────────

export interface TreeCanvasProps {
  graph: ApiTreeGraph | null;
  isLoading?: boolean;
  onPersonSelect?: (personId: string) => void;
  onFamilyGroupSelect?: (familyGroupId: string) => void;
}

export const TreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(
  function TreeCanvas({ graph, isLoading = false, onPersonSelect, onFamilyGroupSelect }, ref) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner
        ref={ref}
        graph={graph}
        isLoading={isLoading}
        onPersonSelect={onPersonSelect}
        onFamilyGroupSelect={onFamilyGroupSelect}
      />
    </ReactFlowProvider>
  );
});

export default TreeCanvas;

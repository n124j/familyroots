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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useCanvasStore } from '@store/canvas.store';
import type { ApiTreeGraph, TreeNode } from '../types';
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

/** Collect the visible parent + child person IDs that belong to a family group. */
function getFamilyGroupMemberIds(
  familyGroupId: string,
  graph: ApiTreeGraph,
  visibleIds: Set<string>,
): Set<string> {
  const result = new Set<string>();
  const fg = graph.familyGroups.find((g) => g.id === familyGroupId);
  if (!fg) return result;
  for (const pid of fg.parentIds) {
    if (visibleIds.has(pid)) result.add(pid);
  }
  for (const cid of Object.keys(fg.children)) {
    if (visibleIds.has(cid)) result.add(cid);
  }
  return result;
}

// ── Static maps ────────────────────────────────────────────────────────────

const NODE_TYPES: NodeTypes = {
  person: PersonNode,
  'family-group': FamilyGroupNode,
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

function TreeCanvasInner({ graph, isLoading, onPersonSelect, onFamilyGroupSelect }: TreeCanvasInnerProps) {
  const { fitView } = useReactFlow();

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

  useEffect(() => {
    // Build a cheap key to detect real layout changes (not just object identity)
    const key = layoutNodes.map((n) => `${n.id}:${n.position.x.toFixed(0)},${n.position.y.toFixed(0)}`).join('|');
    if (key === prevLayoutKey.current) return;
    prevLayoutKey.current = key;
    setDisplayNodes(layoutNodes);
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
      } else if (node.type === 'family-group') {
        companionIds = getFamilyGroupMemberIds(node.id, graph, visibleIds);
      } else {
        ctrlDragRef.current = null;
        return;
      }

      if (companionIds.size === 0) { ctrlDragRef.current = null; return; }
      ctrlDragRef.current = {
        anchorId:    node.id,
        companionIds,
        lastPos:     { x: node.position.x, y: node.position.y },
      };
      setCtrlDragActive(true);
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

  const containerRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = useCallback(async () => {
    if (!containerRef.current) return;

    const { toPng } = await import('html-to-image');
    const { default: jsPDF } = await import('jspdf');

    // Capture exactly what is visible — no fitView, no zoom change
    const dataUrl = await toPng(containerRef.current, { pixelRatio: 2, cacheBust: true });

    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((r) => { img.onload = () => r(); });

    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const pdf = new jsPDF({
      orientation: w >= h ? 'landscape' : 'portrait',
      unit: 'px',
      format: [w, h],
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
    pdf.save('family-tree.pdf');
  }, []);

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
    <div ref={containerRef} className="w-full h-full relative bg-surface-muted">
      {ctrlDragActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg pointer-events-none select-none">
          Ctrl drag · moving with descendants
        </div>
      )}
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
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
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />

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
          onExportPdf={handleExportPdf}
        />

        <div className="absolute bottom-4 left-4 z-10 text-xs text-slate-400 bg-white/80 px-2 py-1 rounded-lg border border-slate-200">
          {graph.persons.length} people · {displayNodes.filter((n) => n.type === 'person').length} visible
        </div>
      </ReactFlow>
    </div>
  );
}

// ── Exported wrapper ───────────────────────────────────────────────────────

export interface TreeCanvasProps {
  graph: ApiTreeGraph | null;
  isLoading?: boolean;
  onPersonSelect?: (personId: string) => void;
  onFamilyGroupSelect?: (familyGroupId: string) => void;
}

export function TreeCanvas({ graph, isLoading = false, onPersonSelect, onFamilyGroupSelect }: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner
        graph={graph}
        isLoading={isLoading}
        onPersonSelect={onPersonSelect}
        onFamilyGroupSelect={onFamilyGroupSelect}
      />
    </ReactFlowProvider>
  );
}

export default TreeCanvas;

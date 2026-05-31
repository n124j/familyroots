/**
 * TreeCanvas — the main interactive genealogy graph component.
 *
 * Responsibilities:
 *   - Renders the React Flow canvas with custom node/edge types
 *   - Orchestrates layout algorithm selection
 *   - Manages expand/collapse
 *   - Handles node selection → opens side panel
 *   - Large-family optimisation via viewport culling (built into React Flow)
 *   - Mobile support via React Flow's built-in touch handling
 *
 * Usage:
 *   <TreeCanvas
 *     graph={apiTreeGraph}
 *     isLoading={isLoading}
 *     onPersonSelect={(personId) => openPanel(personId)}
 *   />
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  type OnMove,
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
import type { ApiTreeGraph, LayoutMode } from '../types';
import { DEFAULT_LAYOUT_OPTIONS, PERSON_NODE_WIDTH, PERSON_NODE_HEIGHT } from '../types';

// ── Static maps (defined outside component to avoid re-renders) ────────────

const NODE_TYPES: NodeTypes = {
  person: PersonNode,
  'family-group': FamilyGroupNode,
};

const EDGE_TYPES: EdgeTypes = {
  'parent-child': ParentChildEdge,
  union: UnionEdge,
};

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.8 };

// ── Level-of-detail: simplified nodes at low zoom ──────────────────────────

/** Below this zoom threshold, render compact node variant */
const LOD_COMPACT_ZOOM = 0.35;

// ── Inner canvas (must be inside ReactFlowProvider) ────────────────────────

interface TreeCanvasInnerProps {
  graph: ApiTreeGraph | null;
  isLoading: boolean;
  onPersonSelect?: (personId: string) => void;
}

function TreeCanvasInner({ graph, isLoading, onPersonSelect }: TreeCanvasInnerProps) {
  const { fitView } = useReactFlow();

  // Canvas store
  const layoutMode       = useCanvasStore((s) => s.layoutMode);
  const focusPersonId    = useCanvasStore((s) => s.focusPersonId);
  const selectedPersonId = useCanvasStore((s) => s.selectedPersonId);
  const setSelectedPersonId = useCanvasStore((s) => s.setSelectedPersonId);
  const setZoom          = useCanvasStore((s) => s.setZoom);
  const setPan           = useCanvasStore((s) => s.setPan);

  // Expand / collapse
  const {
    expandedNodeIds,
    initializeExpanded,
    toggleExpand,
    expandAll,
    collapseAll,
  } = useExpandCollapse(graph);

  // Expose toggleExpand to canvas store so PersonNode buttons can reach it
  const setToggleExpand = useCanvasStore((s) => s.setToggleExpand);
  useEffect(() => { setToggleExpand(toggleExpand); }, [toggleExpand, setToggleExpand]);
  const setSetSelectedPersonId = useCanvasStore((s) => s.setSetSelectedPersonId);
  useEffect(() => { setSetSelectedPersonId(setSelectedPersonId); }, [setSelectedPersonId, setSetSelectedPersonId]);

  // Initialise expanded set when graph first loads
  const graphLoaded = useRef(false);
  useEffect(() => {
    if (!graph || graphLoaded.current) return;
    graphLoaded.current = true;
    const focus = focusPersonId ?? graph.persons[0]?.id;
    if (focus) initializeExpanded(graph, focus);
  }, [graph, focusPersonId, initializeExpanded]);

  // Layout options
  const layoutOpts = useMemo(
    () => ({
      ...DEFAULT_LAYOUT_OPTIONS,
      mode: layoutMode,
      direction: layoutMode === 'horizontal' ? ('LR' as const) : ('TB' as const),
      focusPersonId: focusPersonId ?? undefined,
    }),
    [layoutMode, focusPersonId]
  );

  // Compute positioned nodes + edges
  const { nodes, edges } = useTreeLayout(graph, expandedNodeIds, layoutOpts);

  // Re-fit the view whenever the layout changes
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 50);
    }
  }, [layoutMode, focusPersonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handlers ──────────────────────────────────────────────────────

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type === 'person') {
        setSelectedPersonId(node.id);
        onPersonSelect?.(node.id);
      }
    },
    [setSelectedPersonId, onPersonSelect]
  );

  const onPaneClick = useCallback(() => {
    setSelectedPersonId(null);
  }, [setSelectedPersonId]);

  const onMoveEnd: OnMove = useCallback(
    (_, viewport) => {
      setZoom(viewport.zoom);
      setPan({ x: viewport.x, y: viewport.y });
    },
    [setZoom, setPan]
  );

  const handleExpandAll  = useCallback(() => { if (graph) expandAll(graph); },  [graph, expandAll]);
  const handleCollapseAll = useCallback(() => {
    if (focusPersonId) collapseAll(focusPersonId);
  }, [focusPersonId, collapseAll]);

  // ── MiniMap node colour ─────────────────────────────────────────────────

  const miniMapNodeColor = useCallback((node: any) => {
    if (node.type === 'family-group') return '#e2e8f0';
    const sex = node.data?.sex ?? 'UNKNOWN';
    const colorMap: Record<string, string> = {
      MALE: '#3b82f6',
      FEMALE: '#ec4899',
      OTHER: '#8b5cf6',
      UNKNOWN: '#94a3b8',
    };
    return colorMap[sex] ?? '#94a3b8';
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

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
    <div className="w-full h-full relative bg-surface-muted">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.05}
        maxZoom={3}
        selectionMode={SelectionMode.Partial}
        fitView
        fitViewOptions={{ padding: 0.15, duration: 600 }}
        // Performance: React Flow culls nodes outside the viewport automatically
        onlyRenderVisibleElements
        // Mobile: touch support built-in
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        panOnDrag
        selectNodesOnDrag={false}
        elevateNodesOnSelect
        nodesFocusable
        edgesFocusable={false}
        // Prevent accidental node movement (tree layout handles positions)
        nodesDraggable={false}
      >
        {/* Grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#e2e8f0"
        />

        {/* Mini-map (bottom right) */}
        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={0}
          maskColor="rgba(248,250,252,0.7)"
          className="!bottom-4 !right-4 !rounded-xl !border !border-slate-200 !shadow-card"
          pannable
          zoomable
        />

        {/* Floating controls (top left) */}
        <TreeControls
          graph={graph}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />

        {/* Node count badge */}
        <div className="absolute bottom-4 left-4 z-10 text-xs text-slate-400 bg-white/80 px-2 py-1 rounded-lg border border-slate-200">
          {graph.persons.length} people · {nodes.filter((n) => n.type === 'person').length} visible
        </div>
      </ReactFlow>
    </div>
  );
}

// ── Exported wrapper (provides ReactFlowProvider) ──────────────────────────

export interface TreeCanvasProps {
  graph: ApiTreeGraph | null;
  isLoading?: boolean;
  onPersonSelect?: (personId: string) => void;
}

export function TreeCanvas({ graph, isLoading = false, onPersonSelect }: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner
        graph={graph}
        isLoading={isLoading}
        onPersonSelect={onPersonSelect}
      />
    </ReactFlowProvider>
  );
}

export default TreeCanvas;

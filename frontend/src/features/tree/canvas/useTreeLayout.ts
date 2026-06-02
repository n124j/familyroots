/**
 * useTreeLayout — orchestrates graph transform + layout algorithm.
 *
 * Pipeline:
 *   ApiTreeGraph
 *     → transformGraphToFlow()   (pure: API → RF nodes/edges)
 *     → filter by expandedNodeIds
 *     → apply layout algorithm   (dagre / fan / ancestor / descendant)
 *     → return positioned ReactFlow nodes + edges
 */

import { useMemo } from 'react';
import type { ApiTreeGraph, TreeNode, TreeEdge, LayoutOptions, LayoutMode } from '../types';
import { transformGraphToFlow } from './useTreeTransform';
import { dagreLayout } from './algorithms/dagre';
import { fanChartLayout, fanChartVisibleIds } from './algorithms/fanChart';
import { ancestorChartLayout, descendantChartLayout } from './algorithms/ancestorChart';
import { familyTreeLayout } from './algorithms/familyTree';
import { pedigreeChartLayout, pedigreeChartVisibleIds } from './algorithms/pedigreeChart';

export interface UseTreeLayoutResult {
  nodes: TreeNode[];
  edges: TreeEdge[];
}

/**
 * Filter nodes/edges to only those in the expandedNodeIds set.
 * Family group nodes are visible only if at least one of their parent persons is visible.
 */
function filterByExpanded(
  nodes: TreeNode[],
  edges: TreeEdge[],
  expandedNodeIds: Set<string>
): { nodes: TreeNode[]; edges: TreeEdge[] } {
  const visiblePersonIds = new Set(
    nodes
      .filter((n) => n.type === 'person' && expandedNodeIds.has(n.id))
      .map((n) => n.id)
  );

  // A family group is visible if at least one of its parent persons is visible
  const candidateFamilyGroups = nodes.filter(
    (n) =>
      n.type === 'family-group' &&
      (n.data as any).parentIds.some((pid: string) => visiblePersonIds.has(pid))
  );

  // Deduplicate: for each unique set of visible parents, keep only one family group.
  // When there are multiple, prefer the one with the most children (most parent-child edges).
  const childCountOf = (fgId: string) =>
    edges.filter((e) => e.source === fgId && (e.data as any)?.kind === 'parent-child').length;

  const parentKeyToFgId = new Map<string, string>();
  for (const n of candidateFamilyGroups) {
    const key = [...((n.data as any).parentIds as string[])]
      .filter((pid) => visiblePersonIds.has(pid))
      .sort()
      .join('|');
    if (!key) continue;
    const existing = parentKeyToFgId.get(key);
    if (!existing || childCountOf(n.id) > childCountOf(existing)) {
      parentKeyToFgId.set(key, n.id);
    }
  }

  const visibleFamilyGroupIds = new Set(parentKeyToFgId.values());

  const visibleIds = new Set([...visiblePersonIds, ...visibleFamilyGroupIds]);

  const filteredNodes = nodes.filter((n) => visibleIds.has(n.id));
  const filteredEdges = edges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

/**
 * Apply the selected layout algorithm and patch node positions.
 */
function applyLayout(
  nodes: TreeNode[],
  edges: TreeEdge[],
  graph: ApiTreeGraph,
  opts: LayoutOptions
): TreeNode[] {
  let positions: Array<{ id: string; x: number; y: number }>;

  switch (opts.mode) {
    case 'fan': {
      positions = fanChartLayout(graph, {
        focusPersonId: opts.focusPersonId,
        maxGenerations: 4,
        startAngleDeg: 180,
        arcSpanDeg: 180,
        generationRadius: 240,
      });
      break;
    }

    case 'pedigree': {
      positions = pedigreeChartLayout(graph, opts.focusPersonId ?? '', 4);
      break;
    }

    case 'ancestor': {
      positions = ancestorChartLayout(
        graph,
        opts.focusPersonId ?? '',
        6,
        opts.nodeHGap,
        opts.nodeVGap
      );
      break;
    }

    case 'descendant': {
      positions = descendantChartLayout(
        graph,
        opts.focusPersonId ?? '',
        6,
        opts.nodeHGap,
        opts.nodeVGap
      );
      break;
    }

    case 'vertical':
    default: {
      // Build a filtered ApiTreeGraph from the already-expanded visible nodes
      // so familyTreeLayout only sees what's on screen.
      const visiblePersonIds = new Set(
        nodes.filter((n) => n.type === 'person').map((n) => n.id)
      );
      const visibleFGIds = new Set(
        nodes.filter((n) => n.type === 'family-group').map((n) => n.id)
      );
      const filteredGraph: ApiTreeGraph = {
        treeId: graph.treeId,
        persons: graph.persons.filter((p) => visiblePersonIds.has(p.id)),
        familyGroups: graph.familyGroups
          .filter((fg) => visibleFGIds.has(fg.id))
          .map((fg) => ({
            ...fg,
            parentIds: fg.parentIds.filter((pid) => visiblePersonIds.has(pid)),
            children: Object.fromEntries(
              Object.entries(fg.children).filter(([cid]) => visiblePersonIds.has(cid))
            ),
          })),
      };
      positions = familyTreeLayout(filteredGraph, {
        nodeHGap: opts.nodeHGap,
        nodeVGap: opts.nodeVGap,
      });
      break;
    }

    case 'horizontal': {
      const { nodes: positioned } = dagreLayout(nodes, edges, {
        direction: 'LR',
        nodeHGap: opts.nodeHGap,
        nodeVGap: opts.nodeVGap,
      });
      positions = positioned;
      break;
    }
  }

  const posMap = new Map(positions.map((p) => [p.id, p]));

  return nodes.map((node) => {
    const pos = posMap.get(node.id);
    if (!pos) return node;
    return { ...node, position: { x: pos.x, y: pos.y } };
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTreeLayout(
  graph: ApiTreeGraph | null,
  expandedNodeIds: Set<string>,
  layoutOpts: LayoutOptions
): UseTreeLayoutResult {
  return useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    // 1. Transform API graph → RF nodes/edges (positions = 0,0)
    const { nodes: rawNodes, edges: rawEdges } = transformGraphToFlow(graph, {
      focusPersonId: layoutOpts.focusPersonId,
      expandedNodeIds,
    });

    // 2. For fan mode, use a special visible set instead of expandedNodeIds
    let filteredNodes: TreeNode[];
    let filteredEdges: TreeEdge[];

    if (layoutOpts.mode === 'fan' && layoutOpts.focusPersonId) {
      const visibleIds = fanChartVisibleIds(graph, layoutOpts.focusPersonId, 4);
      filteredNodes = rawNodes.filter((n) => n.type === 'person' && visibleIds.has(n.id));
      filteredEdges = []; // fan chart has no edges
    } else if (layoutOpts.mode === 'pedigree' && layoutOpts.focusPersonId) {
      const visibleIds = pedigreeChartVisibleIds(graph, layoutOpts.focusPersonId, 4);
      filteredNodes = rawNodes.filter((n) => visibleIds.has(n.id));
      filteredEdges = rawEdges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
      );
    } else {
      ({ nodes: filteredNodes, edges: filteredEdges } = filterByExpanded(
        rawNodes,
        rawEdges,
        expandedNodeIds
      ));
    }

    // 3. Apply layout algorithm (patches x/y positions)
    const positionedNodes = applyLayout(filteredNodes, filteredEdges, graph, layoutOpts);

    return { nodes: positionedNodes, edges: filteredEdges };
  }, [graph, expandedNodeIds, layoutOpts]);
}

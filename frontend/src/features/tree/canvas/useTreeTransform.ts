/**
 * useTreeTransform — converts API graph data to React Flow nodes + edges.
 *
 * This is a pure data transformation (no layout positions yet).
 * Positions are set to {0, 0} here; the layout hook patches them.
 */

import type { ApiTreeGraph, TreeNode, TreeEdge, PersonNodeData, FamilyGroupNodeData } from '../types';
import { PERSON_NODE_WIDTH, PERSON_NODE_HEIGHT, FAMILY_NODE_SIZE } from '../types';

export interface TransformOptions {
  focusPersonId?: string;
  expandedNodeIds: Set<string>;
}

export interface TransformResult {
  nodes: TreeNode[];
  edges: TreeEdge[];
}

/**
 * Pure function — call it inside useMemo when graph or options change.
 */
export function transformGraphToFlow(
  graph: ApiTreeGraph,
  options: TransformOptions
): TransformResult {
  const { focusPersonId, expandedNodeIds } = options;

  // Build set of persons that have hidden children (for expand button)
  const personHasChildren = new Set<string>();
  const personHasParents = new Set<string>();

  const fgById = new Map(graph.familyGroups.map((fg) => [fg.id, fg]));

  for (const fg of graph.familyGroups) {
    // Parents of children
    for (const childId of Object.keys(fg.children)) {
      personHasParents.add(childId);
    }
    // Children of parents
    for (const parentId of fg.parentIds) {
      if (Object.keys(fg.children).length > 0) {
        personHasChildren.add(parentId);
      }
    }
  }

  // ── Person nodes ─────────────────────────────────────────────────────────

  const personNodes: TreeNode[] = graph.persons.map((person) => {
    const isExpanded = expandedNodeIds.has(person.id);
    const data: PersonNodeData = {
      kind: 'person',
      personId: person.id,
      treeId: person.treeId,
      displayGivenName: person.displayGivenName,
      displaySurname: person.displaySurname,
      sex: person.sex,
      birthDate: person.birthDate,
      deathDate: person.deathDate,
      birthYear: person.birthYear,
      deathYear: person.deathYear,
      isLiving: person.isLiving,
      isDeceased: person.isDeceased,
      photoUrl: person.photoUrl,
      isFocus: person.id === focusPersonId,
      isExpanded,
      hasHiddenChildren: personHasChildren.has(person.id) && !isExpanded,
      hasHiddenParents: personHasParents.has(person.id) && !isExpanded,
      generation: 0, // patched by layout
      facebookHandle: person.facebookHandle,
      xHandle: person.xHandle,
      linkedinHandle: person.linkedinHandle,
    };

    return {
      id: person.id,
      type: 'person' as const,
      position: { x: 0, y: 0 }, // layout algorithm sets this
      data,
      width: PERSON_NODE_WIDTH,
      height: PERSON_NODE_HEIGHT,
      draggable: true,
      selectable: true,
    };
  });

  // ── Family group nodes ────────────────────────────────────────────────────

  const familyGroupNodes: TreeNode[] = graph.familyGroups.map((fg) => {
    const data: FamilyGroupNodeData = {
      kind: 'family-group',
      familyGroupId: fg.id,
      treeId: fg.treeId,
      unionType: fg.unionType,
      parentIds: fg.parentIds,
      showUnionIcon: fg.unionType !== 'UNKNOWN' && fg.parentIds.length >= 2,
    };

    return {
      id: fg.id,
      type: 'family-group' as const,
      position: { x: 0, y: 0 },
      data,
      width: FAMILY_NODE_SIZE,
      height: FAMILY_NODE_SIZE,
      draggable: false,
      selectable: true,
    };
  });

  // ── Edges ─────────────────────────────────────────────────────────────────

  const edges: TreeEdge[] = [];

  for (const fg of graph.familyGroups) {
    // Parent → FamilyGroup (union edge)
    for (const parentId of fg.parentIds) {
      edges.push({
        id: `union-${parentId}-${fg.id}`,
        source: parentId,
        target: fg.id,
        type: 'union' as const,
        data: { kind: 'union', unionType: fg.unionType },
        animated: false,
      } as TreeEdge);
    }

    // FamilyGroup → Child (parent-child edge)
    for (const [childId, parentageType] of Object.entries(fg.children)) {
      edges.push({
        id: `child-${fg.id}-${childId}`,
        source: fg.id,
        target: childId,
        type: 'parent-child' as const,
        data: { kind: 'parent-child', parentageType },
        animated: false,
      } as TreeEdge);
    }
  }

  return {
    nodes: [...personNodes, ...familyGroupNodes],
    edges,
  };
}

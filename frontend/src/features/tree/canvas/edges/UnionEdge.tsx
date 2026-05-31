/**
 * UnionEdge — edge from a PersonNode (parent) to a FamilyGroupNode.
 *
 * Visual styles by union type:
 *   MARRIAGE     ════  double line (SVG trick: two strokes)
 *   PARTNERSHIP  ────  single solid
 *   COHABITATION ╌╌╌╌  dashed
 *   UNKNOWN      ┄┄┄┄  dotted
 */

import React, { memo } from 'react';
import {
  BaseEdge,
  getStraightPath,
  type EdgeProps,
} from 'reactflow';
import type { UnionEdgeData } from '../../types';
import { UNION_STROKE } from '../../types';

const UNION_COLORS: Record<UnionEdgeData['unionType'], string> = {
  MARRIAGE: '#f59e0b',
  PARTNERSHIP: '#10b981',
  COHABITATION: '#6366f1',
  UNKNOWN: '#94a3b8',
};

function UnionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<UnionEdgeData>) {
  const unionType = data?.unionType ?? 'UNKNOWN';
  const color = UNION_COLORS[unionType];
  const dashArray = UNION_STROKE[unionType];
  const isSolid = dashArray === 'solid';
  const isMarriage = unionType === 'MARRIAGE';

  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  if (isMarriage) {
    // Double line for marriage: two parallel SVG paths offset by 2px
    const [pathA] = getStraightPath({
      sourceX: sourceX - 1.5,
      sourceY,
      targetX: targetX - 1.5,
      targetY,
    });
    const [pathB] = getStraightPath({
      sourceX: sourceX + 1.5,
      sourceY,
      targetX: targetX + 1.5,
      targetY,
    });

    return (
      <g>
        <path d={pathA} stroke={color} strokeWidth={1.5} fill="none" />
        <path d={pathB} stroke={color} strokeWidth={1.5} fill="none" />
      </g>
    );
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: 1.5,
        strokeDasharray: isSolid ? undefined : dashArray,
      }}
    />
  );
}

export const UnionEdge = memo(UnionEdgeComponent);
UnionEdge.displayName = 'UnionEdge';
export default UnionEdge;

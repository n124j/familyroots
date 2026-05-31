/**
 * ParentChildEdge — edge from a FamilyGroupNode to a PersonNode (child).
 *
 * Visual styles by parentage type:
 *   BIOLOGICAL  ────────  solid line
 *   ADOPTIVE    ╌╌╌╌╌╌╌╌  long dash
 *   STEP        ┄┄┄┄┄┄┄┄  short dash
 *   FOSTER      ╌┄╌┄╌┄╌┄  dash-dot
 *   UNKNOWN     ┄┄┄┄┄┄┄┄  short dash (same as STEP)
 */

import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from 'reactflow';
import type { ParentChildEdgeData } from '../../types';
import { PARENTAGE_STROKE } from '../../types';

const EDGE_COLOR = '#94a3b8'; // slate-400

const PARENTAGE_LABELS: Partial<Record<ParentChildEdgeData['parentageType'], string>> = {
  ADOPTIVE: 'adopted',
  STEP: 'step',
  FOSTER: 'foster',
};

function ParentChildEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<ParentChildEdgeData>) {
  const parentageType = data?.parentageType ?? 'BIOLOGICAL';
  const dashArray = PARENTAGE_STROKE[parentageType];
  const label = PARENTAGE_LABELS[parentageType];
  const isSolid = dashArray === 'solid';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: EDGE_COLOR,
          strokeWidth: 1.5,
          strokeDasharray: isSolid ? undefined : dashArray,
        }}
      />

      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            <span className="px-1 py-0.5 text-[9px] font-medium rounded bg-white border border-slate-200 text-slate-500 shadow-sm">
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ParentChildEdge = memo(ParentChildEdgeComponent);
ParentChildEdge.displayName = 'ParentChildEdge';
export default ParentChildEdge;

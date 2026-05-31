/**
 * PersonNode — custom React Flow node for a single person.
 *
 * Visual anatomy:
 *   ┌──────────────────────────┐  ← sex-coded border
 *   │ [Avatar]  Name           │
 *   │           1920 – 2005    │
 *   │                    [▼/▲] │  ← expand/collapse button
 *   └──────────────────────────┘
 */

import React, { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { PersonNodeData } from '../../types';
import {
  SEX_BORDER_COLOR,
  SEX_BG_COLOR,
  PERSON_NODE_WIDTH,
  PERSON_NODE_HEIGHT,
} from '../../types';
import { useCanvasStore } from '@store/canvas.store';

// ── Avatar ─────────────────────────────────────────────────────────────────

interface AvatarProps {
  photoUrl?: string;
  givenName: string;
  surname: string;
  sex: PersonNodeData['sex'];
  size?: number;
}

const Avatar = memo(({ photoUrl, givenName, surname, sex, size = 44 }: AvatarProps) => {
  const initials = [givenName[0], surname[0]].filter(Boolean).join('').toUpperCase() || '?';
  const bg = SEX_BORDER_COLOR[sex];

  return (
    <div
      className="flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center text-white font-semibold select-none"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={`${givenName} ${surname}`} className="w-full h-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
});
Avatar.displayName = 'Avatar';

// ── Expand / Collapse button ───────────────────────────────────────────────

interface ExpandButtonProps {
  direction: 'up' | 'down';
  isExpanded: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const ExpandButton = memo(({ direction, isExpanded, onClick }: ExpandButtonProps) => {
  const arrow = direction === 'down'
    ? isExpanded ? '▲' : '▼'
    : isExpanded ? '▼' : '▲';

  return (
    <button
      onClick={onClick}
      className="absolute flex items-center justify-center w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition-colors text-[9px] leading-none shadow-sm"
      style={{ [direction === 'down' ? 'bottom' : 'top']: -10, left: '50%', transform: 'translateX(-50%)' }}
      title={isExpanded ? 'Collapse' : 'Expand'}
    >
      {arrow}
    </button>
  );
});
ExpandButton.displayName = 'ExpandButton';

// ── Life dates ─────────────────────────────────────────────────────────────

function formatDates(
  birthYear?: number,
  deathYear?: number,
  isLiving?: boolean
): string {
  if (!birthYear && !deathYear) return '';
  const birth = birthYear ? `${birthYear}` : '?';
  if (isLiving) return `b. ${birth}`;
  const death = deathYear ? `${deathYear}` : '?';
  return `${birth} – ${death}`;
}

// ── Main component ─────────────────────────────────────────────────────────

function PersonNodeComponent({ data, selected }: NodeProps<PersonNodeData>) {
  const {
    personId,
    displayGivenName,
    displaySurname,
    sex,
    birthYear,
    deathYear,
    isLiving,
    isDeceased,
    photoUrl,
    isFocus,
    isExpanded,
    hasHiddenChildren,
    hasHiddenParents,
  } = data;

  const toggleExpand = useCanvasStore((s) => s.toggleExpand);
  const setSelected = useCanvasStore((s) => s.setSelectedPersonId);

  const handleExpandDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleExpand(personId, 'children');
    },
    [personId, toggleExpand]
  );

  const handleExpandUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleExpand(personId, 'parents');
    },
    [personId, toggleExpand]
  );

  const handleClick = useCallback(() => {
    setSelected(personId);
  }, [personId, setSelected]);

  const borderColor = SEX_BORDER_COLOR[sex];
  const bgColor = SEX_BG_COLOR[sex];
  const fullName = [displayGivenName, displaySurname].filter(Boolean).join(' ') || 'Unknown';
  const dates = formatDates(birthYear, deathYear, isLiving && !isDeceased);

  return (
    <>
      {/* Top handle — receives edges from parent FamilyGroupNode */}
      <Handle type="target" position={Position.Top} className="!opacity-0 !pointer-events-none" />

      <div
        onClick={handleClick}
        className="relative cursor-pointer transition-shadow"
        style={{ width: PERSON_NODE_WIDTH, height: PERSON_NODE_HEIGHT }}
      >
        {/* Expand parents button */}
        {hasHiddenParents && (
          <ExpandButton direction="up" isExpanded={isExpanded} onClick={handleExpandUp} />
        )}

        {/* Card */}
        <div
          className="w-full h-full rounded-xl flex items-center gap-3 px-3 transition-all"
          style={{
            background: bgColor,
            border: `2px solid ${selected ? borderColor : isFocus ? borderColor : '#e2e8f0'}`,
            boxShadow: selected
              ? `0 0 0 3px ${borderColor}33, 0 4px 12px ${borderColor}22`
              : isFocus
              ? `0 0 0 2px ${borderColor}44`
              : '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          {/* Left accent bar */}
          <div
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
            style={{ background: borderColor }}
          />

          <Avatar
            photoUrl={photoUrl}
            givenName={displayGivenName}
            surname={displaySurname}
            sex={sex}
          />

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 text-sm leading-tight truncate">
              {fullName}
            </div>
            {dates && (
              <div className="text-xs text-slate-500 mt-0.5">{dates}</div>
            )}
            {isFocus && (
              <div
                className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded mt-1"
                style={{ background: `${borderColor}20`, color: borderColor }}
              >
                Focus
              </div>
            )}
            {isDeceased && (
              <div className="text-[10px] text-slate-400 mt-0.5">✝ Deceased</div>
            )}
          </div>
        </div>

        {/* Expand children button */}
        {hasHiddenChildren && (
          <ExpandButton direction="down" isExpanded={isExpanded} onClick={handleExpandDown} />
        )}
      </div>

      {/* Bottom handle — emits edges to child FamilyGroupNode */}
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !pointer-events-none" />
    </>
  );
}

export const PersonNode = memo(PersonNodeComponent);
PersonNode.displayName = 'PersonNode';
export default PersonNode;

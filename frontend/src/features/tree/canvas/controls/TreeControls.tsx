/**
 * TreeControls — floating toolbar for the canvas.
 *
 * Positioned top-left. Controls:
 *   - Zoom in / Zoom out / Fit view
 *   - Layout mode toggle (TB / LR / Fan / Ancestor / Descendant)
 *   - Expand all / Collapse all
 *   - Export (PNG)
 */

import React, { memo, useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import type { LayoutMode } from '../../types';
import { useCanvasStore } from '@store/canvas.store';

// ── Icon helpers (minimal inline SVGs) ────────────────────────────────────

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
  </svg>
);
const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="2" y1="7" x2="12" y2="7" />
  </svg>
);
const FitIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="1" width="12" height="12" rx="1" />
    <rect x="4" y="4" width="6" height="6" />
  </svg>
);
// ── Layout mode buttons ────────────────────────────────────────────────────

const LAYOUT_MODES: { mode: LayoutMode; label: string; title: string }[] = [
  { mode: 'vertical',    label: '↕',   title: 'Vertical (top → bottom)' },
  { mode: 'horizontal',  label: '↔',   title: 'Horizontal (left → right)' },
  { mode: 'ancestor',    label: '↑',   title: 'Ancestor chart (roots above)' },
  { mode: 'descendant',  label: '↓',   title: 'Descendant chart (roots below)' },
  { mode: 'fan',          label: '◑',   title: 'Fan chart — semicircle (180°)' },
  { mode: 'ancestry-fan', label: '◎',   title: 'Ancestry fan chart — full circle (360°)' },
  { mode: 'pedigree',    label: '⊢',   title: 'Pedigree chart (ancestors left → right)' },
];

// ── Control button ─────────────────────────────────────────────────────────

interface CtrlBtnProps {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}

const CtrlBtn = memo(({ onClick, title, active, children }: CtrlBtnProps) => (
  <button
    onClick={onClick}
    title={title}
    className={[
      'flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium transition-colors',
      active
        ? 'bg-brand-500 text-white shadow-sm'
        : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200',
    ].join(' ')}
  >
    {children}
  </button>
));
CtrlBtn.displayName = 'CtrlBtn';

// ── Divider ────────────────────────────────────────────────────────────────

const Divider = () => <div className="w-px h-6 bg-slate-200 mx-0.5" />;

// ── Main component ─────────────────────────────────────────────────────────

interface TreeControlsProps {
  graph: import('../../types').ApiTreeGraph | null;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export const TreeControls = memo(({ graph, onExpandAll, onCollapseAll }: TreeControlsProps) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const layoutMode      = useCanvasStore((s) => s.layoutMode);
  const setLayoutMode   = useCanvasStore((s) => s.setLayoutMode);
  const zoom            = useCanvasStore((s) => s.zoom);
  const bumpLayoutReset = useCanvasStore((s) => s.bumpLayoutReset);

  const handleFitView = useCallback(() => {
    fitView({ duration: 400, padding: 0.1 });
  }, [fitView]);

  const handleZoomIn  = useCallback(() => zoomIn({ duration: 200 }),  [zoomIn]);
  const handleZoomOut = useCallback(() => zoomOut({ duration: 200 }), [zoomOut]);

  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-1 p-1.5 bg-white/90 backdrop-blur rounded-xl border border-slate-200 shadow-card">
      {/* Zoom controls */}
      <CtrlBtn onClick={handleZoomOut} title="Zoom out (scroll down)">
        <MinusIcon />
      </CtrlBtn>

      <span className="px-1.5 text-xs text-slate-500 font-mono min-w-[36px] text-center select-none">
        {Math.round(zoom * 100)}%
      </span>

      <CtrlBtn onClick={handleZoomIn} title="Zoom in (scroll up)">
        <PlusIcon />
      </CtrlBtn>

      <CtrlBtn onClick={handleFitView} title="Fit entire tree in view">
        <FitIcon />
      </CtrlBtn>

      <Divider />

      {/* Layout modes */}
      {LAYOUT_MODES.map(({ mode, label, title }) => (
        <CtrlBtn
          key={mode}
          onClick={() => setLayoutMode(mode)}
          title={title}
          active={layoutMode === mode}
        >
          {label}
        </CtrlBtn>
      ))}

      <Divider />

      {/* Expand / Collapse */}
      <CtrlBtn onClick={onExpandAll} title="Expand all branches">
        ⊞
      </CtrlBtn>
      <CtrlBtn onClick={onCollapseAll} title="Collapse to focus person">
        ⊟
      </CtrlBtn>

      <Divider />

      {/* Reset layout */}
      <CtrlBtn onClick={bumpLayoutReset} title="Reset layout and fit view">
        ↺
      </CtrlBtn>

    </div>
  );
});
TreeControls.displayName = 'TreeControls';

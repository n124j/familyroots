/**
 * canvas.store — Zustand store for tree canvas state.
 *
 * Owns: viewport, selected node, layout mode, focus person, expand/collapse set.
 * Does NOT own server data (that's React Query's job).
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { LayoutMode } from '@features/tree/types';

interface CanvasStore {
  // ── Tree context ───────────────────────────────────────────────────────
  treeId: string | null;
  setTreeId: (id: string | null) => void;

  // ── Focus person (root of ancestor/descendant/fan layouts) ─────────────
  focusPersonId: string | null;
  setFocusPersonId: (id: string | null) => void;

  // ── Selection ──────────────────────────────────────────────────────────
  selectedPersonId: string | null;
  setSelectedPersonId: (id: string | null) => void;

  // ── Layout ────────────────────────────────────────────────────────────
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;

  // ── Viewport ──────────────────────────────────────────────────────────
  zoom: number;
  setZoom: (z: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;

  // ── Expand / collapse ─────────────────────────────────────────────────
  expandedNodeIds: Set<string>;
  setExpandedNodeIds: (ids: Set<string>) => void;

  // ── Callbacks injected from hooks (bridge to child components) ────────
  toggleExpand: ((personId: string, direction: 'children' | 'parents') => void) | null;
  setToggleExpand: (fn: (personId: string, direction: 'children' | 'parents') => void) => void;

  setSetSelectedPersonId: (fn: (id: string | null) => void) => void;

  // ── Reset ─────────────────────────────────────────────────────────────
  reset: () => void;
}

const initialState = {
  treeId: null,
  focusPersonId: null,
  selectedPersonId: null,
  layoutMode: 'vertical' as LayoutMode,
  zoom: 0.8,
  pan: { x: 0, y: 0 },
  expandedNodeIds: new Set<string>(),
  toggleExpand: null,
};

export const useCanvasStore = create<CanvasStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setTreeId: (id) => set({ treeId: id }),
      setFocusPersonId: (id) => set({ focusPersonId: id }),
      setSelectedPersonId: (id) => set({ selectedPersonId: id }),
      setLayoutMode: (mode) => set({ layoutMode: mode }),
      setZoom: (zoom) => set({ zoom }),
      setPan: (pan) => set({ pan }),
      setExpandedNodeIds: (ids) => set({ expandedNodeIds: ids }),
      setToggleExpand: (fn) => set({ toggleExpand: fn }),
      setSetSelectedPersonId: (_fn) => {
        // The store itself manages selectedPersonId; this is a no-op stub.
        // PersonNode calls useCanvasStore((s) => s.setSelectedPersonId) directly.
      },
      reset: () => set(initialState),
    }),
    { name: 'canvas-store' }
  )
);

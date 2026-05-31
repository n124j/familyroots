/**
 * FamilyTreePage — full-screen canvas route.
 *
 * Route: /trees/:treeId
 *
 * Layout: no standard AppShell sidebar — the canvas IS the page.
 * A slim floating top-bar shows the tree name + back link.
 * A right-side panel slides in when a person is selected.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TreeCanvas } from '@features/tree/canvas/TreeCanvas';
import { useCanvasStore } from '@store/canvas.store';
import { queryKeys } from '@queries/keys';
import type { ApiTreeGraph } from '@features/tree/types';

// ── Placeholder API call ───────────────────────────────────────────────────
// Replace with your actual API client call
async function fetchTreeGraph(treeId: string): Promise<ApiTreeGraph> {
  const res = await fetch(`/api/v1/trees/${treeId}/graph`);
  if (!res.ok) throw new Error('Failed to load tree');
  return res.json();
}

// ── Selection panel (right drawer) ────────────────────────────────────────

interface SelectionPanelProps {
  personId: string | null;
  treeId: string;
  onClose: () => void;
}

function SelectionPanel({ personId, treeId, onClose }: SelectionPanelProps) {
  if (!personId) return null;

  return (
    <div
      className="absolute top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col"
      // Mobile: full-width bottom sheet would go here
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-700">Person</span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"
        >
          ✕
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs text-slate-500 font-mono mb-3">ID: {personId}</p>

        {/* Quick actions */}
        <div className="space-y-2">
          <Link
            to={`/trees/${treeId}/persons/${personId}`}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200"
          >
            👤 Open Profile
          </Link>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            ➕ Add Parent
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            ➕ Add Child
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            ➕ Add Spouse
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200"
            onClick={() => useCanvasStore.getState().setFocusPersonId(personId)}
          >
            🎯 Set as Focus
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────

interface TreeTopBarProps {
  treeName: string;
  personCount: number;
}

function TreeTopBar({ treeName, personCount }: TreeTopBarProps) {
  return (
    <div className="absolute top-0 left-0 right-0 h-12 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center px-4 gap-3 z-30">
      <Link
        to="/dashboard"
        className="text-slate-400 hover:text-slate-600 transition-colors text-sm"
      >
        ← Dashboard
      </Link>
      <div className="w-px h-5 bg-slate-200" />
      <span className="font-semibold text-slate-800 text-sm truncate">{treeName}</span>
      <span className="text-xs text-slate-400">{personCount} people</span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FamilyTreePage() {
  const { treeId } = useParams<{ treeId: string }>();
  const [panelPersonId, setPanelPersonId] = useState<string | null>(null);

  const setTreeId = useCanvasStore((s) => s.setTreeId);
  const resetCanvas = useCanvasStore((s) => s.reset);

  // Set treeId in store on mount; reset on unmount
  useEffect(() => {
    if (treeId) setTreeId(treeId);
    return () => resetCanvas();
  }, [treeId, setTreeId, resetCanvas]);

  const { data: graph, isLoading } = useQuery({
    queryKey: queryKeys.trees.detail(treeId ?? ''),
    queryFn: () => fetchTreeGraph(treeId ?? ''),
    enabled: !!treeId,
    staleTime: 5 * 60_000,
  });

  const handlePersonSelect = useCallback((personId: string) => {
    setPanelPersonId(personId);
  }, []);

  const handlePanelClose = useCallback(() => {
    setPanelPersonId(null);
    useCanvasStore.getState().setSelectedPersonId(null);
  }, []);

  const treeName = 'Family Tree'; // replace with fetched tree.name
  const personCount = graph?.persons.length ?? 0;

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Top bar — 48px */}
      <TreeTopBar treeName={treeName} personCount={personCount} />

      {/* Canvas — remaining height */}
      <div className="flex-1 relative mt-12">
        <TreeCanvas
          graph={graph ?? null}
          isLoading={isLoading}
          onPersonSelect={handlePersonSelect}
        />

        {/* Right panel */}
        <SelectionPanel
          personId={panelPersonId}
          treeId={treeId ?? ''}
          onClose={handlePanelClose}
        />
      </div>
    </div>
  );
}

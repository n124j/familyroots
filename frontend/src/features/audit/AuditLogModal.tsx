import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@api/client';

interface AuditEntry {
  id: string;
  actor_display_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_display_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurred_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_PERSON:       'Added person',
  UPDATE_PERSON:       'Updated person',
  DELETE_PERSON:       'Deleted person',
  ADD_RELATIONSHIP:    'Added relationship',
  REMOVE_RELATIONSHIP: 'Removed relationship',
  UPLOAD_MEDIA:        'Uploaded media',
  DELETE_MEDIA:        'Removed photo',
  UPDATE_PHOTO:        'Updated photo',
  INVITE_MEMBER:       'Invited member',
  REMOVE_MEMBER:       'Removed member',
  CHANGE_MEMBER_ROLE:  'Changed member role',
  UPDATE_TREE:         'Updated tree',
  DELETE_TREE:         'Deleted tree',
  EXPORT_TREE:         'Exported tree (.frt)',
  IMPORT_TREE:         'Imported tree (.frt)',
  RESTORE_VERSION:     'Restored version',
  GENERATE_REPORT:     'Generated report',
  EXPORT_GEDCOM:       'Exported GEDCOM',
};

const ACTION_COLOR: Record<string, string> = {
  CREATE_PERSON:    'bg-green-100 text-green-700',
  UPDATE_PERSON:    'bg-blue-100 text-blue-700',
  UPDATE_PHOTO:     'bg-blue-100 text-blue-700',
  DELETE_PERSON:    'bg-red-100 text-red-700',
  DELETE_MEDIA:     'bg-red-100 text-red-700',
  ADD_RELATIONSHIP: 'bg-purple-100 text-purple-700',
  REMOVE_RELATIONSHIP: 'bg-orange-100 text-orange-700',
  EXPORT_TREE:      'bg-slate-100 text-slate-700',
  IMPORT_TREE:      'bg-indigo-100 text-indigo-700',
};

const DEFAULT_COLOR = 'bg-gray-100 text-gray-600';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

interface Props {
  treeId: string;
  onClose: () => void;
}

export function AuditLogModal({ treeId, onClose }: Props) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading, isFetching } = useQuery<AuditEntry[]>({
    queryKey: ['audit-log', treeId, page],
    queryFn: () => get<AuditEntry[]>(`/trees/${treeId}/audit-log?limit=${limit}&offset=${page * limit}`),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const entries = data ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-start justify-end p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg h-[calc(100vh-2rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Activity log</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && entries.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No activity recorded yet</p>
            </div>
          )}

          <ul className="divide-y divide-slate-50">
            {entries.map((e) => {
              const label = ACTION_LABELS[e.action] ?? e.action.replace(/_/g, ' ').toLowerCase();
              const color = ACTION_COLOR[e.action] ?? DEFAULT_COLOR;
              const hasDiff = e.before || e.after;
              const isExpanded = expanded === e.id;

              return (
                <li key={e.id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">
                        {e.entity_display_name && (
                          <span className="font-medium">{e.entity_display_name} · </span>
                        )}
                        <span className="text-slate-500">{e.actor_display_name}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400" title={new Date(e.occurred_at).toLocaleString()}>
                          {relativeTime(e.occurred_at)}
                        </span>
                        {hasDiff && (
                          <button
                            onClick={() => setExpanded(isExpanded ? null : e.id)}
                            className="text-xs text-brand-500 hover:text-brand-700"
                          >
                            {isExpanded ? 'Hide details' : 'Show details'}
                          </button>
                        )}
                      </div>

                      {isExpanded && hasDiff && (
                        <div className="mt-2 space-y-1.5">
                          {e.before && (
                            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                              <p className="text-[10px] font-semibold text-red-400 uppercase mb-1">Before</p>
                              <pre className="text-xs text-red-700 whitespace-pre-wrap">
                                {JSON.stringify(e.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {e.after && (
                            <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                              <p className="text-[10px] font-semibold text-green-400 uppercase mb-1">After</p>
                              <pre className="text-xs text-green-700 whitespace-pre-wrap">
                                {JSON.stringify(e.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || isFetching}
            className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            ← Newer
          </button>
          <span className="text-xs text-slate-400">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={entries.length < limit || isFetching}
            className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            Older →
          </button>
        </div>
      </div>
    </div>
  );
}

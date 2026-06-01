import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

interface TreeSummary {
  id: string;
  name: string;
  description: string | null;
  role: string;
  person_count: number;
  member_count: number;
}

const ROLE_BADGE: Record<string, string> = {
  OWNER:  'bg-brand-100 text-brand-700',
  ADMIN:  'bg-purple-100 text-purple-700',
  EDITOR: 'bg-green-100  text-green-700',
  VIEWER: 'bg-gray-100   text-gray-600',
};

// ── Tree card ──────────────────────────────────────────────────────────────

interface TreeCardProps {
  tree: TreeSummary;
  onEdit: (tree: TreeSummary) => void;
  onDelete: (tree: TreeSummary) => void;
}

function TreeCard({ tree, onEdit, onDelete }: TreeCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const canEdit = tree.role === 'OWNER' || tree.role === 'ADMIN';

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 hover:border-brand-300 hover:shadow-sm transition-all group">
      <Link to={`/trees/${tree.id}`} className="block p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="text-3xl">🌳</div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE[tree.role] ?? ROLE_BADGE.VIEWER}`}>
            {tree.role.charAt(0) + tree.role.slice(1).toLowerCase()}
          </span>
        </div>

        <h2 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors truncate">
          {tree.name}
        </h2>
        {tree.description && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{tree.description}</p>
        )}

        <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <span><span className="font-semibold text-gray-700">{tree.person_count}</span> people</span>
          <span><span className="font-semibold text-gray-700">{tree.member_count}</span> {tree.member_count === 1 ? 'member' : 'members'}</span>
        </div>
      </Link>

      {/* Actions menu — OWNER or ADMIN */}
      {canEdit && (
        <div className="absolute top-3 right-3" ref={menuRef}>
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen((v) => !v); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Tree options"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 w-44 bg-white rounded-xl border border-gray-200 shadow-lg py-1">
              <button
                onClick={(e) => { e.preventDefault(); setMenuOpen(false); onEdit(tree); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Edit tree
              </button>
              {tree.role === 'OWNER' && (
                <button
                  onClick={(e) => { e.preventDefault(); setMenuOpen(false); onDelete(tree); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete tree
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user        = useAuthStore((s) => s.user);
  const navigate    = useNavigate();

  const [trees,   setTrees]   = useState<TreeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Import .frt
  const importInputRef             = useRef<HTMLInputElement>(null);
  const [importing, setImporting]  = useState(false);
  const [importError, setImportError] = useState('');

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError('');
    try {
      let tree_id: string;

      if (file.name.endsWith('.zip')) {
        // ZIP import — send as multipart/form-data
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${API_BASE}/trees/import-zip`, {
          method: 'POST',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          credentials: 'include',
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any).detail ?? 'Import failed');
        }
        ({ tree_id } = await res.json());
      } else {
        // Plain .frt import — send as JSON
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.frt_version || !data.tree_name) throw new Error('Invalid .frt file format');
        const res = await fetch(`${API_BASE}/trees/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          credentials: 'include',
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any).detail ?? 'Import failed');
        }
        ({ tree_id } = await res.json());
      }

      navigate(`/trees/${tree_id}`);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  // Create tree modal
  const [modalOpen,   setModalOpen]   = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newDesc,     setNewDesc]     = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit tree modal
  const [editTarget,  setEditTarget]  = useState<TreeSummary | null>(null);
  const [editName,    setEditName]    = useState('');
  const [editDesc,    setEditDesc]    = useState('');
  const [editing,     setEditing]     = useState(false);
  const [editError,   setEditError]   = useState('');

  function openEdit(tree: TreeSummary) {
    setEditTarget(tree);
    setEditName(tree.name);
    setEditDesc(tree.description ?? '');
    setEditError('');
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditing(true);
    setEditError('');
    try {
      const res = await fetch(`${API_BASE}/trees/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail ?? 'Failed to update tree');
      }
      const updated = await res.json();
      setTrees((prev) => prev.map((t) => t.id === editTarget.id
        ? { ...t, name: updated.name, description: updated.description }
        : t
      ));
      setEditTarget(null);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditing(false);
    }
  }

  // Delete tree confirmation
  const [deleteTarget, setDeleteTarget] = useState<TreeSummary | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/trees`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load trees');
        return r.json();
      })
      .then(setTrees)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  function openModal() {
    setNewName('');
    setNewDesc('');
    setCreateError('');
    setModalOpen(true);
  }

  async function handleCreateTree(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`${API_BASE}/trees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).detail ?? 'Failed to create tree');
      }
      const tree: TreeSummary = await res.json();
      setTrees((prev) => [tree, ...prev]);
      setModalOpen(false);
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteTree() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE}/trees/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).detail ?? 'Failed to delete tree');
      }
      setTrees((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Your family trees</p>
        </div>
        <div className="flex items-center gap-2">
          {importError && <p className="text-xs text-red-600">{importError}</p>}
          <input
            ref={importInputRef}
            type="file"
            accept=".frt,.zip"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => { setImportError(''); importInputRef.current?.click(); }}
            disabled={importing}
            title="Import a .frt backup or a .zip with photos"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {importing ? 'Importing…' : '↑ Import .frt / .zip'}
          </button>
          <button
            className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
            onClick={openModal}
          >
            + New tree
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && trees.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🌳</div>
          <p className="text-lg font-medium text-gray-600">No family trees yet</p>
          <p className="text-sm mt-1">Create your first tree to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {trees.map((tree) => (
          <TreeCard key={tree.id} tree={tree} onEdit={openEdit} onDelete={setDeleteTarget} />
        ))}
      </div>

      {/* Create tree modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New family tree</h2>
            <form onSubmit={handleCreateTree} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. The Johnson Family"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional description…"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={creating || !newName.trim()}
                  className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
                  {creating ? 'Creating…' : 'Create tree'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit tree modal */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !editing) setEditTarget(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit tree</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  autoFocus
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={255}
                  required
                  className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)} disabled={editing}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={editing || !editName.trim()}
                  className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
                  {editing ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete tree confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete tree?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-800">"{deleteTarget.name}"</span> and all its people,
              family groups, and history will be permanently deleted. This cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteTree} disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Delete tree'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AdminPage — user management dashboard.
 * Visible to ADMIN role only.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@store/auth.store';
import { SEO } from '@shared/components/SEO';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const PAGE_SIZE = 25;

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  given_name: string | null;
  family_name: string | null;
  app_role: 'ADMIN' | 'STANDARD' | 'AUDITOR';
  email_verified: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface UsersResponse {
  total: number;
  items: AdminUser[];
  page: number;
  page_size: number;
  total_pages: number;
}

const ROLE_OPTIONS = ['ADMIN', 'STANDARD', 'AUDITOR'] as const;

const ROLE_BADGE: Record<string, string> = {
  ADMIN:    'bg-purple-100 text-purple-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  AUDITOR:  'bg-amber-100 text-amber-700',
};

// ── Permission Group types ──────────────────────────────────────────────────────

interface PermissionGroup {
  id: string;
  name: string;
  description: string | null;
  permission_level: 'VISIBLE' | 'READ' | 'READ_WRITE';
  assignment_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface GroupAssignment {
  id: string;
  group_id: string;
  user_id: string;
  user_email: string;
  user_display_name: string;
  tree_id: string;
  tree_name: string;
  permission_level: string;
  assigned_by: string | null;
  assigned_at: string;
}

interface TenantTree { id: string; name: string; }

const LEVEL_LABEL: Record<string, string> = {
  VISIBLE:    'Visible',
  READ:       'Read',
  READ_WRITE: 'Read & Write',
};

const LEVEL_BADGE: Record<string, string> = {
  VISIBLE:    'bg-gray-100 text-gray-700',
  READ:       'bg-blue-100 text-blue-700',
  READ_WRITE: 'bg-green-100 text-green-700',
};

const LEVEL_DESC: Record<string, string> = {
  VISIBLE:    'Can see the tree exists but not its content',
  READ:       'Can view all tree content (read-only)',
  READ_WRITE: 'Can view and edit tree content',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function displayName(u: AdminUser) {
  return [u.given_name, u.family_name].filter(Boolean).join(' ') || u.email;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Create user modal ──────────────────────────────────────────────────────────

function CreateUserModal({
  token,
  onClose,
  onCreated,
}: {
  token: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email,      setEmail]      = useState('');
  const [givenName,  setGivenName]  = useState('');
  const [familyName, setFamilyName] = useState('');
  const [role,       setRole]       = useState<'ADMIN' | 'STANDARD' | 'AUDITOR'>('STANDARD');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), given_name: givenName.trim(), family_name: familyName.trim(), app_role: role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail ?? 'Failed to create user');
      }
      await res.json();
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Create user</h2>
        <p className="text-xs text-gray-500 mb-4">An activation email will be sent immediately.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="user@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First name <span className="text-red-500">*</span></label>
              <input type="text" value={givenName} onChange={(e) => setGivenName(e.target.value)} required maxLength={100}
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last name</label>
              <input type="text" value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={100}
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !email.trim() || !givenName.trim()}
              className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create & send email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

function EditUserModal({
  user,
  token,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  token: string | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (updated: AdminUser) => void;
}) {
  const [givenName,  setGivenName]  = useState(user.given_name ?? '');
  const [familyName, setFamilyName] = useState(user.family_name ?? '');
  const [role,       setRole]       = useState(user.app_role);
  const [active,     setActive]     = useState(user.is_active);
  const [verified,   setVerified]   = useState(user.email_verified);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({
          given_name:    givenName.trim() || null,
          family_name:   familyName.trim() || null,
          app_role:      role,
          is_active:     active,
          email_verified: verified,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail ?? 'Failed to save');
      }
      onSaved(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit user</h2>
        {isSelf && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Role, active status, and verification cannot be changed on your own account.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First name</label>
              <input type="text" value={givenName} onChange={(e) => setGivenName(e.target.value)} maxLength={100}
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last name</label>
              <input type="text" value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={100}
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isSelf ? 'text-gray-400' : 'text-gray-600'}`}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              disabled={isSelf}
              title={isSelf ? 'You cannot change your own role' : undefined}
              className={`w-full h-9 px-3 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                isSelf ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50' : 'border-gray-300'
              }`}
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <label className={`flex items-center gap-3 ${isSelf ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={isSelf}
              title={isSelf ? 'You cannot deactivate your own account' : undefined}
              className="w-4 h-4 accent-brand-500 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${isSelf ? 'text-gray-400' : 'text-gray-700'}`}>Account active</span>
          </label>
          <label className={`flex items-center gap-3 ${isSelf ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              disabled={isSelf}
              title={isSelf ? 'You cannot change your own verification status' : undefined}
              className="w-4 h-4 accent-brand-500 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${isSelf ? 'text-gray-400' : 'text-gray-700'}`}>Email verified</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Merge Trees panel ─────────────────────────────────────────────────────────

interface MergePersonOption { id: string; display_given_name: string; display_surname: string; photo_url: string | null; }

function MergeTreesPanel({ token }: { token: string | null }) {
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // All trees in tenant
  const [allTrees, setAllTrees] = useState<TenantTree[]>([]);
  const [loadingTrees, setLoadingTrees] = useState(true);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedTreeIds, setSelectedTreeIds] = useState<string[]>([]);

  // Per-tree person lists
  const [persons, setPersons] = useState<Record<string, MergePersonOption[]>>({});
  const [loadingPersons, setLoadingPersons] = useState<Record<string, boolean>>({});

  // Pivot selections: tree_id → person_id
  const [pivots, setPivots] = useState<Record<string, string>>({});

  // Submit state
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [result, setResult] = useState<{ tree_id: string; tree_name: string; person_count: number } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/admin/trees`, { headers: authHeader, credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAllTrees(data))
      .finally(() => setLoadingTrees(false));
  }, []);

  function toggleTree(id: string) {
    setSelectedTreeIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
    setPivots(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function goToStep2() {
    if (!newName.trim() || selectedTreeIds.length < 2) return;
    setStep(2);
    const missing = selectedTreeIds.filter(tid => !persons[tid]);
    setLoadingPersons(prev => Object.fromEntries(missing.map(tid => [tid, true])));
    await Promise.all(missing.map(async (tid) => {
      try {
        const r = await fetch(`${API_BASE}/admin/trees/${tid}/persons`, { headers: authHeader, credentials: 'include' });
        const data = r.ok ? await r.json() : [];
        setPersons(prev => ({ ...prev, [tid]: data }));
      } finally {
        setLoadingPersons(prev => ({ ...prev, [tid]: false }));
      }
    }));
  }

  async function handleMerge() {
    setMerging(true);
    setMergeError('');
    try {
      const sources = selectedTreeIds.map(tid => ({ tree_id: tid, pivot_person_id: pivots[tid] }));
      const res = await fetch(`${API_BASE}/trees/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        credentials: 'include',
        body: JSON.stringify({ new_tree_name: newName.trim(), new_tree_description: newDesc.trim() || null, sources }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail ?? 'Merge failed');
      }
      setResult(await res.json());
      setStep(3);
    } catch (e) {
      setMergeError((e as Error).message);
    } finally {
      setMerging(false);
    }
  }

  function reset() {
    setStep(1); setNewName(''); setNewDesc(''); setSelectedTreeIds([]);
    setPersons({}); setPivots({}); setMergeError(''); setResult(null);
  }

  const allPivotsSelected = selectedTreeIds.length >= 2 && selectedTreeIds.every(tid => !!pivots[tid]);

  if (loadingTrees) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (step === 3 && result) return (
    <div className="max-w-lg mx-auto py-12 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Trees merged successfully</h2>
      <p className="text-sm text-gray-500 mb-1">
        <span className="font-medium text-gray-700">{result.tree_name}</span> was created with {result.person_count} people.
      </p>
      <div className="mt-6 flex gap-3 justify-center">
        <a
          href={`/trees/${result.tree_id}`}
          className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          Open merged tree
        </a>
        <button onClick={reset} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
          Merge another
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {(['1. Name & select trees', '2. Choose pivot people', '3. Done'] as const).map((label, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-gray-300">›</span>}
            <span className={step === i + 1 ? 'text-brand-600 font-medium' : 'text-gray-400'}>{label}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              New tree name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Combined Family Tree"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              rows={2}
              placeholder="Describe the merged tree…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Select trees to merge <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(minimum 2)</span>
            </p>
            {allTrees.length === 0 ? (
              <p className="text-sm text-gray-400">No trees found.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {allTrees.map(tree => (
                  <label key={tree.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTreeIds.includes(tree.id)}
                      onChange={() => toggleTree(tree.id)}
                      className="rounded border-gray-300 text-brand-500"
                    />
                    <span className="text-sm text-gray-800">{tree.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={goToStep2}
            disabled={!newName.trim() || selectedTreeIds.length < 2}
            className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next: choose pivot people
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            For each tree, select the <span className="font-medium">same real person</span> who connects the trees.
            All pivot people will be merged into one person in the new tree.
          </p>

          {selectedTreeIds.map(tid => {
            const tree = allTrees.find(t => t.id === tid);
            const pList = persons[tid] ?? [];
            const loading = loadingPersons[tid];
            return (
              <div key={tid} className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-800 mb-2">{tree?.name ?? tid}</p>
                {loading ? (
                  <div className="flex justify-center py-3">
                    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : pList.length === 0 ? (
                  <p className="text-xs text-gray-400">No people in this tree.</p>
                ) : (
                  <select
                    value={pivots[tid] ?? ''}
                    onChange={e => setPivots(prev => ({ ...prev, [tid]: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">— select pivot person —</option>
                    {pList.map(p => (
                      <option key={p.id} value={p.id}>
                        {[p.display_given_name, p.display_surname].filter(Boolean).join(' ') || '(unnamed)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}

          {mergeError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{mergeError}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleMerge}
              disabled={!allPivotsSelected || merging}
              className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {merging && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
              {merging ? 'Merging…' : 'Create merged tree'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const accessToken  = useAuthStore((s) => s.accessToken);
  const currentUser  = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<'users' | 'permissions' | 'merge'>('users');

  const [data,     setData]     = useState<UsersResponse | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [roleFilter,  setRoleFilter]  = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [sort,     setSort]     = useState('created_at_desc');

  const [createOpen,      setCreateOpen]      = useState(false);
  const [editTarget,      setEditTarget]      = useState<AdminUser | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUser | null>(null);
  const [actionLoading,   setActionLoading]   = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page), page_size: String(PAGE_SIZE), sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(roleFilter ? { app_role: roleFilter } : {}),
        ...(verifiedFilter !== '' ? { verified: verifiedFilter } : {}),
      });
      const res = await fetch(`${API_BASE}/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load users');
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, debouncedSearch, roleFilter, verifiedFilter, sort]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleVerify(user: AdminUser) {
    setActionLoading(user.id + '_verify');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}/verify`, {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Verification failed');
      const updated: AdminUser = await res.json();
      setData((d) => d ? { ...d, items: d.items.map((u) => u.id === updated.id ? updated : u) } : d);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeactivate(user: AdminUser) {
    setActionLoading(user.id + '_del');
    try {
      await fetch(`${API_BASE}/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: 'include',
      });
      setData((d) => d ? { ...d, items: d.items.map((u) => u.id === user.id ? { ...u, is_active: false } : u) } : d);
    } finally {
      setActionLoading(null);
      setConfirmDeactivate(null);
    }
  }

  function handleSaved(updated: AdminUser) {
    setData((d) => d ? { ...d, items: d.items.map((u) => u.id === updated.id ? updated : u) } : d);
    setEditTarget(null);
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <SEO
        title="Admin Dashboard"
        description="Manage users, roles, and permission groups for your FamilyRoots organisation."
        noIndex
      />
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, roles, and permission groups</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([['users', 'Users'], ['permissions', 'Permission Groups'], ['merge', 'Merge Trees']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === key
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'permissions' && <PermissionGroupsPanel token={accessToken} />}
      {activeTab === 'merge' && <MergeTreesPanel token={accessToken} />}
      {activeTab === 'users' && (<>

      {/* Users tab header actions */}
      <div className="flex items-center justify-between mb-4">
        <span />
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          + Create user
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full h-9 pl-9 pr-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All roles</option>
          <option value="ADMIN">Admin</option>
          <option value="STANDARD">Standard</option>
          <option value="AUDITOR">Auditor</option>
        </select>
        <select value={verifiedFilter} onChange={(e) => { setVerifiedFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All statuses</option>
          <option value="false">Unverified</option>
          <option value="true">Verified</option>
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="created_at_desc">Newest first</option>
          <option value="created_at_asc">Oldest first</option>
          <option value="name_asc">Name A–Z</option>
          <option value="email_asc">Email A–Z</option>
          <option value="last_login_desc">Last active</option>
        </select>
      </div>

      {data && (
        <p className="text-xs text-gray-500 mb-3">
          {data.total} user{data.total !== 1 ? 's' : ''}
          {debouncedSearch || roleFilter || verifiedFilter ? ' matching filters' : ' total'}
          {' · '}Page {data.page} of {data.total_pages}
        </p>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last login</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-50 ${loading ? 'opacity-50' : ''}`}>
                {data?.items.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{displayName(user)}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[user.app_role]}`}>
                        {user.app_role.charAt(0) + user.app_role.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${user.email_verified ? 'text-green-700' : 'text-amber-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.email_verified ? 'bg-green-500' : 'bg-amber-400'}`} />
                          {user.email_verified ? 'Verified' : 'Unverified'}
                        </span>
                        {!user.is_active && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Deactivated
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(user.last_login_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!user.email_verified && (
                          <button
                            onClick={() => handleVerify(user)}
                            disabled={actionLoading === user.id + '_verify'}
                            title="Verify email"
                            className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === user.id + '_verify' ? '…' : 'Verify'}
                          </button>
                        )}
                        <button
                          onClick={() => setEditTarget(user)}
                          title="Edit user"
                          className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        {user.is_active && (
                          <button
                            onClick={() => { if (user.id !== currentUser?.id) setConfirmDeactivate(user); }}
                            disabled={actionLoading === user.id + '_del' || user.id === currentUser?.id}
                            title={user.id === currentUser?.id ? 'Cannot deactivate your own account' : 'Deactivate user'}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
            className="h-8 px-3 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
            ← Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {data.total_pages}</span>
          <button onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))} disabled={page === data.total_pages || loading}
            className="h-8 px-3 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
            Next →
          </button>
        </div>
      )}

      {/* Create user modal */}
      {createOpen && (
        <CreateUserModal
          token={accessToken}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            fetchUsers();
          }}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          token={accessToken}
          isSelf={editTarget.id === currentUser?.id}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Deactivate confirmation */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeactivate(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Deactivate user?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-800">{displayName(confirmDeactivate)}</span> will
              lose access immediately. You can re-activate them via Edit.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDeactivate(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDeactivate(confirmDeactivate)}
                disabled={actionLoading === confirmDeactivate.id + '_del'}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {actionLoading === confirmDeactivate.id + '_del' ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// ── Permission Groups Panel ────────────────────────────────────────────────────

function PermissionGroupsPanel({ token }: { token: string | null }) {
  const [groups, setGroups]           = useState<PermissionGroup[]>([]);
  const [loading, setLoading]         = useState(false);
  const [createOpen, setCreateOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<PermissionGroup | null>(null);
  const [membersTarget, setMembersTarget] = useState<PermissionGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PermissionGroup | null>(null);
  const [error, setError]             = useState('');

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchGroups = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/permission-groups`, { headers: authHeader, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load permission groups');
      setGroups(await res.json());
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function handleDelete(g: PermissionGroup) {
    await fetch(`${API_BASE}/admin/permission-groups/${g.id}`, {
      method: 'DELETE', headers: authHeader, credentials: 'include',
    });
    setDeleteTarget(null);
    fetchGroups();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Define access templates and assign them to users for specific trees.
        </p>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          + Create group
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No permission groups yet. Create one to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Group</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignments</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{g.name}</div>
                    {g.description && <div className="text-xs text-gray-500 mt-0.5">{g.description}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">{LEVEL_DESC[g.permission_level]}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${LEVEL_BADGE[g.permission_level]}`}>
                      {LEVEL_LABEL[g.permission_level]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {g.assignment_count} {g.assignment_count === 1 ? 'user' : 'users'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setMembersTarget(g)}
                        className="px-2.5 py-1 text-xs font-medium text-brand-600 bg-white border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                      >
                        Members
                      </button>
                      <button
                        onClick={() => setEditTarget(g)}
                        className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(g)}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit modal */}
      {(createOpen || editTarget) && (
        <GroupFormModal
          token={token}
          initial={editTarget}
          onClose={() => { setCreateOpen(false); setEditTarget(null); }}
          onSaved={() => { setCreateOpen(false); setEditTarget(null); fetchGroups(); }}
        />
      )}

      {/* Members modal */}
      {membersTarget && (
        <GroupMembersModal
          group={membersTarget}
          token={token}
          onClose={() => { setMembersTarget(null); fetchGroups(); }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete group?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-800">{deleteTarget.name}</span> and all{' '}
              {deleteTarget.assignment_count} assignment{deleteTarget.assignment_count !== 1 ? 's' : ''} will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Group Form Modal (Create / Edit) ───────────────────────────────────────────

function GroupFormModal({
  token, initial, onClose, onSaved,
}: {
  token: string | null;
  initial: PermissionGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,  setName]  = useState(initial?.name ?? '');
  const [desc,  setDesc]  = useState(initial?.description ?? '');
  const [level, setLevel] = useState<'VISIBLE'|'READ'|'READ_WRITE'>(initial?.permission_level ?? 'READ');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const url = initial
        ? `${API_BASE}/admin/permission-groups/${initial.id}`
        : `${API_BASE}/admin/permission-groups`;
      const res = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, permission_level: level }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail ?? 'Failed to save');
      }
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {initial ? 'Edit permission group' : 'Create permission group'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              required maxLength={100} autoFocus
              placeholder="e.g. Viewers, Family Editors…"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={desc} onChange={(e) => setDesc(e.target.value)}
              rows={2} maxLength={500} placeholder="Optional description…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Permission level</label>
            <div className="space-y-2">
              {(['VISIBLE','READ','READ_WRITE'] as const).map((lvl) => (
                <label key={lvl} className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  level === lvl ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="level" value={lvl} checked={level === lvl}
                    onChange={() => setLevel(lvl)} className="mt-0.5 accent-brand-500" />
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${LEVEL_BADGE[lvl]}`}>
                      {LEVEL_LABEL[lvl]}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{LEVEL_DESC[lvl]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Group Members Modal ─────────────────────────────────────────────────────────

function GroupMembersModal({
  group, token, onClose,
}: { group: PermissionGroup; token: string | null; onClose: () => void; }) {
  const [assignments, setAssignments] = useState<GroupAssignment[]>([]);
  const [users,  setUsers]  = useState<{ id: string; email: string; display: string }[]>([]);
  const [trees,  setTrees]  = useState<TenantTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selUser, setSelUser] = useState('');
  const [selTree, setSelTree] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [error,   setError]   = useState('');
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  async function fetchAll() {
    setLoading(true);
    const [aRes, uRes, tRes] = await Promise.all([
      fetch(`${API_BASE}/admin/permission-groups/${group.id}/assignments`, { headers: authHeader, credentials: 'include' }),
      fetch(`${API_BASE}/admin/users?page_size=200`, { headers: authHeader, credentials: 'include' }),
      fetch(`${API_BASE}/admin/trees`, { headers: authHeader, credentials: 'include' }),
    ]);
    if (aRes.ok) setAssignments(await aRes.json());
    if (uRes.ok) {
      const d = await uRes.json();
      setUsers((d.items ?? []).map((u: any) => ({
        id: u.id,
        email: u.email,
        display: [u.given_name, u.family_name].filter(Boolean).join(' ') || u.email,
      })));
    }
    if (tRes.ok) setTrees(await tRes.json());
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/permission-groups/${group.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        credentials: 'include',
        body: JSON.stringify({ user_id: selUser, tree_id: selTree }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail ?? 'Failed to assign');
      }
      setAddOpen(false); setSelUser(''); setSelTree('');
      fetchAll();
    } catch (e) { setError((e as Error).message); }
    finally { setAdding(false); }
  }

  async function handleRemove(assignmentId: string) {
    await fetch(`${API_BASE}/admin/permission-groups/${group.id}/assignments/${assignmentId}`, {
      method: 'DELETE', headers: authHeader, credentials: 'include',
    });
    fetchAll();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{group.name}</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${LEVEL_BADGE[group.permission_level]}`}>
              {LEVEL_LABEL[group.permission_level]}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            {assignments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No users assigned yet.</p>
            ) : (
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">User</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Tree</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Assigned</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{a.user_display_name}</div>
                        <div className="text-xs text-gray-500">{a.user_email}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{a.tree_name}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {new Date(a.assigned_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleRemove(a.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {addOpen ? (
              <form onSubmit={handleAdd} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <p className="text-sm font-medium text-gray-700">Add assignment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">User</label>
                    <select value={selUser} onChange={(e) => setSelUser(e.target.value)} required
                      className="w-full h-9 px-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="">Select user…</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.display} ({u.email})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tree</label>
                    <select value={selTree} onChange={(e) => setSelTree(e.target.value)} required
                      className="w-full h-9 px-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="">Select tree…</option>
                      {trees.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => { setAddOpen(false); setError(''); }}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                  <button type="submit" disabled={adding || !selUser || !selTree}
                    className="px-3 py-1.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50">
                    {adding ? 'Assigning…' : 'Assign'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAddOpen(true)}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
              >
                + Add user to this group
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

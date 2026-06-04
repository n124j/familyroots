/**
 * FamilyTreePage — full-screen canvas route.
 *
 * Route: /trees/:treeId
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SEO } from '@shared/components/SEO';
import { useQuery } from '@tanstack/react-query';
import { TreeCanvas, type TreeCanvasHandle } from '@features/tree/canvas/TreeCanvas';
import { useThemeStore, THEME_PRESETS, PRESET_LABEL, type CanvasTheme } from '@store/theme.store';
import { AVATAR_PRESETS, isPreset, presetDataUri } from '@features/tree/avatarPresets';
import { useCanvasStore } from '@store/canvas.store';
import { useAuthStore } from '@store/auth.store';
import { queryKeys } from '@queries/keys';
import type { ApiTreeGraph } from '@features/tree/types';
import { AuditLogModal } from '@features/audit/AuditLogModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

async function fetchTreeGraph(treeId: string, token: string | null): Promise<ApiTreeGraph> {
  const res = await fetch(`${API_BASE}/trees/${treeId}/graph`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load tree');
  return res.json();
}

async function createPerson(
  treeId: string,
  token: string | null,
  fields: PersonFields,
): Promise<string> {
  const body: Record<string, unknown> = {
    given_name:  fields.givenName,
    surname:     fields.surname,
    sex:         fields.sex,
    is_living:   fields.isLiving,
    is_deceased: !fields.isLiving,
  };
  if (fields.birthDate)      body.birth_date       = fields.birthDate;
  if (fields.deathDate)      body.death_date       = fields.deathDate;
  if (fields.birthYear)      body.birth_year       = parseInt(fields.birthYear, 10);
  if (fields.deathYear)      body.death_year       = parseInt(fields.deathYear, 10);
  if (fields.facebookHandle) body.facebook_handle  = fields.facebookHandle.trim();
  if (fields.xHandle)        body.x_handle         = fields.xHandle.trim().replace(/^@/, '');
  if (fields.linkedinHandle) body.linkedin_handle  = fields.linkedinHandle.trim();
  const res = await fetch(`${API_BASE}/trees/${treeId}/persons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? 'Failed to create person');
  }
  const data = await res.json();
  return data.id as string;
}

// ── Shared person fields ───────────────────────────────────────────────────

interface PersonFields {
  givenName: string;
  surname: string;
  sex: string;
  isLiving: boolean;
  // Optional extra details
  birthDate: string;
  deathDate: string;
  birthYear: string;
  deathYear: string;
  facebookHandle: string;
  xHandle: string;
  linkedinHandle: string;
}

const EMPTY_FIELDS: PersonFields = {
  givenName: '', surname: '', sex: 'UNKNOWN', isLiving: true,
  birthDate: '', deathDate: '', birthYear: '', deathYear: '',
  facebookHandle: '', xHandle: '', linkedinHandle: '',
};

/** Returns an error message if birth or death date/year are both set but disagree, else null. */
function validateDates(fields: {
  birthDate?: string; birthYear?: string;
  deathDate?: string; deathYear?: string;
}): string | null {
  const bd = fields.birthDate?.trim();
  const by = fields.birthYear?.trim();
  if (bd && by) {
    const yearFromDate = new Date(bd + 'T00:00:00').getFullYear();
    const yearOnly     = parseInt(by, 10);
    if (!isNaN(yearOnly) && yearFromDate !== yearOnly) {
      return `Birth date year (${yearFromDate}) doesn't match "Birth year only" (${yearOnly}). Make them consistent or clear one field.`;
    }
  }
  const dd = fields.deathDate?.trim();
  const dy = fields.deathYear?.trim();
  if (dd && dy) {
    const yearFromDate = new Date(dd + 'T00:00:00').getFullYear();
    const yearOnly     = parseInt(dy, 10);
    if (!isNaN(yearOnly) && yearFromDate !== yearOnly) {
      return `Death date year (${yearFromDate}) doesn't match "Death year only" (${yearOnly}). Make them consistent or clear one field.`;
    }
  }
  return null;
}

function PersonFormFields({
  values,
  onChange,
}: {
  values: PersonFields;
  onChange: (v: PersonFields) => void;
}) {
  const [showExtra, setShowExtra] = React.useState(false);

  return (
    <>
      {/* ── Core fields (always visible) ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">First name</label>
          <input
            value={values.givenName}
            onChange={(e) => onChange({ ...values, givenName: e.target.value })}
            className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Given name"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Last name</label>
          <input
            value={values.surname}
            onChange={(e) => onChange({ ...values, surname: e.target.value })}
            className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Surname"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Sex</label>
        <select
          value={values.sex}
          onChange={(e) => onChange({ ...values, sex: e.target.value })}
          className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="UNKNOWN">Unknown</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={values.isLiving}
          onChange={(e) => onChange({ ...values, isLiving: e.target.checked })}
          className="rounded border-slate-300"
        />
        Currently living
      </label>

      {/* ── More details (collapsed by default) ── */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span>More details <span className="text-slate-400 font-normal">(optional)</span></span>
          <span className="text-slate-400 text-[10px]">{showExtra ? '▲ less' : '▼ more'}</span>
        </button>

        {showExtra && (
          <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
            {/* Life dates */}
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Life dates</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Birth date</label>
                <input
                  type="date"
                  value={values.birthDate}
                  onChange={(e) => onChange({ ...values, birthDate: e.target.value })}
                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Birth year only</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  placeholder="e.g. 1950"
                  value={values.birthYear}
                  onChange={(e) => onChange({ ...values, birthYear: e.target.value })}
                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Death date</label>
                <input
                  type="date"
                  value={values.deathDate}
                  onChange={(e) => onChange({ ...values, deathDate: e.target.value })}
                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Death year only</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  placeholder="e.g. 2005"
                  value={values.deathYear}
                  onChange={(e) => onChange({ ...values, deathYear: e.target.value })}
                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Date consistency error */}
            {(() => {
              const msg = validateDates(values);
              if (!msg) return null;
              return (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {msg}
                </p>
              );
            })()}

            {/* Social profiles */}
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 pt-1">Social profiles</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] font-medium text-slate-500 shrink-0">Facebook</span>
                <input
                  type="text"
                  placeholder="username"
                  value={values.facebookHandle}
                  onChange={(e) => onChange({ ...values, facebookHandle: e.target.value })}
                  className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] font-medium text-slate-500 shrink-0">X / Twitter</span>
                <input
                  type="text"
                  placeholder="@handle"
                  value={values.xHandle}
                  onChange={(e) => onChange({ ...values, xHandle: e.target.value })}
                  className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] font-medium text-slate-500 shrink-0">LinkedIn</span>
                <input
                  type="text"
                  placeholder="in/username"
                  value={values.linkedinHandle}
                  onChange={(e) => onChange({ ...values, linkedinHandle: e.target.value })}
                  className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Add Person Modal (standalone, from top bar) ────────────────────────────

interface AddPersonModalProps {
  treeId: string;
  token: string | null;
  onClose: () => void;
  onAdded: () => void;
}

function AddPersonModal({ treeId, token, onClose, onAdded }: AddPersonModalProps) {
  const [fields,  setFields]  = useState<PersonFields>(EMPTY_FIELDS);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateErr = validateDates(fields);
    if (dateErr) { setError(dateErr); return; }
    setLoading(true);
    setError('');
    try {
      await createPerson(treeId, token, fields);
      onAdded();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-bold text-slate-900 mb-4">Add person</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <PersonFormFields values={fields} onChange={setFields} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {loading ? 'Adding…' : 'Add person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Relation Modal (Add Parent / Child / Spouse) ───────────────────────

type RelationMode = 'parent' | 'child' | 'spouse';

const RELATION_CONFIG: Record<RelationMode, { label: string; linkBody: (id: string) => Record<string, unknown>; linkPath: (anchor: string) => string }> = {
  parent: {
    label: 'Add Parent',
    linkPath: (anchor) => `parents`,
    linkBody: (newId) => ({ parent_id: newId, parentage_type: 'BIOLOGICAL', union_type: 'UNKNOWN' }),
  },
  child: {
    label: 'Add Child',
    linkPath: (anchor) => `children`,
    linkBody: (newId) => ({ child_id: newId, parentage_type: 'BIOLOGICAL', union_type: 'UNKNOWN' }),
  },
  spouse: {
    label: 'Add Spouse',
    linkPath: (anchor) => `spouses`,
    linkBody: (newId) => ({ spouse_id: newId, union_type: 'MARRIAGE' }),
  },
};

interface AddRelationModalProps {
  mode: RelationMode;
  anchorPersonId: string;
  anchorName: string;
  treeId: string;
  token: string | null;
  candidates: CandidatePerson[];
  onClose: () => void;
  onAdded: () => void;
}

const SEX_INITIAL_COLOR: Record<string, string> = {
  MALE:    'bg-blue-100 text-blue-600',
  FEMALE:  'bg-pink-100 text-pink-600',
  OTHER:   'bg-purple-100 text-purple-600',
  UNKNOWN: 'bg-gray-100 text-gray-500',
};

function AddRelationModal({
  mode, anchorPersonId, anchorName, treeId, token, candidates, onClose, onAdded,
}: AddRelationModalProps) {
  const [inputMode,  setInputMode]  = useState<'new' | 'existing'>('new');
  const [fields,     setFields]     = useState<PersonFields>(EMPTY_FIELDS);
  const [search,     setSearch]     = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const cfg = RELATION_CONFIG[mode];

  async function link(personId: string, force = false) {
    const suffix = force ? '?force=true' : '';
    const res = await fetch(
      `${API_BASE}/trees/${treeId}/persons/${anchorPersonId}/${cfg.linkPath(anchorPersonId)}${suffix}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify(cfg.linkBody(personId)),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail ?? 'Failed to link relationship');
    }
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateErr = validateDates(fields);
    if (dateErr) { setError(dateErr); return; }
    setLoading(true); setError('');
    try {
      const newId = await createPerson(treeId, token, fields);
      await link(newId);
      onAdded();
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  async function handleExistingSubmit() {
    if (!selectedId) return;
    const candidate = candidates.find((c) => c.id === selectedId);
    const force = mode === 'child' && (candidate?.hasParents ?? false);
    setLoading(true); setError('');
    try {
      await link(selectedId, force);
      onAdded();
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  const filtered = candidates.filter((p) =>
    `${p.displayGivenName} ${p.displaySurname}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCandidate = candidates.find((c) => c.id === selectedId);

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-bold text-slate-900 mb-0.5">{cfg.label}</h2>
        {anchorName && <p className="text-xs text-slate-400 mb-4">for {anchorName}</p>}

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4">
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setInputMode(m); setError(''); setSelectedId(null); setSearch(''); }}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                inputMode === m ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {m === 'new' ? 'New person' : 'Existing member'}
            </button>
          ))}
        </div>

        {inputMode === 'new' ? (
          <form onSubmit={handleNewSubmit} className="space-y-3">
            <PersonFormFields values={fields} onChange={setFields} />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                {loading ? 'Adding…' : cfg.label}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">
                  {candidates.length === 0 ? 'No other members in this tree' : 'No matches'}
                </p>
              )}
              {filtered.map((p) => {
                const name = `${p.displayGivenName} ${p.displaySurname}`.trim() || 'Unknown';
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                      isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${SEX_INITIAL_COLOR[p.sex] ?? SEX_INITIAL_COLOR.UNKNOWN}`}>
                      {name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className={`text-sm flex-1 truncate ${isSelected ? 'text-brand-700 font-medium' : 'text-slate-700'}`}>
                      {name}
                    </span>
                    {p.hasParents && mode === 'child' && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                        has parents
                      </span>
                    )}
                    {isSelected && !p.hasParents && <span className="text-brand-500 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedCandidate?.hasParents && mode === 'child' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This person already has parents recorded. Linking here will replace their existing parent connection.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExistingSubmit}
                disabled={loading || !selectedId}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {loading ? 'Linking…' : `Link as ${mode}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Child to union modal ───────────────────────────────────────────────

interface CandidatePerson {
  id: string;
  displayGivenName: string;
  displaySurname: string;
  sex: string;
  hasParents: boolean; // already a child in another family group
}

interface AddChildToUnionModalProps {
  fgId: string;
  parent1Id: string;
  parent2Id: string | null;
  parent1Name: string;
  parent2Name: string;
  treeId: string;
  token: string | null;
  candidates: CandidatePerson[]; // existing persons that can be linked
  onClose: () => void;
  onAdded: () => void;
  onRemoved: () => void;
}

function AddChildToUnionModal({
  fgId, parent1Id, parent2Id, parent1Name, parent2Name,
  treeId, token, candidates, onClose, onAdded, onRemoved,
}: AddChildToUnionModalProps) {
  const [mode,        setMode]        = useState<'new' | 'existing'>('new');
  const [fields,      setFields]      = useState<PersonFields>(EMPTY_FIELDS);
  const [search,      setSearch]      = useState('');
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing,    setRemoving]    = useState(false);

  const unionLabel = parent2Id
    ? `${parent1Name} & ${parent2Name}`
    : parent1Name;

  async function handleRemoveUnion() {
    setRemoving(true);
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/family-groups/${fgId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove union');
      onRemoved();
    } catch (err) {
      setError((err as Error).message);
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  async function linkChild(childId: string, force = false) {
    const body: Record<string, unknown> = {
      child_id: childId,
      parentage_type: 'BIOLOGICAL',
      union_type: 'UNKNOWN',
    };
    if (parent2Id) body.other_parent_id = parent2Id;
    const url = `${API_BASE}/trees/${treeId}/persons/${parent1Id}/children${force ? '?force=true' : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail ?? 'Failed to link child');
    }
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateErr = validateDates(fields);
    if (dateErr) { setError(dateErr); return; }
    setLoading(true);
    setError('');
    try {
      const newId = await createPerson(treeId, token, fields);
      await linkChild(newId);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExistingSubmit() {
    if (!selectedId) return;
    const candidate = candidates.find((c) => c.id === selectedId);
    setLoading(true);
    setError('');
    try {
      await linkChild(selectedId, candidate?.hasParents ?? false);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = candidates.filter((p) => {
    const name = `${p.displayGivenName} ${p.displaySurname}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });


  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-0.5">
          <h2 className="font-bold text-slate-900">Add Child</h2>
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
            title="Remove this union"
          >
            Remove union
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">for {unionLabel}</p>

        {/* Mode tabs */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4">
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(''); setSelectedId(null); }}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {m === 'new' ? 'New person' : 'Existing person'}
            </button>
          ))}
        </div>

        {/* Remove union confirmation */}
        {confirmRemove && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
            <p className="text-sm font-medium text-red-800">Remove this union?</p>
            <p className="text-xs text-red-600">
              This removes the <span className="font-semibold">{unionLabel}</span> union and all its
              parent/child links. The people themselves stay in the tree.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                disabled={removing}
                className="flex-1 h-8 text-xs border border-red-300 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveUnion}
                disabled={removing}
                className="flex-1 h-8 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Yes, remove'}
              </button>
            </div>
          </div>
        )}

        {mode === 'new' ? (
          <form onSubmit={handleNewSubmit} className="space-y-3">
            <PersonFormFields values={fields} onChange={setFields} />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                {loading ? 'Adding…' : 'Add child'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">
                  {candidates.length === 0 ? 'No available persons in this tree' : 'No matches'}
                </p>
              )}
              {filtered.map((p) => {
                const name = `${p.displayGivenName} ${p.displaySurname}`.trim() || 'Unknown';
                const initial = name[0]?.toUpperCase() ?? '?';
                const colorCls = SEX_INITIAL_COLOR[p.sex] ?? SEX_INITIAL_COLOR.UNKNOWN;
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                      isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${colorCls}`}>
                      {initial}
                    </div>
                    <span className={`text-sm flex-1 truncate ${isSelected ? 'text-brand-700 font-medium' : 'text-slate-700'}`}>
                      {name}
                    </span>
                    {p.hasParents && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                        has parents
                      </span>
                    )}
                    {isSelected && !p.hasParents && <span className="text-brand-500 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedId && candidates.find((c) => c.id === selectedId)?.hasParents && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This person already has parents recorded. Linking here will
                replace their existing parent connection.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExistingSubmit}
                disabled={loading || !selectedId}
                className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {loading ? 'Linking…' : 'Link as child'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Profile photo upload helper ───────────────────────────────────────────

async function uploadPersonPhoto(
  file: File,
  treeId: string,
  personId: string,
  token: string | null,
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/trees/${treeId}/persons/${personId}/photo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? 'Upload failed');
  }
  const { photo_url } = await res.json();
  return photo_url as string;
}

// ── Edit person modal ──────────────────────────────────────────────────────

interface EditPersonFields {
  givenName: string;
  surname: string;
  sex: string;
  status: 'living' | 'deceased' | 'unknown';
  birthDate: string;
  deathDate: string;
  birthYear: string;
  deathYear: string;
  facebookHandle: string;
  xHandle: string;
  linkedinHandle: string;
}

interface EditPersonModalProps {
  personId: string;
  initial: EditPersonFields;
  initialPhotoUrl?: string;
  treeId: string;
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
  onRefresh?: () => void;
}

function EditPersonModal({ personId, initial, initialPhotoUrl, treeId, token, onClose, onSaved, onRefresh }: EditPersonModalProps) {
  const [fields,       setFields]       = useState<EditPersonFields>(initial);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [photoUrl,     setPhotoUrl]     = useState<string | undefined>(initialPhotoUrl);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError,   setPhotoError]   = useState('');
  const [showPresets,  setShowPresets]  = useState(false);
  const [showExtra,    setShowExtra]    = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoError('Please select an image file.'); return; }

    setPhotoLoading(true);
    setPhotoError('');
    try {
      const url = await uploadPersonPhoto(file, treeId, personId, token);
      setPhotoUrl(url);
      onRefresh?.();
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSelectPreset(presetId: string) {
    setPhotoLoading(true);
    setPhotoError('');
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/persons/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ photo_url: presetId }),
      });
      if (!res.ok) throw new Error('Failed to set avatar');
      setPhotoUrl(presetId);
      setShowPresets(false);
      onRefresh?.();
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoLoading(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoLoading(true);
    setPhotoError('');
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/persons/${personId}/photo`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove photo');
      setPhotoUrl(undefined);
      setShowPresets(false);
      onRefresh?.();
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateErr = validateDates(fields);
    if (dateErr) { setError(dateErr); return; }
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        given_name:  fields.givenName,
        surname:     fields.surname,
        sex:         fields.sex,
        is_living:   fields.status === 'living',
        is_deceased: fields.status === 'deceased',
      };
      if (fields.birthDate)       body.birth_date       = fields.birthDate;
      if (fields.deathDate)       body.death_date       = fields.deathDate;
      if (fields.birthYear)       body.birth_year       = parseInt(fields.birthYear, 10);
      if (fields.deathYear)       body.death_year       = parseInt(fields.deathYear, 10);
      if (fields.facebookHandle)  body.facebook_handle  = fields.facebookHandle.trim();
      if (fields.xHandle)         body.x_handle         = fields.xHandle.trim().replace(/^@/, '');
      if (fields.linkedinHandle)  body.linkedin_handle  = fields.linkedinHandle.trim();
      const res = await fetch(`${API_BASE}/trees/${treeId}/persons/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail ?? 'Failed to save');
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const initials = [fields.givenName[0], fields.surname[0]].filter(Boolean).join('').toUpperCase() || '?';

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-bold text-slate-900 mb-4">Edit person</h2>

        {/* Photo section */}
        <div className="mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-slate-500 font-semibold text-lg">
                {photoLoading ? (
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                ) : photoUrl ? (
                  <img
                    src={isPreset(photoUrl) ? presetDataUri(photoUrl)! : photoUrl}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoLoading}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-500 text-white rounded-full flex items-center justify-center hover:bg-brand-600 disabled:opacity-50 shadow"
                title="Upload photo"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 1v10M1 6h10" />
                </svg>
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-700">Profile photo</p>
              <p className="text-xs text-slate-400 mt-0.5">JPG, PNG or WEBP · max 10 MB</p>
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setShowPresets((v) => !v)}
                  disabled={photoLoading}
                  className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  {showPresets ? 'Hide presets' : 'Choose avatar'}
                </button>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={photoLoading}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
              {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          {/* Preset avatar grid */}
          {showPresets && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  disabled={photoLoading}
                  className={`rounded-full overflow-hidden w-12 h-12 mx-auto ring-2 transition-all disabled:opacity-50 ${
                    photoUrl === preset.id ? 'ring-brand-500 scale-110' : 'ring-transparent hover:ring-slate-300'
                  }`}
                  title={preset.label}
                >
                  <img src={presetDataUri(preset.id)!} alt={preset.label} className="w-full h-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">First name</label>
              <input
                value={fields.givenName}
                onChange={(e) => setFields((f) => ({ ...f, givenName: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Given name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Last name</label>
              <input
                value={fields.surname}
                onChange={(e) => setFields((f) => ({ ...f, surname: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Surname"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Sex</label>
            <select
              value={fields.sex}
              onChange={(e) => setFields((f) => ({ ...f, sex: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['living', 'deceased', 'unknown'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFields((f) => ({ ...f, status: s }))}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                    fields.status === s ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {/* ── Extra details collapsible ── */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowExtra((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <span>More details</span>
              <span className="text-slate-400">{showExtra ? '▲' : '▼'}</span>
            </button>

            {showExtra && (
              <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                {/* Dates */}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Life dates</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Birth date</label>
                    <input
                      type="date"
                      value={fields.birthDate}
                      onChange={(e) => setFields((f) => ({ ...f, birthDate: e.target.value }))}
                      className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Birth year only</label>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      placeholder="e.g. 1950"
                      value={fields.birthYear}
                      onChange={(e) => setFields((f) => ({ ...f, birthYear: e.target.value }))}
                      className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Death date</label>
                    <input
                      type="date"
                      value={fields.deathDate}
                      onChange={(e) => setFields((f) => ({ ...f, deathDate: e.target.value }))}
                      className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Death year only</label>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      placeholder="e.g. 2005"
                      value={fields.deathYear}
                      onChange={(e) => setFields((f) => ({ ...f, deathYear: e.target.value }))}
                      className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {/* Date consistency error */}
                {(() => {
                  const msg = validateDates(fields);
                  if (!msg) return null;
                  return (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {msg}
                    </p>
                  );
                })()}

                {/* Social */}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 pt-1">Social profiles</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-[10px] font-medium text-slate-500 shrink-0">Facebook</span>
                    <input
                      type="text"
                      placeholder="username"
                      value={fields.facebookHandle}
                      onChange={(e) => setFields((f) => ({ ...f, facebookHandle: e.target.value }))}
                      className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-[10px] font-medium text-slate-500 shrink-0">X / Twitter</span>
                    <input
                      type="text"
                      placeholder="@handle"
                      value={fields.xHandle}
                      onChange={(e) => setFields((f) => ({ ...f, xHandle: e.target.value }))}
                      className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-[10px] font-medium text-slate-500 shrink-0">LinkedIn</span>
                    <input
                      type="text"
                      placeholder="in/username"
                      value={fields.linkedinHandle}
                      onChange={(e) => setFields((f) => ({ ...f, linkedinHandle: e.target.value }))}
                      className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={loading || photoLoading}
              className="flex-1 h-9 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Person Profile Modal ───────────────────────────────────────────────────

interface PersonDetailFull {
  id: string;
  display_given_name: string;
  display_surname: string;
  sex: string;
  is_living: boolean;
  is_deceased: boolean;
  photo_url?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  facebook_handle?: string | null;
  x_handle?: string | null;
  linkedin_handle?: string | null;
  parents: string[];
  children: string[];
  spouses: string[];
  siblings: string[];
}

const PROFILE_SEX_LABEL: Record<string, string> = {
  MALE: 'Male', FEMALE: 'Female', OTHER: 'Other', UNKNOWN: 'Unknown',
};
const PROFILE_SEX_BADGE: Record<string, string> = {
  MALE: 'bg-blue-100 text-blue-700', FEMALE: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-purple-100 text-purple-700', UNKNOWN: 'bg-gray-100 text-gray-600',
};
const PROFILE_SEX_AVATAR: Record<string, string> = {
  MALE: 'bg-blue-100 text-blue-600', FEMALE: 'bg-pink-100 text-pink-600',
  OTHER: 'bg-purple-100 text-purple-600', UNKNOWN: 'bg-gray-100 text-gray-500',
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return iso; }
}

interface PersonProfileModalProps {
  initialPersonId: string;
  treeId: string;
  token: string | null;
  graph: import('@features/tree/types').ApiTreeGraph | null;
  onClose: () => void;
}

function PersonProfileModal({ initialPersonId, treeId, token, graph, onClose }: PersonProfileModalProps) {
  // Navigation history within the modal — allows clicking relatives to browse
  const [history, setHistory] = useState<string[]>([initialPersonId]);
  const personId = history[history.length - 1];

  const [detail,  setDetail]  = useState<PersonDetailFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState('');

  useEffect(() => {
    setLoading(true);
    setFetchErr('');
    setDetail(null);
    fetch(`${API_BASE}/trees/${treeId}/persons/${personId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((r) => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(setDetail)
      .catch(() => setFetchErr('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [personId, treeId, token]);

  // Build name + photo maps from the already-loaded graph (zero extra requests)
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    graph?.persons.forEach((p) => { m[p.id] = `${p.displayGivenName} ${p.displaySurname}`.trim() || 'Unknown'; });
    return m;
  }, [graph]);

  const graphPersonMap = useMemo(() => {
    const m: Record<string, import('@features/tree/types').ApiPerson> = {};
    graph?.persons.forEach((p) => { m[p.id] = p; });
    return m;
  }, [graph]);

  const navigateTo  = (id: string) => setHistory((h) => [...h, id]);
  const navigateBack = () => setHistory((h) => h.length > 1 ? h.slice(0, -1) : h);

  const fullName  = detail
    ? `${detail.display_given_name} ${detail.display_surname}`.trim() || 'Unknown'
    : (nameMap[personId] ?? '…');
  const initial   = (fullName[0] ?? '?').toUpperCase();
  const sex       = detail?.sex ?? 'UNKNOWN';
  const avatarCls = PROFILE_SEX_AVATAR[sex] ?? PROFILE_SEX_AVATAR.UNKNOWN;
  const badgeCls  = PROFILE_SEX_BADGE[sex]  ?? PROFILE_SEX_BADGE.UNKNOWN;

  const hasRelatives = detail && (
    detail.parents.length + detail.spouses.length + detail.children.length + detail.siblings.length > 0
  );

  function RelGroup({ ids, label }: { ids: string[]; label: string }) {
    if (!ids.length) return null;
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 pb-1">{label}</p>
        {ids.map((id) => {
          const gp   = graphPersonMap[id];
          const name = nameMap[id] ?? 'Unknown';
          const photo = gp?.photoUrl;
          const aCls = PROFILE_SEX_AVATAR[gp?.sex ?? 'UNKNOWN'] ?? PROFILE_SEX_AVATAR.UNKNOWN;
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigateTo(id)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-gray-50 group transition-colors text-left"
            >
              {photo ? (
                <img
                  src={isPreset(photo) ? presetDataUri(photo)! : photo}
                  alt={name}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${aCls}`}>
                  {name[0]?.toUpperCase() ?? '?'}
                </span>
              )}
              <span className="text-sm text-gray-800 group-hover:text-brand-600 transition-colors flex-1 truncate">{name}</span>
              <span className="text-gray-300 group-hover:text-brand-400 text-xs">›</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {history.length > 1 && (
              <button
                onClick={navigateBack}
                className="text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0"
              >
                ←
              </button>
            )}
            <span className="text-sm font-semibold text-gray-900 truncate">{fullName}</span>
          </div>
          <button
            onClick={onClose}
            className="ml-3 w-7 h-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {fetchErr && <p className="p-6 text-sm text-red-600">{fetchErr}</p>}

          {!loading && detail && (
            <div className="p-5 space-y-4">

              {/* Person header */}
              <div className="flex items-start gap-4">
                {detail.photo_url ? (
                  <img
                    src={isPreset(detail.photo_url) ? presetDataUri(detail.photo_url)! : detail.photo_url}
                    alt={fullName}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 ${avatarCls}`}>
                    {initial}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 leading-tight break-words">{fullName}</h2>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeCls}`}>
                      {PROFILE_SEX_LABEL[detail.sex] ?? detail.sex}
                    </span>
                    {detail.is_deceased ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Deceased</span>
                    ) : detail.is_living ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Living</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Extra details */}
              {(detail.birth_date || detail.birth_year || detail.death_date || detail.death_year ||
                detail.facebook_handle || detail.x_handle || detail.linkedin_handle) && (
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden text-sm">
                  {(detail.birth_date || detail.birth_year) && (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-green-500 shrink-0">●</span>
                      <span className="text-xs text-gray-400 w-9 shrink-0">Born</span>
                      <span className="text-gray-800">
                        {detail.birth_date ? fmtDate(detail.birth_date) : detail.birth_year}
                      </span>
                    </div>
                  )}
                  {(detail.is_deceased || detail.death_date || detail.death_year) && (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-gray-400 text-xs shrink-0">✝</span>
                      <span className="text-xs text-gray-400 w-9 shrink-0">Died</span>
                      <span className="text-gray-800">
                        {detail.death_date ? fmtDate(detail.death_date) : detail.death_year ?? 'Unknown'}
                      </span>
                    </div>
                  )}
                  {detail.facebook_handle && (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-[#1877f2] font-bold text-xs shrink-0">f</span>
                      <span className="text-xs text-gray-400 w-9 shrink-0">FB</span>
                      <a href={`https://facebook.com/${detail.facebook_handle}`} target="_blank" rel="noopener noreferrer"
                        className="text-brand-600 hover:underline truncate">{detail.facebook_handle}</a>
                    </div>
                  )}
                  {detail.x_handle && (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-bold text-xs shrink-0">𝕏</span>
                      <span className="text-xs text-gray-400 w-9 shrink-0">X</span>
                      <a href={`https://x.com/${detail.x_handle}`} target="_blank" rel="noopener noreferrer"
                        className="text-brand-600 hover:underline truncate">@{detail.x_handle}</a>
                    </div>
                  )}
                  {detail.linkedin_handle && (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-[#0a66c2] font-bold text-xs shrink-0">in</span>
                      <span className="text-xs text-gray-400 w-9 shrink-0">LinkedIn</span>
                      <a href={`https://linkedin.com/in/${detail.linkedin_handle}`} target="_blank" rel="noopener noreferrer"
                        className="text-brand-600 hover:underline truncate">{detail.linkedin_handle}</a>
                    </div>
                  )}
                </div>
              )}

              {/* Relationships */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Relationships</span>
                </div>
                {hasRelatives ? (
                  <div className="divide-y divide-gray-50 p-1 space-y-1">
                    <RelGroup ids={detail.parents}  label="Parents" />
                    <RelGroup ids={detail.spouses}  label="Spouses / Partners" />
                    <RelGroup ids={detail.children} label="Children" />
                    <RelGroup ids={detail.siblings} label="Siblings" />
                  </div>
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">No relationships recorded yet.</p>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Selection panel (right drawer) ────────────────────────────────────────

interface SelectionPanelProps {
  personId: string | null;
  personName: string;
  treeId: string;
  token: string | null;
  canWrite: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onAddParent: () => void;
  onAddChild: () => void;
  onAddSpouse: () => void;
  onSetFocus: () => void;
  onDeleted: () => void;
  onEdit: () => void;
}

function SelectionPanel({
  personId, personName, treeId, token, canWrite,
  onClose, onOpenProfile, onAddParent, onAddChild, onAddSpouse, onSetFocus, onDeleted, onEdit,
}: SelectionPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState('');

  if (!personId) return null;

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/persons/${personId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail ?? 'Failed to delete');
      }
      onDeleted();
    } catch (err: any) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-72 bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-slate-700">Person</span>
          {personName && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{personName}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200"
          >
            👤 Open Profile
          </button>
          {canWrite && (
            <button onClick={onEdit}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
              ✏️ Edit
            </button>
          )}
          {canWrite && (
            <button onClick={onAddParent}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
              ➕ Add Parent
            </button>
          )}
          {canWrite && (
            <button onClick={onAddChild}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
              ➕ Add Child
            </button>
          )}
          {canWrite && (
            <button onClick={onAddSpouse}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
              ➕ Add Spouse
            </button>
          )}
          <button onClick={onSetFocus}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200">
            🎯 Set as Focus
          </button>

          {/* Divider + delete — write only */}
          {canWrite && (
            <>
              <div className="pt-2 border-t border-slate-100" />
              {!confirmDelete ? (
                <button
                  onClick={() => { setDeleteError(''); setConfirmDelete(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 border border-red-100"
                >
                  🗑 Delete person
                </button>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                  <p className="text-xs text-red-700 font-medium">
                    Remove <span className="font-semibold">{personName || 'this person'}</span> from the tree?
                  </p>
                  {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmDelete(false); setDeleteError(''); }}
                      disabled={deleting}
                      className="flex-1 h-7 text-xs border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 h-7 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Members modal ─────────────────────────────────────────────────────────

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string | null;
  email: string;
  display_name: string;
}

const ROLE_COLOR: Record<string, string> = {
  OWNER:  'bg-brand-100 text-brand-700',
  ADMIN:  'bg-purple-100 text-purple-700',
  EDITOR: 'bg-green-100 text-green-700',
  VIEWER: 'bg-gray-100 text-gray-500',
};

function MembersModal({
  treeId, token, currentUserId, onClose,
}: {
  treeId: string;
  token: string | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const [members,  setMembers]  = useState<Member[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/trees/${treeId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then((r) => r.json())
      .then(setMembers)
      .catch(() => setError('Failed to load members'))
      .finally(() => setLoading(false));
  }, [treeId, token]);

  const myRole = members.find((m) => m.user_id === currentUserId)?.role ?? '';
  const canRemove = myRole === 'OWNER' || myRole === 'ADMIN';

  async function handleRemove(member: Member) {
    setRemoving(member.user_id);
    try {
      const res = await fetch(`${API_BASE}/trees/${treeId}/members/${member.user_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail ?? 'Failed to remove member');
      }
      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-slate-900">Members</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">✕</button>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-red-600 px-2">{error}</p>}
          {!loading && members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-500 flex-shrink-0">
                {(m.display_name[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{m.display_name}</p>
                <p className="text-xs text-slate-400 truncate">{m.email}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLOR[m.role] ?? ROLE_COLOR.VIEWER}`}>
                {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
              </span>
              {canRemove && m.user_id !== currentUserId && m.role !== 'OWNER' && (
                <button
                  onClick={() => handleRemove(m)}
                  disabled={removing === m.user_id}
                  className="ml-1 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors flex-shrink-0"
                  title="Remove member"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────

function TreeTopBar({
  treeName,
  treeDescription,
  personCount,
  graph,
  token,
  canWrite,
  onAddPerson,
  onMembers,
  onLayouts,
  onExportCsv,
  onExportPdf,
  onTheme,
  onShowActivity,
}: {
  treeName: string;
  treeDescription?: string | null;
  personCount: number;
  graph: import('@features/tree/types').ApiTreeGraph | null;
  token: string | null;
  canWrite: boolean;
  onAddPerson: () => void;
  onMembers: () => void;
  onLayouts: () => void;
  onExportCsv: () => void;
  onExportPdf: () => Promise<void>;
  onTheme: () => void;
  onShowActivity: () => void;
}) {
  const [exportOpen,    setExportOpen]    = React.useState(false);
  const [moreOpen,      setMoreOpen]      = React.useState(false);
  const [exportingPdf,  setExportingPdf]  = React.useState(false);
  const [exportingZip,  setExportingZip]  = React.useState(false);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);
  const moreMenuRef   = React.useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  React.useEffect(() => {
    if (!exportOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [exportOpen]);

  // Close mobile "more" menu when clicking outside
  React.useEffect(() => {
    if (!moreOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [moreOpen]);

  async function handleExportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    setExportOpen(false);
    try { await onExportPdf(); }
    finally { setExportingPdf(false); }
  }

  function handleExportFrt() {
    if (!graph) return;
    setExportOpen(false);
    const payload = {
      frt_version: '1.0',
      exported_at: new Date().toISOString(),
      tree_name: treeName,
      tree_description: treeDescription ?? null,
      persons: graph.persons.map((p) => ({
        id: p.id,
        display_given_name: p.displayGivenName,
        display_surname: p.displaySurname,
        sex: p.sex,
        is_living: p.isLiving,
        is_deceased: p.isDeceased,
        ...(p.photoUrl ? { photo_url: p.photoUrl } : {}),
      })),
      family_groups: graph.familyGroups.map((fg) => ({
        id: fg.id,
        union_type: fg.unionType,
        parent_ids: fg.parentIds,
        children: fg.children,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${treeName.replace(/\s+/g, '_')}.frt`;
    a.click();
    URL.revokeObjectURL(url);
    fetch(`${API_BASE}/trees/${graph.treeId}/export-log`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    }).catch(() => {});
  }

  async function handleExportZip() {
    if (!graph || exportingZip) return;
    setExportOpen(false);
    setExportingZip(true);
    try {
      const res = await fetch(`${API_BASE}/trees/${graph.treeId}/export-zip`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${treeName.replace(/\s+/g, '_')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      fetch(`${API_BASE}/trees/${graph.treeId}/export-log`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      }).catch(() => {});
    } catch {
      // silently ignore
    } finally {
      setExportingZip(false);
    }
  }

  function handleExportCsv() {
    setExportOpen(false);
    onExportCsv();
  }

  const anyExporting = exportingPdf || exportingZip;

  return (
    <div className="absolute top-0 left-0 right-0 h-12 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center px-3 md:px-4 gap-2 md:gap-3 z-30">
      <Link to="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors text-sm shrink-0">
        ← <span className="hidden sm:inline">Dashboard</span>
      </Link>
      <div className="w-px h-5 bg-slate-200 shrink-0" />
      <span className="font-semibold text-slate-800 text-sm truncate min-w-0">{treeName}</span>
      <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">{personCount} people</span>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">

        {/* ── Export dropdown (hidden on mobile, shown md+) ── */}
        <div className="relative hidden md:block" ref={exportMenuRef}>
          <button
            onClick={() => setExportOpen((o) => !o)}
            disabled={!graph || anyExporting}
            title="Export tree data"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {anyExporting ? (
              <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M5.5 1v6M2.5 5l3 3 3-3" />
                <path d="M1 9.5h9" />
              </svg>
            )}
            Export
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3" />
            </svg>
          </button>

          {exportOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
              <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                Export
              </div>
              <div className="py-1">
                {/* PDF */}
                <button
                  onClick={handleExportPdf}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400 shrink-0">
                    <path d="M2 2a1 1 0 011-1h5l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z" />
                    <path d="M8 1v3h3" />
                    <path d="M4 8h6M4 10h4" strokeLinecap="round" />
                  </svg>
                  Export as PDF
                </button>

                {/* CSV */}
                <button
                  onClick={handleExportCsv}
                  disabled={!graph}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-500 shrink-0">
                    <rect x="1" y="1" width="12" height="12" rx="1.5" />
                    <path d="M1 4.5h12M4.5 4.5v8.5M1 7.5h12M1 10.5h12" strokeLinecap="round" />
                  </svg>
                  Export as CSV
                </button>

                {/* FRT */}
                <button
                  onClick={handleExportFrt}
                  disabled={!graph}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-400 shrink-0">
                    <path d="M2 2a1 1 0 011-1h5l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z" />
                    <path d="M8 1v3h3" />
                    <path d="M4 7h4M4 9.5h2.5" strokeLinecap="round" />
                  </svg>
                  Export as .frt
                </button>

                {/* ZIP */}
                <button
                  onClick={handleExportZip}
                  disabled={!graph || exportingZip}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left disabled:opacity-40"
                >
                  {exportingZip ? (
                    <span className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500 shrink-0">
                      <rect x="1" y="1" width="12" height="12" rx="1.5" />
                      <path d="M5.5 1v4M5.5 5h3M5.5 5v4" strokeLinecap="round" />
                      <path d="M4 10h6" strokeLinecap="round" />
                    </svg>
                  )}
                  {exportingZip ? 'Exporting…' : 'Export .zip + Photos'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-slate-200 hidden md:block" />

        <button
          onClick={onLayouts}
          title="Save or load a named layout"
          className="hidden md:inline-flex px-3 py-1.5 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Layouts
        </button>
        <button
          onClick={onTheme}
          title="Customize tree canvas appearance"
          className="hidden md:inline-flex px-3 py-1.5 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
        >
          🎨 Theme
        </button>
        <button
          onClick={onMembers}
          className="hidden md:inline-flex px-3 py-1.5 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Members
        </button>

        {/* ── Mobile "⋮" overflow menu ── */}
        <div className="relative md:hidden" ref={moreMenuRef}>
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="p-2 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="More options"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/>
            </svg>
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
              <div className="py-1">
                <button onClick={() => { setMoreOpen(false); onLayouts(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  Layouts
                </button>
                <button onClick={() => { setMoreOpen(false); onTheme(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  🎨 Theme
                </button>
                <button onClick={() => { setMoreOpen(false); onMembers(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  Members
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button onClick={() => { setMoreOpen(false); onExportCsv(); }}
                  disabled={!graph}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                  Export CSV
                </button>
                <button onClick={async () => { setMoreOpen(false); await onExportPdf(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  Export PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {canWrite && (
          <button
            onClick={onAddPerson}
            className="px-2.5 md:px-3 py-1.5 bg-brand-500 text-white text-xs font-medium rounded-lg hover:bg-brand-600 transition-colors"
          >
            <span className="hidden sm:inline">+ Add person</span>
            <span className="sm:hidden">+</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

// ── Saved layouts ──────────────────────────────────────────────────────────

interface SavedLayout {
  id: string;
  name: string;
  savedAt: string;
  positions: Record<string, { x: number; y: number }>;
}

function layoutsKey(treeId: string) { return `fr:layouts:${treeId}`; }

function loadLayouts(treeId: string): SavedLayout[] {
  try { return JSON.parse(localStorage.getItem(layoutsKey(treeId)) ?? '[]'); }
  catch { return []; }
}

function saveLayouts(treeId: string, layouts: SavedLayout[]) {
  localStorage.setItem(layoutsKey(treeId), JSON.stringify(layouts));
}

// ── CSV export ─────────────────────────────────────────────────────────────

function exportTreeCsv(graph: import('@features/tree/types').ApiTreeGraph, treeName: string) {
  const personMap = new Map(graph.persons.map((p) => [p.id, p]));
  const personParents = new Map<string, [string, string]>();
  for (const fg of graph.familyGroups) {
    for (const childId of Object.keys(fg.children)) {
      personParents.set(childId, [fg.parentIds[0] ?? '', fg.parentIds[1] ?? '']);
    }
  }

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const header = [
    'ID', 'First Name', 'Last Name', 'Sex', 'Status',
    'Parent 1 ID', 'Parent 1 First Name', 'Parent 1 Last Name',
    'Parent 2 ID', 'Parent 2 First Name', 'Parent 2 Last Name',
  ].map(escape).join(',');

  const rows = graph.persons.map((p) => {
    const [p1id, p2id] = personParents.get(p.id) ?? ['', ''];
    const p1 = personMap.get(p1id);
    const p2 = personMap.get(p2id);
    const status = p.isDeceased ? 'Deceased' : p.isLiving ? 'Living' : 'Unknown';
    return [
      p.id,
      p.displayGivenName ?? '',
      p.displaySurname ?? '',
      p.sex,
      status,
      p1id,
      p1?.displayGivenName ?? '',
      p1?.displaySurname ?? '',
      p2id,
      p2?.displayGivenName ?? '',
      p2?.displaySurname ?? '',
    ].map((v) => escape(String(v))).join(',');
  });

  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${treeName.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FamilyTreePage() {
  const { treeId } = useParams<{ treeId: string }>();

  const canvasRef = React.useRef<TreeCanvasHandle>(null);
  const [showLayouts,     setShowLayouts]     = useState(false);
  const [showCanvasTheme, setShowCanvasTheme] = useState(false);

  const [panelPersonId,     setPanelPersonId]     = useState<string | null>(null);
  const [showAddPerson,     setShowAddPerson]     = useState(false);
  const [relationMode,      setRelationMode]      = useState<RelationMode | null>(null);
  const [showMembers,       setShowMembers]       = useState(false);
  const [unionChildFgId,    setUnionChildFgId]    = useState<string | null>(null);
  const [showEdit,          setShowEdit]          = useState(false);
  const [showProfile,       setShowProfile]       = useState(false);
  const [showActivity,      setShowActivity]      = useState(false);
  const [searchOpen,        setSearchOpen]        = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const setTreeId        = useCanvasStore((s) => s.setTreeId);
  const resetCanvas      = useCanvasStore((s) => s.reset);
  const setFocusPerson   = useCanvasStore((s) => s.setFocusPersonId);
  const bumpLayoutReset  = useCanvasStore((s) => s.bumpLayoutReset);
  const accessToken      = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (treeId) setTreeId(treeId);
    return () => resetCanvas();
  }, [treeId, setTreeId, resetCanvas]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        setSearchOpen((o) => {
          if (!o) setTimeout(() => searchInputRef.current?.focus(), 30);
          else setSearchQuery('');
          return !o;
        });
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data: graph, isLoading, refetch } = useQuery({
    queryKey: queryKeys.trees.detail(treeId ?? ''),
    queryFn:  () => fetchTreeGraph(treeId ?? '', accessToken),
    enabled:  !!treeId && !!accessToken,
    staleTime: 5 * 60_000,
  });

  const handlePersonSelect = useCallback((personId: string) => {
    setPanelPersonId(personId);
  }, []);

  const handlePanelClose = useCallback(() => {
    setPanelPersonId(null);
    useCanvasStore.getState().setSelectedPersonId(null);
  }, []);

  const handleAdded = useCallback(async () => {
    const result = await refetch();
    if (result.data) {
      const { expandedNodeIds, setExpandedNodeIds } = useCanvasStore.getState();
      const next = new Set(expandedNodeIds);
      for (const p of result.data.persons) next.add(p.id);
      setExpandedNodeIds(next);
    }
  }, [refetch]);

  const panelPersonName = useMemo(() => {
    if (!panelPersonId || !graph) return '';
    const p = graph.persons.find((p) => p.id === panelPersonId);
    return p ? `${p.displayGivenName} ${p.displaySurname}`.trim() : '';
  }, [panelPersonId, graph]);

  function closeRelationModal() {
    setRelationMode(null);
  }

  function handleRelationAdded() {
    closeRelationModal();
    handleAdded();
  }

  function handleSetFocus() {
    if (panelPersonId) setFocusPerson(panelPersonId);
    handlePanelClose();
  }

  const treeName        = (graph as any)?.treeName ?? 'Family Tree';
  const treeDescription = (graph as any)?.treeDescription ?? null;
  const personCount     = graph?.persons.length ?? 0;

  const canWrite        = (graph as any)?.userRole !== 'VIEWER';

  return (
    <div className="fixed inset-0 flex flex-col">
      <SEO
        title={treeName}
        description={treeDescription ?? `Explore the ${treeName} family tree — ${personCount} people across multiple generations.`}
        noIndex
      />
      <TreeTopBar
        treeName={treeName}
        treeDescription={treeDescription}
        personCount={personCount}
        graph={graph ?? null}
        token={accessToken}
        canWrite={canWrite}
        onAddPerson={() => setShowAddPerson(true)}
        onMembers={() => setShowMembers(true)}
        onLayouts={() => setShowLayouts(true)}
        onExportCsv={() => graph && exportTreeCsv(graph, treeName)}
        onExportPdf={() => canvasRef.current?.exportPdf() ?? Promise.resolve()}
        onTheme={() => setShowCanvasTheme(true)}
        onShowActivity={() => setShowActivity(true)}
      />

      <div className="flex-1 relative mt-12">
        <TreeCanvas
          ref={canvasRef}
          graph={graph ?? null}
          isLoading={isLoading}
          onPersonSelect={handlePersonSelect}
          onFamilyGroupSelect={(fgId) => {
            if (!canWrite) return;
            setPanelPersonId(null);
            setUnionChildFgId(fgId);
          }}
        />

        {searchOpen && (() => {
          const query = searchQuery.toLowerCase().trim();
          const results = (graph?.persons ?? []).filter((p) => {
            const name = `${p.displayGivenName ?? ''} ${p.displaySurname ?? ''}`.toLowerCase();
            return !query || name.includes(query);
          }).slice(0, 10);
          return (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2rem)] max-w-xs sm:max-w-sm">
              <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/10 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search people…"
                    className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-900"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && results.length > 0) {
                        canvasRef.current?.scrollToNode(results[0].id);
                        setSearchOpen(false);
                        setSearchQuery('');
                      }
                    }}
                  />
                  <span className="text-[10px] text-gray-300 font-mono shrink-0">Esc</span>
                </div>
                {results.length > 0 ? (
                  <ul className="max-h-60 overflow-y-auto py-1">
                    {results.map((p) => {
                      const name = [p.displayGivenName, p.displaySurname].filter(Boolean).join(' ') || '(unnamed)';
                      return (
                        <li key={p.id}>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-brand-50 hover:text-brand-700 flex items-center gap-3"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              canvasRef.current?.scrollToNode(p.id);
                              setSearchOpen(false);
                              setSearchQuery('');
                            }}
                          >
                            {p.photoUrl ? (
                              <img src={p.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xs text-gray-400">
                                {(p.displayGivenName?.[0] ?? p.displaySurname?.[0] ?? '?').toUpperCase()}
                              </span>
                            )}
                            {name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-400">No people found.</p>
                )}
              </div>
              <p className="text-center text-[10px] text-white/70 mt-1.5">Ctrl+Space to close</p>
            </div>
          );
        })()}

        <SelectionPanel
          key={panelPersonId ?? '__empty__'}
          personId={panelPersonId}
          personName={panelPersonName}
          treeId={treeId ?? ''}
          token={accessToken}
          canWrite={canWrite}
          onClose={handlePanelClose}
          onAddParent={() => setRelationMode('parent')}
          onAddChild={()  => setRelationMode('child')}
          onAddSpouse={() => setRelationMode('spouse')}
          onSetFocus={handleSetFocus}
          onDeleted={() => { handlePanelClose(); handleAdded(); }}
          onOpenProfile={() => setShowProfile(true)}
          onEdit={() => setShowEdit(true)}
        />
      </div>

      {canWrite && showAddPerson && (
        <AddPersonModal
          treeId={treeId ?? ''}
          token={accessToken}
          onClose={() => setShowAddPerson(false)}
          onAdded={handleAdded}
        />
      )}

      {canWrite && relationMode && panelPersonId && (() => {
        const alreadyHasParents = new Set(
          (graph?.familyGroups ?? []).flatMap((g) => Object.keys(g.children))
        );
        let excludeIds: Set<string>;
        if (relationMode === 'parent') {
          const existingParents = (graph?.familyGroups ?? [])
            .filter((fg) => Object.keys(fg.children).includes(panelPersonId))
            .flatMap((fg) => fg.parentIds);
          excludeIds = new Set([panelPersonId, ...existingParents]);
        } else if (relationMode === 'child') {
          const existingChildren = (graph?.familyGroups ?? [])
            .filter((fg) => fg.parentIds.includes(panelPersonId))
            .flatMap((fg) => Object.keys(fg.children));
          excludeIds = new Set([panelPersonId, ...existingChildren]);
        } else {
          const existingSpouses = (graph?.familyGroups ?? [])
            .filter((fg) => fg.parentIds.includes(panelPersonId))
            .flatMap((fg) => fg.parentIds.filter((id) => id !== panelPersonId));
          excludeIds = new Set([panelPersonId, ...existingSpouses]);
        }
        const candidates = (graph?.persons ?? [])
          .filter((p) => !excludeIds.has(p.id))
          .map((p) => ({ ...p, hasParents: alreadyHasParents.has(p.id) }));
        return (
          <AddRelationModal
            mode={relationMode}
            anchorPersonId={panelPersonId}
            anchorName={panelPersonName}
            treeId={treeId ?? ''}
            token={accessToken}
            candidates={candidates}
            onClose={closeRelationModal}
            onAdded={handleRelationAdded}
          />
        );
      })()}

      {canWrite && showEdit && panelPersonId && (() => {
        const p = graph?.persons.find((x) => x.id === panelPersonId);
        if (!p) return null;
        const initial: EditPersonFields = {
          givenName:       p.displayGivenName,
          surname:         p.displaySurname,
          sex:             p.sex,
          status:          p.isLiving ? 'living' : p.isDeceased ? 'deceased' : 'unknown',
          birthDate:       p.birthDate ?? '',
          deathDate:       p.deathDate ?? '',
          birthYear:       p.birthYear != null ? String(p.birthYear) : '',
          deathYear:       p.deathYear != null ? String(p.deathYear) : '',
          facebookHandle:  p.facebookHandle ?? '',
          xHandle:         p.xHandle ?? '',
          linkedinHandle:  p.linkedinHandle ?? '',
        };
        return (
          <EditPersonModal
            personId={panelPersonId}
            initial={initial}
            initialPhotoUrl={p.photoUrl}
            treeId={treeId ?? ''}
            token={accessToken}
            onClose={() => setShowEdit(false)}
            onSaved={() => { setShowEdit(false); handleAdded(); }}
            onRefresh={handleAdded}
          />
        );
      })()}

      {showProfile && panelPersonId && (
        <PersonProfileModal
          initialPersonId={panelPersonId}
          treeId={treeId ?? ''}
          token={accessToken}
          graph={graph ?? null}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showMembers && (
        <MembersModal
          treeId={treeId ?? ''}
          token={accessToken}
          currentUserId={useAuthStore.getState().user?.id ?? ''}
          onClose={() => setShowMembers(false)}
        />
      )}

      {showCanvasTheme && (
        <CanvasThemeModal onClose={() => setShowCanvasTheme(false)} />
      )}

      {showLayouts && treeId && (
        <LayoutsModal
          treeId={treeId}
          onGetPositions={() => canvasRef.current?.getPositions() ?? {}}
          onLoadPositions={(p) => canvasRef.current?.loadPositions(p)}
          onClose={() => setShowLayouts(false)}
        />
      )}

      {(() => {
        if (!unionChildFgId || !graph) return null;
        const fg = graph.familyGroups.find((f) => f.id === unionChildFgId);
        if (!fg) return null;
        const [p1Id, p2Id] = fg.parentIds;
        const personName = (id: string) => {
          const p = graph.persons.find((p) => p.id === id);
          return p ? `${p.displayGivenName} ${p.displaySurname}`.trim() : 'Unknown';
        };
        // Exclude parents and existing children from the candidate list
        const excludeIds = new Set([
          p1Id,
          ...(p2Id ? [p2Id] : []),
          ...Object.keys(fg.children),
        ]);
        // Track which persons are already children in any family group
        const alreadyHasParents = new Set(
          graph.familyGroups.flatMap((g) => Object.keys(g.children))
        );
        const candidates = graph.persons
          .filter((p) => !excludeIds.has(p.id))
          .map((p) => ({ ...p, hasParents: alreadyHasParents.has(p.id) }));
        return (
          <AddChildToUnionModal
            fgId={unionChildFgId}
            parent1Id={p1Id}
            parent2Id={p2Id ?? null}
            parent1Name={personName(p1Id)}
            parent2Name={p2Id ? personName(p2Id) : ''}
            treeId={treeId ?? ''}
            token={accessToken}
            candidates={candidates}
            onClose={() => setUnionChildFgId(null)}
            onAdded={() => { setUnionChildFgId(null); handleAdded(); }}
            onRemoved={() => { setUnionChildFgId(null); handleAdded(); }}
          />
        );
      })()}
    </div>
  );
}

// ── Layouts Modal ──────────────────────────────────────────────────────────

function LayoutsModal({
  treeId,
  onGetPositions,
  onLoadPositions,
  onClose,
}: {
  treeId: string;
  onGetPositions: () => Record<string, { x: number; y: number }>;
  onLoadPositions: ((p: Record<string, { x: number; y: number }>) => void) | undefined;
  onClose: () => void;
}) {
  const [layouts, setLayouts] = useState<SavedLayout[]>(() => loadLayouts(treeId));
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    const positions = onGetPositions();
    const newLayout: SavedLayout = {
      id: crypto.randomUUID(),
      name,
      savedAt: new Date().toISOString(),
      positions,
    };
    const updated = [newLayout, ...layouts];
    saveLayouts(treeId, updated);
    setLayouts(updated);
    setSaveName('');
    setSaving(false);
  }

  function handleLoad(layout: SavedLayout) {
    onLoadPositions?.(layout.positions);
    onClose();
  }

  function handleDelete(id: string) {
    const updated = layouts.filter((l) => l.id !== id);
    saveLayouts(treeId, updated);
    setLayouts(updated);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Saved layouts</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Save current */}
        <form onSubmit={handleSave} className="flex gap-2 mb-5">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Layout name…"
            maxLength={60}
            className="flex-1 h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={saving || !saveName.trim()}
            className="h-9 px-4 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Save current
          </button>
        </form>

        {/* Saved list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {layouts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No layouts saved yet. Arrange the canvas and save it with a name.
            </p>
          ) : (
            <div className="space-y-2">
              {layouts.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{l.name}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(l.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      {' · '}{Object.keys(l.positions).length} nodes
                    </p>
                  </div>
                  <button
                    onClick={() => handleLoad(l)}
                    className="px-2.5 py-1 text-xs font-medium text-brand-600 bg-white border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors whitespace-nowrap"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(l.id)}
                    className="px-2.5 py-1 text-xs font-medium text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Canvas Theme Modal ─────────────────────────────────────────────────────

function CanvasColorField({
  label, field, value,
}: { label: string; field: keyof CanvasTheme; value: string }) {
  const updateField = useThemeStore((s) => s.updateField);
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <label className="text-sm text-slate-700">{label}</label>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded border border-slate-300" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => updateField(field, e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
          title={value}
        />
        <span className="text-xs text-slate-400 font-mono w-14">{value}</span>
      </div>
    </div>
  );
}

function CanvasThemeModal({ onClose }: { onClose: () => void }) {
  const { theme, setPreset, updateField, reset } = useThemeStore();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/20 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] max-w-xs sm:w-80 max-h-[calc(100vh-5rem)] flex flex-col border border-slate-200 mt-14"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Tree canvas theme</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Presets */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Presets</p>
            <div className="grid grid-cols-3 gap-1.5">
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.preset}
                  onClick={() => setPreset(p.preset)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition-colors ${
                    theme.preset === p.preset
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <span className="flex gap-0.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: p.canvasBg, border: `1px solid ${p.canvasDot}` }} />
                    <span className="w-3 h-3 rounded-sm" style={{ background: p.nodeBg, border: `1px solid ${p.nodeBorder}` }} />
                    <span className="w-3 h-3 rounded-sm" style={{ background: p.edgeColor }} />
                  </span>
                  {PRESET_LABEL[p.preset]}
                </button>
              ))}
              {theme.preset === 'custom' && (
                <span className="flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-brand-500 bg-brand-50 text-xs font-medium text-brand-700">
                  Custom
                </span>
              )}
            </div>
          </div>

          {/* Background */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Background</p>
            <div className="rounded-lg border border-slate-200 px-3">
              <CanvasColorField label="Canvas fill" field="canvasBg"  value={theme.canvasBg} />
              <CanvasColorField label="Grid dots"   field="canvasDot" value={theme.canvasDot} />
            </div>
          </div>

          {/* Box */}
          <div>
            <p className="text-xs font-semibond text-slate-500 uppercase tracking-wider mb-1">Box (person card)</p>
            <div className="rounded-lg border border-slate-200 px-3">
              <CanvasColorField label="Background" field="nodeBg"      value={theme.nodeBg} />
              <CanvasColorField label="Border"     field="nodeBorder"  value={theme.nodeBorder} />
              <CanvasColorField label="Hover"      field="nodeHoverBg" value={theme.nodeHoverBg} />
            </div>
          </div>

          {/* Foreground */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Foreground (text)</p>
            <div className="rounded-lg border border-slate-200 px-3">
              <CanvasColorField label="Name text" field="nodeText"    value={theme.nodeText} />
              <CanvasColorField label="Sub text"  field="nodeSubtext" value={theme.nodeSubtext} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Lines</p>
            <div className="rounded-lg border border-slate-200 px-3">
              <CanvasColorField label="Line color"      field="edgeColor"     value={theme.edgeColor} />
              <CanvasColorField label="Highlight color" field="edgeHighlight" value={theme.edgeHighlight} />
              <div className="flex items-center justify-between py-2">
                <label className="text-sm text-slate-700">Thickness</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={0.5} max={4} step={0.25}
                    value={theme.edgeWidth}
                    onChange={(e) => updateField('edgeWidth', parseFloat(e.target.value))}
                    className="w-24 accent-brand-500"
                  />
                  <span className="text-xs font-mono text-slate-500 w-9 text-right">
                    {theme.edgeWidth}px
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={reset}
            className="w-full py-2 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Reset to Classic
          </button>
        </div>
      </div>
    </div>
  );
}

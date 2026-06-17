import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';
import { SEO } from '@shared/components/SEO';
import { UserAvatar } from '@shared/components/UserAvatar';
import { usePortalThemeStore, PORTAL_PRESETS, PORTAL_PRESET_LABEL, type PortalTheme } from '@store/portalTheme.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

type Tab = 'profile' | 'security' | 'appearance' | 'notifications';

interface UserProfile {
  given_name: string | null;
  family_name: string | null;
  email: string;
  avatar_url: string | null;
  app_role: 'ADMIN' | 'STANDARD' | 'AUDITOR';
  locale: string;
  timezone: string;
  oauth_providers: string[];
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN:    'Admin',
  STANDARD: 'Standard',
  AUDITOR:  'Auditor',
};

const ROLE_BADGE: Record<string, string> = {
  ADMIN:    'bg-purple-100 text-purple-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  AUDITOR:  'bg-amber-100 text-amber-700',
};

// ── Appearance Tab (portal-wide theme) ────────────────────────────────────

function PortalColorField({
  label, field, value,
}: { label: string; field: keyof PortalTheme; value: string }) {
  const updateField = usePortalThemeStore((s) => s.updateField);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <label className="text-sm text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded border border-gray-300" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => updateField(field, e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
          title={value}
        />
        <span className="text-xs text-gray-400 font-mono w-16">{value}</span>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setPreset, reset } = usePortalThemeStore();

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Controls the overall look of the portal — sidebar, backgrounds, and navigation.
        Tree canvas appearance is customized inside the tree view.
      </p>

      {/* Presets */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Presets</h3>
        <div className="flex flex-wrap gap-2">
          {PORTAL_PRESETS.map((p) => (
            <button
              key={p.preset}
              onClick={() => setPreset(p.preset)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                theme.preset === p.preset
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <span className="flex gap-0.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: p.mainBg, border: `1px solid ${p.sidebarBorder}` }} />
                <span className="w-3 h-3 rounded-sm" style={{ background: p.sidebarBg, border: `1px solid ${p.sidebarBorder}` }} />
                <span className="w-3 h-3 rounded-sm" style={{ background: p.navActiveBg }} />
              </span>
              {PORTAL_PRESET_LABEL[p.preset]}
            </button>
          ))}
          {theme.preset === 'custom' && (
            <span className="flex items-center px-3 py-2 rounded-lg border-2 border-brand-500 bg-brand-50 text-sm font-medium text-brand-700">
              Custom
            </span>
          )}
        </div>
      </div>

      {/* Background */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Background</h3>
        <div className="bg-white rounded-xl border border-gray-200 px-4">
          <PortalColorField label="Main content background" field="mainBg"   value={theme.mainBg} />
          <PortalColorField label="Card / panel background" field="cardBg"   value={theme.cardBg} />
        </div>
      </div>

      {/* Sidebar */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Sidebar</h3>
        <div className="bg-white rounded-xl border border-gray-200 px-4">
          <PortalColorField label="Sidebar background"  field="sidebarBg"       value={theme.sidebarBg} />
          <PortalColorField label="Sidebar border"      field="sidebarBorder"   value={theme.sidebarBorder} />
          <PortalColorField label="Nav link text"       field="navText"         value={theme.navText} />
          <PortalColorField label="Nav link hover"      field="navHover"        value={theme.navHover} />
          <PortalColorField label="Active link bg"      field="navActiveBg"     value={theme.navActiveBg} />
          <PortalColorField label="Active link text"    field="navActiveText"   value={theme.navActiveText} />
          <PortalColorField label="Logo text"           field="logoText"        value={theme.logoText} />
        </div>
      </div>

      {/* Text */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Foreground</h3>
        <div className="bg-white rounded-xl border border-gray-200 px-4">
          <PortalColorField label="Primary text"  field="textPrimary" value={theme.textPrimary} />
          <PortalColorField label="Muted text"    field="textMuted"   value={theme.textMuted} />
        </div>
      </div>

      {/* Live preview */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Preview</h3>
        <div className="rounded-xl overflow-hidden border border-gray-200 flex" style={{ height: 160 }}>
          {/* Sidebar preview */}
          <div className="w-36 flex flex-col p-2 gap-1" style={{ background: theme.sidebarBg, borderRight: `1px solid ${theme.sidebarBorder}` }}>
            <p className="text-xs font-bold px-2 py-1 mb-1" style={{ color: theme.logoText }}>FamilyRoots</p>
            {['Dashboard', 'Settings'].map((l, i) => (
              <div key={l} className="px-2 py-1 rounded text-xs" style={{
                background: i === 0 ? theme.navActiveBg : 'transparent',
                color: i === 0 ? theme.navActiveText : theme.navText,
              }}>{l}</div>
            ))}
          </div>
          {/* Main preview */}
          <div className="flex-1 p-4 flex flex-col gap-2" style={{ background: theme.mainBg }}>
            <p className="text-sm font-semibold" style={{ color: theme.textPrimary }}>Family Trees</p>
            <div className="rounded-lg p-3 shadow-sm" style={{ background: theme.cardBg, border: `1px solid ${theme.sidebarBorder}` }}>
              <p className="text-xs font-medium" style={{ color: theme.textPrimary }}>The Shah Dynasty</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>24 people · 3 members</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Reset to Light
        </button>
      </div>
    </div>
  );
}

// ── Delete account modal ──────────────────────────────────────────────────────

type DeleteStep = 'warn' | 'confirm' | 'sent';

function DeleteAccountModal({
  userEmail,
  accessToken,
  onClose,
}: {
  userEmail: string;
  accessToken: string | null;
  onClose: () => void;
}) {
  const logout    = useAuthStore((s) => s.logout);
  const cardRef   = useRef<HTMLDivElement>(null);
  const [step, setStep]         = useState<DeleteStep>('warn');
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleSendConfirmation(e: React.FormEvent) {
    e.preventDefault();
    if (emailInput.trim().toLowerCase() !== userEmail.toLowerCase()) {
      setError('Email address does not match your account email.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/users/me/request-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).detail ?? 'Failed to send confirmation email. Please try again.');
      }
      setStep('sent');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSentClose() {
    logout();
    window.location.href = '/';
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={cardRef}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-7"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>

        {/* Step 1 — Warning */}
        {step === 'warn' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <h2 className="text-lg font-bold text-gray-900">Delete your account?</h2>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              This action is <strong>permanent and cannot be undone.</strong> Deleting your account will immediately and irreversibly remove:
            </p>

            <ul className="text-sm text-gray-700 space-y-1.5 mb-5 pl-1">
              {[
                'All family trees you own, and every person in them',
                'All family group relationships and connections',
                'Your profile photo and account information',
                'Your membership in other people\'s trees',
                'All activity history associated with your account',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 shrink-0">✕</span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 mb-6">
              <strong>Note:</strong> Trees shared with you (where you are an Editor or Viewer) will not be deleted — only the owner's data is removed.
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel — keep my account
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                I understand, continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Email confirmation */}
        {step === 'confirm' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">
                📧
              </div>
              <h2 className="text-lg font-bold text-gray-900">Confirm by email</h2>
            </div>

            <p className="text-sm text-gray-600 mb-1">
              We'll send a <strong>one-time confirmation link</strong> to your registered email address. You must click it to complete the deletion.
            </p>
            <p className="text-xs text-gray-400 mb-5">
              The link expires after 24 hours. If you don't click it, your account will not be deleted.
            </p>

            <form onSubmit={handleSendConfirmation} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Type your email address to confirm
                </label>
                <input
                  type="email"
                  autoFocus
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setError(''); }}
                  placeholder={userEmail}
                  required
                  className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Your account email: <span className="font-medium text-gray-600">{userEmail}</span>
                </p>
              </div>

              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setStep('warn'); setEmailInput(''); setError(''); }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !emailInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Sending…' : 'Send confirmation email'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 3 — Sent */}
        {step === 'sent' && (
          <div className="text-center py-2">
            <div className="text-5xl mb-4">📬</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Check your inbox</h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-2">
              A confirmation link has been sent to{' '}
              <span className="font-semibold text-gray-800">{userEmail}</span>.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              Click the link in that email to permanently delete your account. The link expires in <strong>24 hours</strong>. If you don't click it, your account will remain active.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500 mb-6 text-left">
              <strong className="text-gray-700">Didn't receive the email?</strong>
              <ul className="mt-1 space-y-0.5 list-disc pl-4">
                <li>Check your spam or junk folder</li>
                <li>Make sure you're checking <span className="font-medium">{userEmail}</span></li>
                <li>Contact support if you need help</li>
              </ul>
            </div>
            <button
              onClick={handleSentClose}
              className="w-full h-10 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors"
            >
              Sign out and close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Danger zone card ──────────────────────────────────────────────────────────

function DangerZone({ userEmail, accessToken }: { userEmail: string; accessToken: string | null }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      {modalOpen && (
        <DeleteAccountModal
          userEmail={userEmail}
          accessToken={accessToken}
          onClose={() => setModalOpen(false)}
        />
      )}

      <div className="mt-10 rounded-xl border-2 border-red-200 bg-red-50 p-5">
        <h3 className="text-sm font-bold text-red-800 mb-1">Danger zone</h3>
        <p className="text-xs text-red-700 mb-4 leading-relaxed">
          Permanently delete your account and all data associated with it. This includes every family tree you own, every person in those trees, and all related history. <strong>This action cannot be undone.</strong>
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-sm font-medium text-red-700 border border-red-300 bg-white rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors"
        >
          Delete and close account…
        </button>
      </div>
    </>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

interface SettingsNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, string>;
  is_read: boolean;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  TREE_INVITE: 'Invitation',
  TREE_SHARED: 'Added to tree',
};

const TYPE_BADGE: Record<string, string> = {
  TREE_INVITE: 'bg-violet-100 text-violet-700',
  TREE_SHARED: 'bg-green-100 text-green-700',
};

function expiresIn(createdAt: string): string {
  const expiry = new Date(new Date(createdAt).getTime() + 90 * 24 * 60 * 60 * 1000);
  const days = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Expiring soon';
  if (days === 1) return 'Expires tomorrow';
  if (days < 7) return `Expires in ${days} days`;
  if (days < 30) return `Expires in ${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''}`;
  return `Expires in ${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''}`;
}

const ITEMS_PER_PAGE = 15;

function NotificationsTab({ accessToken }: { accessToken: string | null }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<SettingsNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then((r) => r.json())
      .then(setNotifications)
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function markAllRead() {
    await fetch(`${API_BASE}/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function markRead(id: string) {
    await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setItemErrors((prev) => { const e = { ...prev }; delete e[id]; return e; });
  }

  async function acceptInvite(n: SettingsNotification) {
    setAccepting(n.id);
    setItemErrors((prev) => { const e = { ...prev }; delete e[n.id]; return e; });
    try {
      const res = await fetch(`${API_BASE}/invitations/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ token: n.data.token }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
        await markRead(n.id);
        if (n.data.tree_id) navigate(`/trees/${n.data.tree_id}`);
      } else {
        const body = await res.json().catch(() => ({}));
        const msg = (body as any).detail ?? `Failed (${res.status})`;
        setItemErrors((prev) => ({ ...prev, [n.id]: typeof msg === 'string' ? msg : JSON.stringify(msg) }));
      }
    } catch (err: any) {
      setItemErrors((prev) => ({ ...prev, [n.id]: err.message ?? 'Network error' }));
    } finally {
      setAccepting(null);
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const totalPages = Math.ceil(notifications.length / ITEMS_PER_PAGE);
  const pageItems = notifications.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Notifications are kept for <strong>3 months</strong> then automatically removed.
        </p>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs font-medium text-brand-600 hover:underline shrink-0"
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 3a4 4 0 0 1 4 4c0 3 1 4 1.5 5h-11C6 11 7 10 7 7a4 4 0 0 1 4-4z" />
              <path d="M9 17a2 2 0 0 0 4 0" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">No notifications</p>
          <p className="text-xs text-gray-400 mt-1">You're all caught up.</p>
        </div>
      ) : (
        <>
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
          {pageItems.map((n) => (
            <div
              key={n.id}
              className={`px-5 py-4 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${!n.is_read ? 'bg-brand-500' : 'bg-transparent'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${TYPE_BADGE[n.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABEL[n.type] ?? n.type}
                    </span>
                    {!n.is_read && (
                      <span className="text-[11px] font-medium text-brand-600">New</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 leading-snug">{n.title}</p>
                  {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
                    <span className="text-[11px] text-gray-300">·</span>
                    <span className="text-[11px] text-gray-400">{expiresIn(n.created_at)}</span>
                  </div>

                  {/* Error */}
                  {itemErrors[n.id] && (
                    <p className="text-xs text-red-600 mt-1.5 bg-red-50 px-2 py-1 rounded">{itemErrors[n.id]}</p>
                  )}

                  {/* Actions */}
                  {n.type === 'TREE_INVITE' && (
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                      {n.data.token && !n.is_read && (
                        <button
                          onClick={() => acceptInvite(n)}
                          disabled={accepting === n.id}
                          className="px-3 py-1 text-xs font-medium bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50 transition-colors"
                        >
                          {accepting === n.id ? 'Accepting…' : 'Accept invitation'}
                        </button>
                      )}
                      {n.data.tree_id && (
                        <button
                          onClick={() => navigate(`/trees/${n.data.tree_id}`)}
                          className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                        >
                          View tree
                        </button>
                      )}
                      {!n.is_read && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="px-3 py-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  )}
                  {n.type === 'TREE_SHARED' && (
                    <div className="flex gap-2 mt-2.5">
                      {n.data.tree_id && (
                        <button
                          onClick={() => { markRead(n.id); navigate(`/trees/${n.data.tree_id}`); }}
                          className="px-3 py-1 text-xs font-medium bg-brand-500 text-white rounded-md hover:bg-brand-600 transition-colors"
                        >
                          View tree
                        </button>
                      )}
                      {!n.is_read && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="px-3 py-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-gray-400">
              {page * ITEMS_PER_PAGE + 1}–{Math.min((page + 1) * ITEMS_PER_PAGE, notifications.length)} of {notifications.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const label = tab === 'notifications' ? 'Notifications' : tab.charAt(0).toUpperCase() + tab.slice(1);
  return (
    <Link
      to={`/settings/${tab}`}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </Link>
  );
}

export default function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const storeUser   = useAuthStore((s) => s.user);
  const setUser     = useAuthStore((s) => s.setUser);

  const activeTab: Tab =
    tab === 'security' ? 'security' :
    tab === 'appearance' ? 'appearance' :
    tab === 'notifications' ? 'notifications' :
    'profile';

  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);

  const [givenName,   setGivenName]   = useState('');
  const [familyName,  setFamilyName]  = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg,  setProfileMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [pwSaving,    setPwSaving]    = useState(false);
  const [pwMsg,       setPwMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setProfile(data);
        setGivenName(data.given_name ?? '');
        setFamilyName(data.family_name ?? '');
        if (storeUser && data.avatar_url && !storeUser.avatarUrl) {
          setUser({ ...storeUser, avatarUrl: data.avatar_url });
        }
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ given_name: givenName.trim() || null, family_name: familyName.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to save profile');
      }
      const updated: UserProfile = await res.json();
      setProfile(updated);
      if (storeUser) {
        setUser({
          ...storeUser,
          displayName: `${updated.given_name ?? ''} ${updated.family_name ?? ''}`.trim() || storeUser.email,
        });
      }
      setProfileMsg({ ok: true, text: 'Profile saved.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err.message });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    setAvatarUploading(true);
    setProfileMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/users/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to upload avatar');
      }
      const { avatar_url } = await res.json();
      setProfile((p) => (p ? { ...p, avatar_url } : p));
      if (storeUser) {
        setUser({ ...storeUser, avatarUrl: avatar_url });
      }
      setProfileMsg({ ok: true, text: 'Profile picture updated.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err.message });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    setProfileMsg(null);
    try {
      const res = await fetch(`${API_BASE}/users/me/avatar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to remove avatar');
      }
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
      if (storeUser) {
        setUser({ ...storeUser, avatarUrl: undefined });
      }
      setProfileMsg({ ok: true, text: 'Profile picture removed.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err.message });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: 'Passwords do not match.' });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      const res = await fetch(`${API_BASE}/users/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Failed to change password');
      }
      setPwMsg({ ok: true, text: 'Password changed successfully.' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      setPwMsg({ ok: false, text: err.message });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <SEO
        title="Settings"
        description="Manage your FamilyRoots account settings — profile, security, and appearance."
        noIndex
      />
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-5 md:mb-6">Settings</h1>

      <div className="flex gap-1 mb-8 border-b border-gray-200 overflow-x-auto">
        <TabLink tab="profile"       active={activeTab === 'profile'} />
        <TabLink tab="security"      active={activeTab === 'security'} />
        <TabLink tab="appearance"    active={activeTab === 'appearance'} />
        <TabLink tab="notifications" active={activeTab === 'notifications'} />
      </div>

      {activeTab === 'appearance' && <AppearanceTab />}

      {activeTab === 'notifications' && <NotificationsTab accessToken={accessToken} />}

      {(activeTab === 'profile' || activeTab === 'security') && (loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === 'profile' ? (
        <form onSubmit={handleProfileSave} className="space-y-5">
          {/* Profile picture */}
          <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
            <UserAvatar
              avatarUrl={profile?.avatar_url}
              displayName={`${profile?.given_name ?? ''} ${profile?.family_name ?? ''}`.trim()}
              email={profile?.email}
              size="lg"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Profile picture</p>
              {profile?.oauth_providers?.length ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  Synced from your {profile.oauth_providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')} account
                </p>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAvatarUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={avatarUploading}
                    onClick={() => avatarInputRef.current?.click()}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                  >
                    {avatarUploading ? 'Uploading…' : profile?.avatar_url ? 'Change' : 'Upload photo'}
                  </button>
                  {profile?.avatar_url && (
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={handleAvatarRemove}
                      className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                type="text"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                placeholder="Given name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="Family name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={profile?.email ?? ''}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
              {profile?.app_role && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[profile.app_role] ?? ROLE_BADGE.STANDARD}`}>
                  {ROLE_LABEL[profile.app_role] ?? profile.app_role}
                </span>
              )}
              <span className="text-xs text-gray-400">Assigned by an administrator</span>
            </div>
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{profileMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileSaving}
              className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <form onSubmit={handlePasswordChange} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Minimum 8 characters, at least one uppercase letter and one digit.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            {pwMsg && (
              <p className={`text-sm ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{pwMsg.text}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {pwSaving ? 'Changing…' : 'Change password'}
              </button>
            </div>
          </form>

          {profile && (
            <DangerZone userEmail={profile.email} accessToken={accessToken} />
          )}
        </div>
      ))}
    </div>
  );
}

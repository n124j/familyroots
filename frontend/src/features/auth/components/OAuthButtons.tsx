/**
 * OAuthButtons — Social login buttons for Google and GitHub.
 *
 * Both use the Authorization Code flow initiated by the backend.
 * Clicking redirects to /api/v1/auth/oauth/{provider}, which then
 * redirects to the provider, then back to /auth/callback.
 */

import React, { memo } from 'react';

// ── Provider config ────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

const PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.08-6.08C34.41 3.04 29.53 1 24 1 14.91 1 7.12 6.44 3.48 14.16l7.11 5.52C12.27 13.57 17.67 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.1 24.55c0-1.64-.15-3.23-.41-4.77H24v9.03h12.42c-.54 2.88-2.18 5.32-4.64 6.96l7.11 5.52C43.18 37.28 46.1 31.34 46.1 24.55z"/>
        <path fill="#FBBC05" d="M10.59 28.32A14.5 14.5 0 0 1 9.5 24c0-1.5.26-2.95.71-4.32L3.1 14.16A23.1 23.1 0 0 0 1 24c0 3.72.87 7.24 2.48 10.32l7.11-6z"/>
        <path fill="#34A853" d="M24 47c5.53 0 10.17-1.83 13.56-4.97l-7.11-5.52c-1.84 1.23-4.2 1.99-6.45 1.99-6.33 0-11.73-4.07-13.41-9.68l-7.11 5.52C7.12 41.56 14.91 47 24 47z"/>
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'Continue with GitHub',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.09.682-.217.682-.48 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.09-.647.35-1.087.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.03-2.682-.103-.254-.447-1.27.098-2.647 0 0 .84-.268 2.75 1.026a9.578 9.578 0 0 1 2.5-.337c.849.004 1.705.114 2.504.336 1.91-1.294 2.747-1.026 2.747-1.026.547 1.377.203 2.393.1 2.647.64.698 1.028 1.591 1.028 2.682 0 3.841-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
    ),
  },
] as const;

// ── Component ──────────────────────────────────────────────────────────────

interface OAuthButtonsProps {
  /** Shown above the buttons */
  dividerLabel?: string;
  className?: string;
}

export const OAuthButtons = memo(({ dividerLabel = 'or', className = '' }: OAuthButtonsProps) => {
  function handleOAuth(provider: string) {
    // Navigate to backend OAuth initiation endpoint
    window.location.href = `${API_BASE}/auth/oauth/${provider}`;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Divider */}
      {dividerLabel && (
        <div className="relative flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">{dividerLabel}</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
      )}

      {/* Provider buttons */}
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          onClick={() => handleOAuth(p.id)}
          type="button"
          className="flex items-center justify-center gap-3 w-full h-10 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {p.icon}
          {p.label}
        </button>
      ))}
    </div>
  );
});
OAuthButtons.displayName = 'OAuthButtons';

// ── OAuth callback page helper ─────────────────────────────────────────────
/**
 * After OAuth redirect from backend, the frontend lands on /auth/callback?access_token=...
 * This hook extracts the token and stores it in auth store.
 */
export function useOAuthCallback() {
  const search = new URLSearchParams(window.location.search);
  const accessToken = search.get('access_token');
  const error = search.get('error');
  return { accessToken, error };
}

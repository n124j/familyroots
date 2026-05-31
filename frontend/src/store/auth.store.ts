/**
 * auth.store — Zustand store for JWT tokens and current user.
 *
 * Security decisions:
 *  - Access token: memory only (never localStorage / sessionStorage → no XSS leak)
 *  - Refresh token: httpOnly cookie managed by the server
 *  - On hard refresh: call POST /auth/refresh (cookie is sent automatically)
 *    to silently recover a new access token before rendering protected routes.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  isEmailVerified: boolean;
}

interface AuthStore {
  // ── State ──────────────────────────────────────────────────────────────
  accessToken: string | null;
  user: AuthUser | null;
  isInitialised: boolean;   // true once the silent-refresh attempt has completed

  // ── Mutations ──────────────────────────────────────────────────────────
  setAccessToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  /** Called after successful login / OAuth callback */
  login: (accessToken: string, user: AuthUser) => void;
  /** Clears memory; server must clear the httpOnly refresh cookie */
  logout: () => void;
  setInitialised: () => void;

  // ── Derived ────────────────────────────────────────────────────────────
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set, get) => ({
      accessToken: null,
      user: null,
      isInitialised: false,
      isAuthenticated: false,

      setAccessToken: (token) =>
        set({ accessToken: token, isAuthenticated: true }),

      setUser: (user) => set({ user }),

      login: (accessToken, user) =>
        set({ accessToken, user, isAuthenticated: true }),

      logout: () =>
        set({ accessToken: null, user: null, isAuthenticated: false }),

      setInitialised: () => set({ isInitialised: true }),
    }),
    { name: 'auth-store' }
  )
);

// ── Silent refresh helper (call once on app boot) ──────────────────────────

export async function initAuth(): Promise<void> {
  const store = useAuthStore.getState();
  if (store.isInitialised) return;

  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',  // sends the httpOnly refresh_token cookie
    });

    if (res.ok) {
      const { access_token, user } = await res.json();
      store.login(access_token, {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        displayName: `${user.display_given_name ?? ''} ${user.display_surname ?? ''}`.trim() || user.email,
        avatarUrl: user.avatar_url,
        isEmailVerified: user.is_email_verified,
      });
    }
    // If refresh fails (401), user stays logged out — that's correct
  } catch {
    // Network error: stay logged out
  } finally {
    store.setInitialised();
  }
}

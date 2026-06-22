/**
 * LoginPage — email/password form + Google OAuth button.
 *
 * On success: stores access token in auth store, navigates to ?next or /dashboard.
 */

import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';
import { OAuthButtons } from '@features/auth/components/OAuthButtons';
import { SEO } from '@shared/components/SEO';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

class UnverifiedError extends Error {
  constructor() { super('unverified'); }
}

async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 403 && String((err as any).type ?? '').includes('account-not-verified')) {
      throw new UnverifiedError();
    }
    throw new Error((err as any).detail ?? 'Invalid email or password');
  }
  return res.json();
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate    = useNavigate();
  const storeLogin  = useAuthStore((s) => s.login);
  const justRegistered = searchParams.get('registered') === '1';

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState('');
  const [unverified,  setUnverified]  = useState(false);
  const [loading,     setLoading]     = useState(false);

  const oauthError = searchParams.get('error');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setLoading(true);
    try {
      const data = await login(email, password);
      // Fetch full profile (including app_role) before storing
      const meRes = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
        credentials: 'include',
      });
      const me = meRes.ok ? await meRes.json() : null;
      storeLogin(data.access_token, {
        id: data.user_id,
        tenantId: data.tenant_id,
        email,
        displayName: me ? `${me.given_name ?? ''} ${me.family_name ?? ''}`.trim() || email : email,
        avatarUrl: me?.avatar_url ?? undefined,
        isEmailVerified: true,
        appRole: me?.app_role ?? 'STANDARD',
      });
      const next = searchParams.get('next') ?? '/dashboard';
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof UnverifiedError) {
        setUnverified(true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SEO
        title="Sign In"
        description="Sign in to your FamilyRoots account to access your family trees, ancestry charts, and genealogy tools."
        canonical="/login"
        keywords="login, sign in, genealogy account, family tree login"
      />
      <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🌳</div>
          <h1 className="text-2xl font-bold text-slate-900">FamilyRoots</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-7">
          {/* Registration success banner */}
          {justRegistered && (
            <div className="mb-4 px-3 py-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">Account created!</p>
              <p className="text-xs text-green-700 mt-0.5">
                Check your inbox for a verification link. You must verify your email before signing in.
              </p>
            </div>
          )}

          {/* OAuth error banner */}
          {oauthError && (
            <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {oauthError === 'oauth_state_mismatch'
                ? 'Sign-in session expired. Please try again.'
                : 'An error occurred with social sign-in. Please try again.'}
            </div>
          )}

          {/* Social login */}
          <OAuthButtons dividerLabel="" next="/login" />

          {/* Divider */}
          <div className="relative flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">or sign in with email</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-brand-600 hover:text-brand-700"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {unverified && (
              <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <p className="font-medium mb-0.5">Email not verified</p>
                <p className="text-xs">Check your inbox for a verification link. Contact an admin if you need help.</p>
              </div>
            )}
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Register link */}
        <p className="text-center text-sm text-slate-500 mt-5">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-600 font-medium hover:text-brand-700">
            Create one free
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}

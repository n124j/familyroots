/**
 * AuthGuard — redirects unauthenticated users to /login.
 *
 * Waits for the silent-refresh attempt to complete (isInitialised)
 * before deciding whether to render children or redirect.
 * This prevents a flash-of-login-page on hard refresh.
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';

export function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialised   = useAuthStore((s) => s.isInitialised);
  const location        = useLocation();

  // Still attempting silent token refresh — show nothing (or a spinner)
  if (!isInitialised) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  return <Outlet />;
}

/**
 * GuestGuard — redirects already-authenticated users away from /login.
 */
export function GuestGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialised   = useAuthStore((s) => s.isInitialised);

  if (!isInitialised) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

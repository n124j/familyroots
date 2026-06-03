import React, { useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';
import { usePortalThemeStore } from '@store/portalTheme.store';
import { Footer } from './Footer';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export default function AppShell() {
  const user         = useAuthStore((s) => s.user);
  const logout       = useAuthStore((s) => s.logout);
  const accessToken  = useAuthStore((s) => s.accessToken);
  const [loggingOut,   setLoggingOut]   = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const portalTheme  = usePortalThemeStore((s) => s.theme);

  // Inject portal CSS custom properties onto <html> whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--portal-main-bg',        portalTheme.mainBg);
    root.style.setProperty('--portal-sidebar-bg',     portalTheme.sidebarBg);
    root.style.setProperty('--portal-sidebar-border', portalTheme.sidebarBorder);
    root.style.setProperty('--portal-nav-text',       portalTheme.navText);
    root.style.setProperty('--portal-nav-hover',      portalTheme.navHover);
    root.style.setProperty('--portal-nav-active-bg',  portalTheme.navActiveBg);
    root.style.setProperty('--portal-nav-active-text',portalTheme.navActiveText);
    root.style.setProperty('--portal-logo-text',      portalTheme.logoText);
    document.body.style.setProperty('background', portalTheme.mainBg);
    return () => { document.body.style.removeProperty('background'); };
  }, [portalTheme]);

  // Lock body scroll while mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const isElevated = user?.appRole === 'ADMIN' || user?.appRole === 'AUDITOR';
  const isAdmin    = user?.appRole === 'ADMIN';

  const nav = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/search',    label: 'Search' },
    { to: '/reports',   label: 'Reports' },
    ...(isElevated ? [{ to: '/activity', label: 'Activity' }] : []),
    ...(isAdmin    ? [{ to: '/admin',    label: 'Admin Dashboard' }] : []),
    { to: '/settings',  label: 'Settings' },
  ];

  const sidebarContent = (
    <>
      {/* Logo row */}
      <div
        className="h-14 flex items-center justify-between px-4 border-b shrink-0"
        style={{ borderColor: 'var(--portal-sidebar-border)' }}
      >
        <span className="font-bold text-lg" style={{ color: 'var(--portal-logo-text)' }}>
          FamilyRoots
        </span>
        {/* Close button — mobile only */}
        <button
          className="md:hidden -mr-1 p-1.5 rounded-lg hover:bg-black/10 transition-colors"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `portal-nav-link${isActive ? ' active' : ''}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer: email + sign out */}
      <div className="p-3 border-t shrink-0" style={{ borderColor: 'var(--portal-sidebar-border)' }}>
        <p className="text-xs truncate mb-2" style={{ color: 'var(--portal-nav-text)' }}>
          {user?.email}
        </p>
        <button
          disabled={loggingOut}
          onClick={async () => {
            setLoggingOut(true);
            try {
              await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
              });
            } finally {
              logout();
              window.location.href = '/login';
            }
          }}
          className="w-full text-left text-xs px-2 py-1 rounded disabled:opacity-50 hover:underline"
          style={{ color: 'var(--portal-nav-text)' }}
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex">

      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      {/* On mobile: fixed overlay, slides in from left.  On md+: static flex column. */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r',
          'transition-transform duration-200 ease-in-out',
          'md:static md:w-56 md:translate-x-0 md:shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={{ background: 'var(--portal-sidebar-bg)', borderColor: 'var(--portal-sidebar-border)' }}
      >
        {sidebarContent}
      </aside>

      {/* ── Main content column ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile-only top bar */}
        <div
          className="md:hidden h-14 flex items-center px-4 border-b shrink-0"
          style={{
            background:   'var(--portal-sidebar-bg)',
            borderColor:  'var(--portal-sidebar-border)',
          }}
        >
          <button
            className="p-1.5 -ml-1 rounded-lg hover:bg-black/10 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="font-bold text-base ml-3" style={{ color: 'var(--portal-logo-text)' }}>
            FamilyRoots
          </span>
        </div>

        {/* Page content */}
        <main className="flex-1 flex flex-col overflow-auto" style={{ background: 'var(--portal-main-bg)' }}>
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}

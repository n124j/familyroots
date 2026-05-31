/**
 * Unit tests for the auth Zustand store.
 * Tests state transitions: login, logout, token refresh.
 */
import { act, renderHook } from '@testing-library/react';
import { useAuthStore, initAuth } from '@store/auth.store';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isInitialised: false,
    });
    mockFetch.mockReset();
  });

  describe('login', () => {
    it('stores access token in memory (not localStorage)', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.login('test-token-abc', {
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'alice@test.com',
          displayName: 'Alice Smith',
          avatarUrl: null,
          isEmailVerified: true,
        });
      });

      expect(result.current.accessToken).toBe('test-token-abc');
      expect(result.current.user?.email).toBe('alice@test.com');
      // Critical: must NOT be in localStorage
      expect(localStorage.getItem('access_token')).toBeNull();
    });

    it('sets user fields correctly', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.login('tok', {
          id: 'u1',
          tenantId: 't1',
          email: 'bob@test.com',
          displayName: 'Bob Jones',
          avatarUrl: 'https://example.com/avatar.png',
          isEmailVerified: false,
        });
      });

      expect(result.current.user?.displayName).toBe('Bob Jones');
      expect(result.current.user?.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.current.user?.isEmailVerified).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears access token and user', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.login('some-token', {
          id: 'u1', tenantId: 't1', email: 'test@test.com',
          displayName: 'Test', avatarUrl: null, isEmailVerified: true,
        });
      });

      act(() => {
        result.current.logout();
      });

      expect(result.current.accessToken).toBeNull();
      expect(result.current.user).toBeNull();
    });
  });

  describe('initAuth', () => {
    it('calls /api/v1/auth/refresh on init', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          user: {
            id: 'u1',
            tenant_id: 't1',
            email: 'alice@test.com',
            display_given_name: 'Alice',
            display_surname: 'Smith',
            avatar_url: null,
            is_email_verified: true,
          },
        }),
      });

      await act(async () => {
        await initAuth();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/refresh',
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('refreshed-token');
      expect(state.isInitialised).toBe(true);
    });

    it('sets isInitialised=true even if refresh fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      await act(async () => {
        await initAuth();
      });

      expect(useAuthStore.getState().isInitialised).toBe(true);
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('handles network error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await initAuth();
      });

      expect(useAuthStore.getState().isInitialised).toBe(true);
    });
  });

  describe('isAuthenticated selector', () => {
    it('returns false when no token', () => {
      const state = useAuthStore.getState();
      expect(!!state.accessToken).toBe(false);
    });

    it('returns true after login', () => {
      act(() => {
        useAuthStore.getState().login('tok', {
          id: 'u', tenantId: 't', email: 'e@e.com',
          displayName: 'E', avatarUrl: null, isEmailVerified: true,
        });
      });
      expect(!!useAuthStore.getState().accessToken).toBe(true);
    });
  });
});

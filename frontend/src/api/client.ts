/**
 * Axios client with automatic JWT injection and silent token refresh.
 *
 * Request interceptor  → attach Authorization: Bearer <access_token>
 * Response interceptor → on 401: attempt one silent refresh, retry original
 *                         request; on second 401 → logout + redirect /login
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@store/auth.store';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

// ── Create instance ────────────────────────────────────────────────────────

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,   // sends httpOnly refresh_token cookie on every request
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ── Request interceptor ────────────────────────────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  const tenantId = useAuthStore.getState().user?.tenantId;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (tenantId) {
    config.headers['X-Tenant-ID'] = tenantId;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// ── Response interceptor — silent refresh on 401 ───────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest: AxiosRequestConfig & { _retry?: boolean } =
      error.config ?? {};

    // Only handle 401s once per request (prevent infinite retry)
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${newToken}`,
          };
          resolve(apiClient(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      const res = await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const newToken = res.data.access_token;
      const user = res.data.user;

      useAuthStore.getState().login(newToken, {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        displayName:
          `${user.display_given_name ?? ''} ${user.display_surname ?? ''}`.trim() ||
          user.email,
        avatarUrl: user.avatar_url,
        isEmailVerified: user.is_email_verified,
        appRole: user.app_role ?? 'STANDARD',
      });

      onTokenRefreshed(newToken);

      originalRequest.headers = {
        ...originalRequest.headers,
        Authorization: `Bearer ${newToken}`,
      };
      return apiClient(originalRequest);
    } catch {
      // Refresh failed → logout and redirect
      useAuthStore.getState().logout();
      window.location.href = '/login?error=session_expired';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

// ── Typed request helpers ─────────────────────────────────────────────────

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<T>(url, { params });
  return res.data;
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<T>(url, body);
  return res.data;
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.patch<T>(url, body);
  return res.data;
}

export async function del(url: string): Promise<void> {
  await apiClient.delete(url);
}

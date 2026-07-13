import { tokenStore } from './auth';

/** Base URL of the API — configured per build via app config / env. */
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

/**
 * Authenticated fetch for the driver app. Attaches the Bearer access token and
 * transparently refreshes it once on a 401. Throws on non-2xx so the outbox can
 * decide whether to retry.
 */
export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const access = await tokenStore.getAccess();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && retry) {
    const refresh = await tokenStore.getRefresh();
    if (refresh) {
      const r = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (r.ok) {
        const data = (await r.json()) as { accessToken: string };
        await tokenStore.setTokens(data.accessToken);
        return apiFetch(path, init, false);
      }
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = (await res.json()) as { accessToken: string };
  await tokenStore.setTokens(data.accessToken);
}

export async function apiFetch(
  path: string,
  options: RequestInit,
  getToken: () => string | null,
  onNewToken: (t: string) => void,
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status !== 401) {
    return res;
  }

  // 401: attempt token refresh
  const refreshRes = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });

  if (!refreshRes.ok) {
    return res; // return original 401
  }

  const data = await refreshRes.json();
  onNewToken(data.accessToken);

  // Retry original request with new token
  const retryHeaders = new Headers(options.headers);
  retryHeaders.set('Authorization', `Bearer ${data.accessToken}`);

  return fetch(path, {
    ...options,
    headers: retryHeaders,
    credentials: 'include',
  });
}

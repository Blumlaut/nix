/** API client. Redirects to Discord login on an unauthenticated response. */
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/auth/discord';
    return null;
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

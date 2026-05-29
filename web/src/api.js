export async function fetchData({ refresh = false, from = '', to = '' } = {}) {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', '1');
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const res = await fetch(`/api/data${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

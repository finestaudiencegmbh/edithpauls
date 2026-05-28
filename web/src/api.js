export async function fetchData({ refresh = false } = {}) {
  const res = await fetch(`/api/data${refresh ? '?refresh=1' : ''}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

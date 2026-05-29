export async function fetchData({ refresh = false } = {}) {
  const res = await fetch(`/api/data${refresh ? '?refresh=1' : ''}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text.slice(0, 120); }
    throw new Error(msg);
  }
  return res.json();
}

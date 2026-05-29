/**
 * Facebook/Meta Marketing API – holt Ad-Insights direkt über den Graph-API-
 * Access-Token (Alternative zu Supermetrics). Liefert dieselbe normalisierte
 * Struktur wie supermetrics.js, damit das Dashboard unverändert funktioniert.
 *
 * Benötigte .env:
 *   META_ACCESS_TOKEN   – Access-Token mit ads_read
 *   META_AD_ACCOUNT_ID  – Werbekonto, z. B. act_367913946654819
 * Optional:
 *   META_API_VERSION    – Graph-API-Version (Default v21.0)
 *   META_LOOKBACK_DAYS  – Zeitfenster in Tagen (Default 90)
 */

const GRAPH = 'https://graph.facebook.com';

export function isMetaConfigured() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

const ymd = (d) => d.toISOString().slice(0, 10);

function normAccount(id) {
  const s = String(id || '').trim();
  return s.startsWith('act_') ? s : `act_${s}`;
}

/** Position lesbar machen (z. B. "feed", "instagram_stories" -> "instagram stories"). */
function positionLabel(position) {
  return String(position || '').trim().replace(/_/g, ' ');
}

/**
 * Holt alle Insights-Seiten von der Graph API.
 * level=ad + breakdowns=publisher_platform,platform_position gibt eine Zeile
 * je Ad × Placement.
 */
export async function fetchMetaInsights() {
  if (!isMetaConfigured()) return null;
  const token = process.env.META_ACCESS_TOKEN;
  const account = normAccount(process.env.META_AD_ACCOUNT_ID);
  const version = process.env.META_API_VERSION || 'v21.0';
  const lookback = Number(process.env.META_LOOKBACK_DAYS) || 90;

  const end = new Date();
  const start = new Date(end.getTime() - lookback * 86400000);

  const params = new URLSearchParams({
    level: 'ad',
    fields: 'campaign_name,adset_name,ad_name,spend,impressions,clicks,reach',
    breakdowns: 'publisher_platform,platform_position',
    time_range: JSON.stringify({ since: ymd(start), until: ymd(end) }),
    limit: '500',
    access_token: token,
  });

  let url = `${GRAPH}/${version}/${account}/insights?${params.toString()}`;
  const out = [];
  let guard = 0;

  while (url && guard < 50) {
    guard += 1;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!json) throw new Error(`Meta: unerwartete Antwort (HTTP ${res.status})`);
    if (json.error) {
      const e = json.error;
      throw new Error(`Meta-Fehler: ${e.message}${e.code ? ` (Code ${e.code})` : ''}`);
    }
    for (const r of json.data || []) {
      out.push({
        campaign: String(r.campaign_name ?? '').trim(),
        adset: String(r.adset_name ?? '').trim(),
        creative: String(r.ad_name ?? '').trim(),
        platform: String(r.publisher_platform ?? '').trim(),
        // nur die Position; aggregateFb kombiniert sie mit der Plattform zum Placement
        placement: positionLabel(r.platform_position),
        spend: Number(r.spend) || 0,
        impressions: Number(r.impressions) || 0,
        clicks: Number(r.clicks) || 0,
        reach: Number(r.reach) || 0,
      });
    }
    url = json.paging?.next || null;
  }
  return out;
}

export const _internal = { normAccount, positionLabel };

/**
 * Facebook/Meta Marketing API – holt Ad-Insights direkt über den Graph-API-
 * Access-Token. Liefert:
 *   - records:  Placement-Ebene (Ad × publisher_platform × platform_position)
 *               für die bestehende Dimensions-Aggregation (aggregateFb)
 *   - entities: Kennzahlen je Ad inkl. IDs + Hierarchie + INDIVIDUELL
 *               ausgehende Klicks/CTR/Klickpreis (unique_outbound_*)
 *   - daily:    täglicher Ad-Spend/Impressionen/Klicks (für den Zeitgraphen)
 *   - status:   effective_status je Kampagne und Anzeigengruppe (aktiv?)
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

/** Meta liefert action-basierte Felder als Array [{action_type, value}]. Summe der Werte. */
function actionSum(field, type = 'outbound_click') {
  if (!Array.isArray(field)) return 0;
  let sum = 0;
  for (const a of field) {
    if (!type || a.action_type === type) sum += Number(a.value) || 0;
  }
  return sum;
}

function cfg() {
  return {
    token: process.env.META_ACCESS_TOKEN,
    account: normAccount(process.env.META_AD_ACCOUNT_ID),
    version: process.env.META_API_VERSION || 'v21.0',
    lookback: Number(process.env.META_LOOKBACK_DAYS) || 90,
  };
}

function dateRange(lookback) {
  const end = new Date();
  const start = new Date(end.getTime() - lookback * 86400000);
  return { since: ymd(start), until: ymd(end) };
}

/** Generischer paginierter GET gegen die Graph API. */
async function graphGet(url) {
  const out = [];
  let next = url;
  let guard = 0;
  while (next && guard < 60) {
    guard += 1;
    const res = await fetch(next);
    const json = await res.json().catch(() => null);
    if (!json) throw new Error(`Meta: unerwartete Antwort (HTTP ${res.status})`);
    if (json.error) {
      const e = json.error;
      throw new Error(`Meta-Fehler: ${e.message}${e.code ? ` (Code ${e.code})` : ''}`);
    }
    for (const row of json.data || []) out.push(row);
    next = json.paging?.next || null;
  }
  return out;
}

function insightsUrl({ account, version, token }, extra) {
  const params = new URLSearchParams({ access_token: token, limit: '500', ...extra });
  return `${GRAPH}/${version}/${account}/insights?${params.toString()}`;
}

/** Placement-Ebene (für die Dimensions-Tabellen Kampagne/Anzeigengruppe/Creative/Placement). */
async function fetchPlacementRecords(c, range) {
  const rows = await graphGet(
    insightsUrl(c, {
      level: 'ad',
      fields: 'campaign_name,adset_name,ad_name,spend,impressions,clicks,reach',
      breakdowns: 'publisher_platform,platform_position',
      time_range: JSON.stringify(range),
    })
  );
  return rows.map((r) => ({
    campaign: String(r.campaign_name ?? '').trim(),
    adset: String(r.adset_name ?? '').trim(),
    creative: String(r.ad_name ?? '').trim(),
    platform: String(r.publisher_platform ?? '').trim(),
    placement: positionLabel(r.platform_position),
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    reach: Number(r.reach) || 0,
  }));
}

/** Kennzahlen je Ad inkl. IDs und individuell ausgehender Metriken. */
async function fetchEntities(c, range) {
  const rows = await graphGet(
    insightsUrl(c, {
      level: 'ad',
      fields:
        'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,cpm,unique_outbound_clicks,unique_outbound_clicks_ctr,cost_per_unique_outbound_click',
      time_range: JSON.stringify(range),
      time_increment: 'all_days',
    })
  );
  return rows.map((r) => ({
    campaignId: r.campaign_id,
    campaign: String(r.campaign_name ?? '').trim(),
    adsetId: r.adset_id,
    adset: String(r.adset_name ?? '').trim(),
    adId: r.ad_id,
    creative: String(r.ad_name ?? '').trim(),
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    cpm: Number(r.cpm) || 0,
    // INDIVIDUELL ausgehende Klicks (unique_outbound_clicks)
    uniqueOutboundClicks: actionSum(r.unique_outbound_clicks),
    uniqueOutboundCtr: actionSum(r.unique_outbound_clicks_ctr), // in % (action-Wert)
    costPerUniqueOutboundClick: actionSum(r.cost_per_unique_outbound_click),
  }));
}

/** Täglicher Spend/Impressionen/Klicks (Konto-Ebene) für den Zeitgraphen. */
async function fetchDaily(c, range) {
  const rows = await graphGet(
    insightsUrl(c, {
      level: 'account',
      fields: 'spend,impressions,clicks',
      time_range: JSON.stringify(range),
      time_increment: '1',
    })
  );
  return rows
    .map((r) => ({
      date: r.date_start,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** effective_status je Kampagne und Anzeigengruppe. */
async function fetchStatus(c) {
  const camps = await graphGet(
    `${GRAPH}/${c.version}/${c.account}/campaigns?fields=name,effective_status&limit=500&access_token=${c.token}`
  );
  const adsets = await graphGet(
    `${GRAPH}/${c.version}/${c.account}/adsets?fields=name,effective_status,campaign_id&limit=500&access_token=${c.token}`
  );
  const isActive = (s) => s === 'ACTIVE';
  const campaignStatus = {};
  for (const x of camps) campaignStatus[String(x.name).trim()] = { status: x.effective_status, active: isActive(x.effective_status) };
  const adsetStatus = {};
  for (const x of adsets) adsetStatus[String(x.name).trim()] = { status: x.effective_status, active: isActive(x.effective_status) };
  return { campaignStatus, adsetStatus };
}

/** Holt alle Meta-Daten in einem Rutsch. */
export async function fetchMetaAll() {
  if (!isMetaConfigured()) return null;
  const c = cfg();
  const range = dateRange(c.lookback);
  const [records, entities, daily, status] = await Promise.all([
    fetchPlacementRecords(c, range),
    fetchEntities(c, range),
    fetchDaily(c, range),
    fetchStatus(c).catch(() => ({ campaignStatus: {}, adsetStatus: {} })),
  ]);
  return { records, entities, daily, ...status, range };
}

/** Rückwärtskompatibel: nur die Placement-Records (für aggregateFb). */
export async function fetchMetaInsights() {
  const all = await fetchMetaAll();
  return all ? all.records : null;
}

export const _internal = { normAccount, positionLabel, actionSum };

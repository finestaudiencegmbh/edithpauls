/**
 * Führt die Facebook-Kennzahlen (pro Ad) mit der Lead-/Ticket-Attribution aus
 * dem Sheet (über die UTM-Namen) zu einer verschachtelten Hierarchie zusammen:
 *
 *   Kampagne → Anzeigengruppe → Creative (Ad)
 *
 * Jede Ebene enthält:
 *   - aus Facebook:  Spend, Impressionen, CPM, individuell ausgehende Klicks,
 *                    individuell ausgehende CTR, individueller ausg. Klickpreis
 *   - aus dem Sheet: Leads, Tickets (via UTM-Attribution)
 *   - kombiniert:    CPL, Kosten/Ticket, LP-Conversion (= Leads ÷ individuell
 *                    ausgehende Klicks)
 *
 * Zusätzlich werden zwei Tagesreihen gebaut:
 *   - spend  (aus Facebook)
 *   - leads/tickets (aus dem Sheet, nach Lead-Datum)
 */

import { loadCampaignConfig, isLeadCampaign } from './campaigns.js';

const normKey = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function emptyMetrics() {
  return { spend: 0, impressions: 0, clicks: 0, uoc: 0, leads: 0, tickets: 0, scoreSum: 0, scored: 0, qualified: 0 };
}

/** Leitet die abgeleiteten Kennzahlen aus den Rohsummen ab. */
function derive(m) {
  const cpm = m.impressions ? m.spend / (m.impressions / 1000) : null;
  const outboundCtr = m.impressions ? m.uoc / m.impressions : null; // individuell ausgehende CTR
  const cpoc = m.uoc ? m.spend / m.uoc : null; // individueller ausgehender Klickpreis
  const cpl = m.leads ? m.spend / m.leads : null;
  const cpt = m.tickets ? m.spend / m.tickets : null;
  const lpConversion = m.uoc ? m.leads / m.uoc : null; // = CVR Start (Leads ÷ individuell ausg. Klicks)
  return {
    spend: round2(m.spend),
    impressions: m.impressions,
    outboundClicks: m.uoc,
    cpm: round2(cpm),
    outboundCtr,
    cpoc: round2(cpoc),
    leads: m.leads,
    tickets: m.tickets,
    cpl: round2(cpl),
    cpt: round2(cpt),
    lpConversion,
    cvrStart: lpConversion,
    cvrTicket: m.leads ? m.tickets / m.leads : null, // Lead -> Ticket
    avgQuality: m.scored ? Math.round(m.scoreSum / m.scored) : null,
    qualifiedRate: m.tickets ? m.qualified / m.tickets : null,
  };
}

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * @param {object} meta   Ergebnis aus fetchMetaAll() (entities, daily, status)
 * @param {array}  leads  Lead-Records aus buildDataset (mit campaign/adset/creative, wonAt, hasTicket)
 */
export function combineMetaWithLeads(meta, leads) {
  const { entities = [], daily = [], campaignStatus = {}, adsetStatus = {} } = meta || {};
  const campCfg = loadCampaignConfig();

  // Lead-/Ticket-/Qualitäts-Zähler je Dimension (über normalisierte UTM-Namen)
  const leadBy = { campaign: new Map(), adset: new Map(), creative: new Map() };
  for (const l of leads || []) {
    if (l.sourceType !== 'paid') continue;
    for (const dim of ['campaign', 'adset', 'creative']) {
      const k = normKey(l[dim]);
      if (!k) continue;
      if (!leadBy[dim].has(k)) leadBy[dim].set(k, { leads: 0, tickets: 0, scoreSum: 0, scored: 0, qualified: 0 });
      const e = leadBy[dim].get(k);
      e.leads += 1;
      if (l.hasTicket) e.tickets += 1;
      if (l.quality) {
        e.scoreSum += l.quality.score;
        e.scored += 1;
        if (['A', 'B'].includes(l.quality.tier)) e.qualified += 1;
      }
    }
  }
  const lookupLeads = (dim, name) => leadBy[dim].get(normKey(name)) || { leads: 0, tickets: 0, scoreSum: 0, scored: 0, qualified: 0 };

  // Hierarchie aufbauen: Kampagne -> Anzeigengruppe -> Ad
  const campaigns = new Map();
  for (const e of entities) {
    const cKey = normKey(e.campaign);
    if (!campaigns.has(cKey)) {
      const objective = campaignStatus[e.campaign]?.objective ?? null;
      campaigns.set(cKey, {
        id: e.campaignId,
        name: e.campaign,
        level: 'campaign',
        active: campaignStatus[e.campaign]?.active ?? null,
        status: campaignStatus[e.campaign]?.status ?? null,
        objective,
        leadCampaign: isLeadCampaign(e.campaign, objective, campCfg),
        _m: emptyMetrics(),
        adsets: new Map(),
      });
    }
    const c = campaigns.get(cKey);
    const aKey = normKey(e.adset);
    if (!c.adsets.has(aKey)) {
      c.adsets.set(aKey, {
        id: e.adsetId,
        name: e.adset,
        level: 'adset',
        active: adsetStatus[e.adset]?.active ?? null,
        status: adsetStatus[e.adset]?.status ?? null,
        _m: emptyMetrics(),
        ads: [],
      });
    }
    const a = c.adsets.get(aKey);

    // Ad-Ebene: FB-Kennzahlen direkt, Leads/Tickets/Qualität über Creative-Namen
    const adLeads = lookupLeads('creative', e.creative);
    const adM = {
      spend: e.spend,
      impressions: e.impressions,
      clicks: e.clicks,
      uoc: e.uniqueOutboundClicks,
      leads: adLeads.leads,
      tickets: adLeads.tickets,
      scoreSum: adLeads.scoreSum,
      scored: adLeads.scored,
      qualified: adLeads.qualified,
    };
    a.ads.push({ id: e.adId, name: e.creative, level: 'ad', ...derive(adM) });

    // FB-Summen nach oben aggregieren
    for (const node of [a._m, c._m]) {
      node.spend += e.spend;
      node.impressions += e.impressions;
      node.clicks += e.clicks;
      node.uoc += e.uniqueOutboundClicks;
    }
  }

  // Leads/Tickets je Ebene aus der Sheet-Attribution (nicht aus Ad-Summe,
  // damit auch Leads ohne exakten Creative-Match auf Anzeigengruppen-/
  // Kampagnenebene korrekt erscheinen)
  const applyLeadStats = (m, src) => {
    m.leads = src.leads;
    m.tickets = src.tickets;
    m.scoreSum = src.scoreSum;
    m.scored = src.scored;
    m.qualified = src.qualified;
  };
  const result = [];
  for (const c of campaigns.values()) {
    applyLeadStats(c._m, lookupLeads('campaign', c.name));
    const adsets = [];
    for (const a of c.adsets.values()) {
      applyLeadStats(a._m, lookupLeads('adset', a.name));
      adsets.push({
        id: a.id, name: a.name, level: 'adset', active: a.active, status: a.status,
        ...derive(a._m),
        ads: a.ads.sort((x, y) => y.spend - x.spend),
      });
    }
    result.push({
      id: c.id, name: c.name, level: 'campaign', active: c.active, status: c.status,
      objective: c.objective, leadCampaign: c.leadCampaign,
      ...derive(c._m),
      adsets: adsets.sort((x, y) => y.spend - x.spend),
    });
  }
  result.sort((x, y) => y.spend - x.spend);

  // Summen: gesamt vs. nur Lead-Kampagnen (für CPL/€-Ticket ohne Traffic-Spend)
  const totals = { spend: 0, leadSpend: 0, impressions: 0, outboundClicks: 0, leads: 0, tickets: 0, nonLeadSpend: 0 };
  for (const c of result) {
    totals.spend += c.spend || 0;
    totals.impressions += c.impressions || 0;
    totals.outboundClicks += c.outboundClicks || 0;
    totals.leads += c.leads || 0;
    totals.tickets += c.tickets || 0;
    if (c.leadCampaign) totals.leadSpend += c.spend || 0;
    else totals.nonLeadSpend += c.spend || 0;
  }
  totals.spend = round2(totals.spend);
  totals.leadSpend = round2(totals.leadSpend);
  totals.nonLeadSpend = round2(totals.nonLeadSpend);

  // Welche Kampagnen sind Nicht-Lead (Traffic etc.)? -> für Tagesreihen-Abzug
  const nonLeadCampaignKeys = new Set(result.filter((c) => !c.leadCampaign).map((c) => normKey(c.name)));

  // Tagesreihen
  const spendByDay = daily.map((d) => ({ date: d.date, spend: round2(d.spend), impressions: d.impressions, clicks: d.clicks }));

  const leadDay = new Map();
  for (const l of leads || []) {
    const day = (l.wonAt || '').slice(0, 10);
    if (!day) continue;
    if (!leadDay.has(day)) leadDay.set(day, { date: day, leads: 0, tickets: 0 });
    const e = leadDay.get(day);
    e.leads += 1;
    if (l.hasTicket) e.tickets += 1;
  }
  const leadsByDay = [...leadDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  // Individuell ausgehende Klicks je Dimension (für CTR/CPC/CVR-Start in der
  // "Performance nach Ebene"-Tabelle), Schlüssel normalisiert.
  const uocByDim = { campaign: {}, adset: {}, creative: {} };
  for (const e of entities) {
    const add = (bucket, name) => {
      const k = normKey(name);
      if (!k) return;
      bucket[k] = (bucket[k] || 0) + (e.uniqueOutboundClicks || 0);
    };
    add(uocByDim.campaign, e.campaign);
    add(uocByDim.adset, e.adset);
    add(uocByDim.creative, e.creative);
  }

  // Pro Dimension (campaign/adset/creative): FB-Kennzahlen + Status + Lead-Stats,
  // damit das Frontend AUCH pausierte Einträge ohne Leads anzeigen kann (grau).
  const dimMeta = { campaign: {}, adset: {}, creative: {} };
  const ensure = (dim, name, { active = null, parents = {} } = {}) => {
    const k = normKey(name);
    if (!k) return null;
    if (!dimMeta[dim][k]) {
      dimMeta[dim][k] = { name, spend: 0, impressions: 0, clicks: 0, uoc: 0, active, parents };
    }
    if (active != null) dimMeta[dim][k].active = active;
    return dimMeta[dim][k];
  };
  for (const e of entities) {
    const cActive = campaignStatus[e.campaign]?.active ?? null;
    const aActive = adsetStatus[e.adset]?.active ?? null;
    const buckets = [
      ensure('campaign', e.campaign, { active: cActive }),
      ensure('adset', e.adset, { active: aActive, parents: { campaign: e.campaign } }),
      ensure('creative', e.creative, { active: aActive, parents: { campaign: e.campaign, adset: e.adset } }),
    ];
    for (const b of buckets) {
      if (!b) continue;
      b.spend += e.spend || 0;
      b.impressions += e.impressions || 0;
      b.clicks += e.clicks || 0;
      b.uoc += e.uniqueOutboundClicks || 0;
    }
  }

  return {
    hierarchy: result,
    totals,
    uocByDim,
    dimMeta,
    nonLeadCampaigns: result.filter((c) => !c.leadCampaign).map((c) => ({ name: c.name, objective: c.objective, spend: c.spend })),
    daily: { spend: spendByDay, leads: leadsByDay },
  };
}

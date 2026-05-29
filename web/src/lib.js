// ---- Formatierung ----------------------------------------------------------
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const intf = new Intl.NumberFormat('de-DE');

export const fmtEur = (n) => (n == null || Number.isNaN(n) ? '–' : eur.format(n));
export const fmtEur2 = (n) => (n == null || Number.isNaN(n) ? '–' : eur2.format(n));
export const fmtInt = (n) => (n == null ? '–' : intf.format(n));
export const fmtPct = (n) => (n == null || Number.isNaN(n) ? '–' : `${(n * 100).toFixed(1)} %`);
export const fmtScore = (n) => (n == null ? '–' : String(Math.round(n)));
export const fmtDate = (iso) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
};

// ---- Filterung -------------------------------------------------------------
export const DIMENSIONS = [
  { key: 'campaign', label: 'Kampagne' },
  { key: 'adset', label: 'Anzeigengruppe' },
  { key: 'creative', label: 'Creative' },
  { key: 'placement', label: 'Placement' },
];

export function uniqueValues(leads, key) {
  return [...new Set(leads.map((l) => l[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

export function answerValues(leads, answerKey) {
  return [
    ...new Set(
      leads
        .filter((l) => l.answers && l.answers[answerKey])
        .map((l) => l.answers[answerKey])
    ),
  ].sort((a, b) => a.localeCompare(b, 'de'));
}

export function applyFilters(leads, f) {
  return leads.filter((l) => {
    if (f.sourceType !== 'all' && l.sourceType !== f.sourceType) return false;
    if (f.campaign && l.campaign !== f.campaign) return false;
    if (f.adset && l.adset !== f.adset) return false;
    if (f.creative && l.creative !== f.creative) return false;
    if (f.placement && l.placement !== f.placement) return false;
    if (f.onlyTickets && !l.hasTicket) return false;
    if (f.employment && l.answers?.employment !== f.employment) return false;
    if (f.income && l.answers?.income !== f.income) return false;
    if (f.realEstate && l.answers?.realEstate !== f.realEstate) return false;
    if (f.tiers && f.tiers.length) {
      const tier = l.quality?.tier;
      const ok = (tier && f.tiers.includes(tier)) || (!tier && f.tiers.includes('none'));
      if (!ok) return false;
    }
    if (f.from && l.wonAt && l.wonAt.slice(0, 10) < f.from) return false;
    if (f.to && l.wonAt && l.wonAt.slice(0, 10) > f.to) return false;
    if (f.search) {
      const hay = `${l.name} ${l.email} ${l.creative} ${l.adset}`.toLowerCase();
      if (!hay.includes(f.search.toLowerCase())) return false;
    }
    return true;
  });
}

// ---- Aggregation -----------------------------------------------------------
const normKey = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function spendForAdsets(adsetNames, overviewByAdset) {
  let sum = 0;
  let any = false;
  for (const name of adsetNames) {
    const o = overviewByAdset[name.toLowerCase()];
    if (o && o.adspend != null) {
      sum += o.adspend;
      any = true;
    }
  }
  return any ? sum : null;
}

/**
 * Verdichtet die (gefilterten) Leads nach einer Dimension.
 * Spend/Impressionen/Klicks kommen – sofern vorhanden – aus den Facebook-
 * Daten (Supermetrics) je Dimension. Fällt darauf zurück: Adspend je
 * Anzeigengruppe aus der Sheet-Übersicht (nur Kampagne/Anzeigengruppe).
 */
export function aggregate(leads, dimKey, overviewByAdset, fb) {
  const fbDim = fb?.byDim?.[dimKey] || null;
  const groups = new Map();
  for (const l of leads) {
    const k = l[dimKey] || '(unbekannt)';
    if (!groups.has(k)) groups.set(k, { key: k, leads: [], adsets: new Set() });
    const g = groups.get(k);
    g.leads.push(l);
    if (l.adset) g.adsets.add(l.adset);
  }

  const rows = [];
  for (const g of groups.values()) {
    const total = g.leads.length;
    const ticketLeads = g.leads.filter((l) => l.hasTicket);
    const tickets = ticketLeads.length;
    const scored = ticketLeads.filter((l) => l.quality);
    const avgQuality = scored.length
      ? Math.round(scored.reduce((s, l) => s + l.quality.score, 0) / scored.length)
      : null;
    const qualified = ticketLeads.filter((l) => ['A', 'B'].includes(l.quality?.tier)).length;

    const m = fbDim ? fbDim[normKey(g.key)] : null;
    let spend = m ? m.spend : null;
    if (spend == null && (dimKey === 'adset' || dimKey === 'campaign')) {
      spend = spendForAdsets([...g.adsets], overviewByAdset);
    }
    const impressions = m ? m.impressions : null;
    const clicks = m ? m.clicks : null;

    rows.push({
      key: g.key,
      leads: total,
      tickets,
      ticketRate: total ? tickets / total : null,
      avgQuality,
      qualified,
      qualifiedRate: tickets ? qualified / tickets : null,
      spend,
      impressions,
      clicks,
      cpm: impressions ? (spend ?? 0) / (impressions / 1000) : null,
      ctr: impressions ? clicks / impressions : null,
      cpl: spend != null && total ? spend / total : null,
      cpt: spend != null && tickets ? spend / tickets : null,
    });
  }
  return rows;
}

export function computeKpis(leads, overviewByAdset, fb) {
  const total = leads.length;
  const paid = leads.filter((l) => l.sourceType === 'paid');
  const organic = leads.filter((l) => l.sourceType !== 'paid');

  // Tickets getrennt nach Quelle
  const paidTickets = paid.filter((l) => l.hasTicket);
  const organicTickets = organic.filter((l) => l.hasTicket);
  const ticketLeads = leads.filter((l) => l.hasTicket);

  // Qualität: über alle bewerteten Tickets (Antworten kommen aus dem Sheet,
  // unabhängig von der Quelle)
  const scored = ticketLeads.filter((l) => l.quality);
  const qualified = ticketLeads.filter((l) => ['A', 'B'].includes(l.quality?.tier)).length;

  let spend = fb?.totals?.spend ?? null;
  let impressions = fb?.totals?.impressions ?? null;
  if (spend == null) {
    const adsets = new Set(paid.map((l) => l.adset));
    spend = spendForAdsets([...adsets], overviewByAdset);
  }
  // CPL & Kosten/Ticket nur auf Lead-Kampagnen-Spend (ohne Traffic) UND nur
  // auf BEZAHLTE Leads/Tickets beziehen – Spend gibt es nur für Paid, daher
  // dürfen organische Leads den CPL nicht verwässern.
  const leadSpend = fb?.totals?.leadSpend ?? spend;
  const nonLeadSpend = fb?.totals?.nonLeadSpend ?? 0;
  return {
    total,
    paid: paid.length,
    organic: organic.length,
    paidTickets: paidTickets.length,
    organicTickets: organicTickets.length,
    paidTicketRate: paid.length ? paidTickets.length / paid.length : null,
    organicTicketRate: organic.length ? organicTickets.length / organic.length : null,
    tickets: ticketLeads.length,
    ticketRate: total ? ticketLeads.length / total : null,
    avgQuality: scored.length ? Math.round(scored.reduce((s, l) => s + l.quality.score, 0) / scored.length) : null,
    qualified,
    qualifiedRate: ticketLeads.length ? qualified / ticketLeads.length : null,
    spend,
    leadSpend,
    nonLeadSpend,
    impressions,
    // Denominator = bezahlte Leads/Tickets (nicht alle), da Spend nur Paid ist
    cpl: leadSpend != null && paid.length ? leadSpend / paid.length : null,
    cpt: leadSpend != null && paidTickets.length ? leadSpend / paidTickets.length : null,
  };
}

/** Tägliche Leads/Tickets aus (gefilterten) Leads – für den Verlaufs-Graphen. */
export function leadsByDay(leads) {
  const m = new Map();
  for (const l of leads) {
    const day = (l.wonAt || '').slice(0, 10);
    if (!day) continue;
    if (!m.has(day)) m.set(day, { date: day, leads: 0, tickets: 0 });
    const e = m.get(day);
    e.leads += 1;
    if (l.hasTicket) e.tickets += 1;
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function tierDistribution(leads, tiers) {
  const dist = {};
  for (const t of tiers) dist[t.key] = 0;
  dist.none = 0;
  for (const l of leads.filter((x) => x.hasTicket)) {
    const k = l.quality?.tier || 'none';
    dist[k] = (dist[k] || 0) + 1;
  }
  return dist;
}

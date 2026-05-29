import { computeQuality } from './scoring.js';
import { loadCampaignConfig } from './campaigns.js';

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Rein numerischer Wert (z. B. Meta-IDs wie 52540202640549) -> nicht zuordenbar. */
const isNumericId = (s) => /^\d{6,}$/.test(collapse(s));

/** Lesbares Label für ein Placement (utm_term). */
function placementLabel(term) {
  const t = collapse(term);
  if (!t) return '(kein Placement)';
  if (/^\d{6,}$/.test(t)) return `Placement-ID ${t}`;
  return t.replace(/_/g, ' ');
}

/** Quellen, die immer als organisch gelten – unabhängig vom UTM-Schema. */
function isOrganicSource(utm, patterns) {
  const hay = [utm.source, utm.medium, utm.campaign, utm.term]
    .map((v) => collapse(v).toLowerCase())
    .join(' | ');
  return patterns.some((p) => hay.includes(String(p).toLowerCase()));
}

/**
 * Entscheidet, ob ein Datensatz aus bezahlter Werbung stammt.
 * Bezahlte Anzeigengruppen folgen dem Schema "X | Y | Z | ..." und/oder
 * tauchen in der Adspend-Übersicht auf. Alles andere gilt als organisch.
 */
function isPaid(utm, paidAdsets, patterns) {
  // Harte Regel: ManyChat / Bio / moneymaker-workshop ist immer organisch.
  if (isOrganicSource(utm, patterns)) return false;
  const src = collapse(utm.source);
  if (!src) return false;
  if (paidAdsets.has(src.toLowerCase())) return true;
  // Bezahlte Anzeigengruppen folgen dem Schema "X | Y | Z | ...".
  if (src.includes('|')) return true;
  // Rein numerische Source = Meta-ID -> bezahlt (aber nicht eindeutig zuordenbar).
  if (isNumericId(src)) return true;
  return false;
}

/**
 * Führt Leads, VIP-Tickets und Adspend-Übersicht zu einem einheitlichen
 * Datensatz zusammen. Join über die E-Mail-Adresse.
 */
export function buildDataset({ leads, tickets, overview }, cfg) {
  const warnings = [];
  const paidAdsets = new Set(overview.map((o) => o.adset.toLowerCase()));
  const campCfg = loadCampaignConfig();
  const organicPatterns = campCfg.organicPatterns || ['manychat', 'bio'];
  const organicLabel = campCfg.organicLabel || '(organisch)';
  const unattribLabel = campCfg.unattributablePaidLabel || '(Paid · nicht zuordenbar)';

  const byEmail = new Map();

  const makeRecord = (email) => {
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        firstName: '',
        lastName: '',
        phone: '',
        wonAt: null,
        ticketAt: null,
        utm: { source: '', medium: '', campaign: '', term: '' },
        hasTicket: false,
        answers: null,
      });
    }
    return byEmail.get(email);
  };

  // 1) Leads einlesen
  for (const l of leads) {
    if (!l.email) continue;
    const r = makeRecord(l.email);
    r.firstName ||= l.firstName;
    r.lastName ||= l.lastName;
    r.wonAt = r.wonAt || l.wonAt;
    if (collapse(l.utm.source)) r.utm = { ...l.utm };
    // "VIP-Ticket geholt am" in der Leads-Zeile ist das zuverlässigste
    // Ticket-Signal und liegt auf derselben Zeile wie das Creative.
    // Dadurch werden Tickets korrekt auf Kampagne/Anzeigengruppe/Creative/
    // Placement zugeordnet – unabhängig vom (fehleranfälligen) E-Mail-Join
    // zum Antworten-Tab, der nur noch die Qualitäts-Antworten beisteuert.
    if (l.ticketAt) {
      r.ticketAt = l.ticketAt;
      r.hasTicket = true;
    }
  }

  // 2) Tickets dranjoinen (und ggf. neue Personen anlegen, die nur im
  //    VIP-Tab stehen). Funnelcockpit- und Typeform-Mail können sich durch
  //    Tippfehler unterscheiden – wir bevorzugen die E-Mail, zu der bereits
  //    ein Lead existiert, damit Lead und Ticket sicher zusammenfinden.
  for (const t of tickets) {
    const candidates = [t.email, t.emailTypeform].filter(Boolean);
    const email = candidates.find((e) => byEmail.has(e)) || candidates[0];
    if (!email) continue;
    const r = makeRecord(email);
    r.firstName ||= t.firstName;
    r.lastName ||= t.lastName;
    r.phone ||= t.phone;
    r.hasTicket = true;
    r.ticketAt = r.ticketAt || t.at;
    r.answers = t.answers;
    // UTM aus dem Ticket nur übernehmen, wenn der Lead keine hatte
    if (!collapse(r.utm.source) && collapse(t.utm.source)) r.utm = { ...t.utm };
  }

  // 3) Finalisieren: Dimensionen, Quelle, Qualität
  const records = [];
  for (const r of byEmail.values()) {
    const paid = isPaid(r.utm, paidAdsets, organicPatterns);
    const quality = r.hasTicket ? computeQuality(r.answers, cfg) : null;

    // Dimensions-Labels je nach Quelle/Zuordenbarkeit:
    // - organisch: alles unter einem Sammel-Label zusammenfassen
    // - paid, aber Name = reine Meta-ID (nicht zuordenbar): Sammel-Bucket
    const rawCampaign = collapse(r.utm.campaign);
    const rawAdset = collapse(r.utm.source);
    const rawCreative = collapse(r.utm.medium);
    let campaign, adset, creative;
    if (!paid) {
      campaign = organicLabel;
      adset = organicLabel;
      creative = rawCreative || organicLabel;
    } else if (isNumericId(rawCampaign) || isNumericId(rawAdset) || (!rawCampaign && !rawAdset)) {
      campaign = unattribLabel;
      adset = unattribLabel;
      creative = rawCreative || unattribLabel;
    } else {
      campaign = rawCampaign || '(unbekannt)';
      adset = rawAdset || '(unbekannt)';
      creative = rawCreative || '(unbekannt)';
    }

    records.push({
      email: r.email,
      name: collapse(`${r.firstName} ${r.lastName}`) || '(ohne Name)',
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      wonAt: r.wonAt,
      ticketAt: r.ticketAt,
      hasTicket: r.hasTicket,
      sourceType: paid ? 'paid' : 'organic',
      campaign,
      adset,
      creative,
      placement: placementLabel(r.utm.term),
      placementRaw: collapse(r.utm.term),
      // Rohe UTM-Werte für den Quellen-Tab (Donut/Top-Listen)
      sourceRaw: collapse(r.utm.source),
      campaignRaw: collapse(r.utm.campaign),
      mediumRaw: collapse(r.utm.medium),
      quality,
      answers: r.answers,
    });
  }

  // Spend-Übersicht: nach Anzeigengruppe verdichten (mehrere Kampagnen-Tabs)
  const overviewByAdset = new Map();
  for (const o of overview) {
    const k = o.adset.toLowerCase();
    if (!overviewByAdset.has(k)) overviewByAdset.set(k, o);
  }

  const matchedAdsets = new Set(records.filter((r) => r.sourceType === 'paid').map((r) => r.adset.toLowerCase()));
  for (const o of overview) {
    if (!matchedAdsets.has(o.adset.toLowerCase())) {
      // Übersicht kennt eine Anzeigengruppe, zu der (noch) keine Leads mit
      // exakt gleichem utm_source gefunden wurden – nur ein Hinweis.
    }
  }

  return {
    leads: records,
    overview,
    overviewByAdset: Object.fromEntries(overviewByAdset),
    warnings,
    counts: {
      leads: records.length,
      paidLeads: records.filter((r) => r.sourceType === 'paid').length,
      tickets: records.filter((r) => r.hasTicket).length,
      scored: records.filter((r) => r.quality).length,
    },
  };
}

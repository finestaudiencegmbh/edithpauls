import { computeQuality } from './scoring.js';

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Lesbares Label für ein Placement (utm_term). */
function placementLabel(term) {
  const t = collapse(term);
  if (!t) return '(kein Placement)';
  if (/^\d{6,}$/.test(t)) return `Placement-ID ${t}`;
  return t.replace(/_/g, ' ');
}

/**
 * Entscheidet, ob ein Datensatz aus bezahlter Werbung stammt.
 * Bezahlte Anzeigengruppen folgen dem Schema "X | Y | Z | ..." und/oder
 * tauchen in der Adspend-Übersicht auf. Alles andere gilt als organisch.
 */
function isPaid(utm, paidAdsets) {
  const src = collapse(utm.source);
  if (!src) return false;
  if (paidAdsets.has(src.toLowerCase())) return true;
  // Bezahlte Anzeigengruppen folgen dem Schema "X | Y | Z | ...".
  // Organische Quellen (instagram, fb-bio, yt-bio, …) sind einzelne Tokens.
  if (src.includes('|')) return true;
  return false;
}

/**
 * Führt Leads, VIP-Tickets und Adspend-Übersicht zu einem einheitlichen
 * Datensatz zusammen. Join über die E-Mail-Adresse.
 */
export function buildDataset({ leads, tickets, overview }, cfg) {
  const warnings = [];
  const paidAdsets = new Set(overview.map((o) => o.adset.toLowerCase()));

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
    if (l.ticketAt) r.ticketAt = l.ticketAt;
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
    const paid = isPaid(r.utm, paidAdsets);
    const quality = r.hasTicket ? computeQuality(r.answers, cfg) : null;
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
      campaign: collapse(r.utm.campaign) || (paid ? '(unbekannt)' : '(organisch)'),
      adset: collapse(r.utm.source) || '(unbekannt)',
      creative: collapse(r.utm.medium) || '(unbekannt)',
      placement: placementLabel(r.utm.term),
      placementRaw: collapse(r.utm.term),
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

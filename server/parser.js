import { DEFAULT_PROJECT } from './project.js';

/**
 * Wandelt die Roh-Zellen aus dem Google Sheet in strukturierte Datensätze um.
 *
 * Das Sheet besteht aus mehreren Tabs/Tabellen. Statt fixe Tab-Namen
 * vorauszusetzen, erkennt der Parser jede Tabelle an ihrer Kopfzeile.
 * Dadurch bleibt er stabil, auch wenn Tabs umbenannt oder verschoben werden.
 */

const norm = (s) =>
  String(s ?? '')
    .replace(/ /g, ' ')
    .trim();

const key = (s) =>
  norm(s)
    .toLowerCase()
    .replace(/[?:.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Prüft eine normalisierte Spalten-Menge gegen eine detect-Definition
 * { all: [...], any: [...] }: alle 'all'-Spalten müssen vorhanden sein UND –
 * falls 'any' gesetzt ist – mindestens eine davon.
 */
function matchDetect(set, detect) {
  if (!detect) return false;
  const all = detect.all || [];
  const any = detect.any || [];
  if (all.length === 0 && any.length === 0) return false;
  const hasAll = all.every((k) => set.has(k));
  const hasAny = any.length ? any.some((k) => set.has(k)) : true;
  return hasAll && hasAny;
}

/** Erkennt anhand einer Kopfzeile, um welchen Tabellentyp es sich handelt. */
function classifyHeader(cells, project) {
  const set = new Set(cells.map(key));
  if (matchDetect(set, project?.sheet?.overview?.detect)) return 'overview';
  if (matchDetect(set, project?.questionnaire?.detect)) return 'tickets';
  if (matchDetect(set, project?.sheet?.leads?.detect)) return 'leads';
  return null;
}

function rowToObj(headerCells, row) {
  const obj = {};
  headerCells.forEach((h, i) => {
    const k = key(h);
    if (!k) return;
    obj[k] = norm(row[i]);
  });
  return obj;
}

function isEmptyRow(row) {
  return !row || row.every((c) => norm(c) === '');
}

function parseDate(s) {
  const v = norm(s);
  if (!v) return null;
  // Nur echte Datumsangaben akzeptieren (Format im Sheet:
  // "2026-05-26 18:46:08 +0000"). Verhindert, dass Zähl-/Summenzeilen
  // wie "161" fälschlich als Datum (Jahr 161) interpretiert werden.
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const d = new Date(v.replace(' +0000', 'Z').replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const normEmail = (s) => norm(s).toLowerCase();

/**
 * Zerlegt ein Tab (2D-Array) in einzelne Tabellen. Ein Tab kann mehrere
 * untereinander gestapelte Tabellen enthalten (z. B. die Anzeigengruppen-
 * Übersicht mit mehreren Kampagnen).
 */
function* iterateTables(rows, project) {
  let header = null;
  let type = null;
  let body = [];
  const flush = () => {
    if (header && body.length) return { header, type, body };
    return null;
  };
  for (const row of rows) {
    const t = classifyHeader(row.map(norm).filter(Boolean).length >= 2 ? row : [], project);
    if (t) {
      const prev = flush();
      if (prev) yield prev;
      header = row;
      type = t;
      body = [];
      continue;
    }
    if (header) {
      if (isEmptyRow(row)) {
        const prev = flush();
        if (prev) yield prev;
        header = null;
        type = null;
        body = [];
      } else {
        body.push(row);
      }
    }
  }
  const last = flush();
  if (last) yield last;
}

const num = (s) => {
  const v = norm(s).replace(/[^\d,.-]/g, '');
  if (!v) return null;
  // deutsches Format: 1.030,11 -> 1030.11
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function parseOverviewRow(o, fields) {
  const adset = norm(pickRaw(o, fields.key));
  if (!adset) return null;
  return {
    status: norm(pickRaw(o, fields.status)),
    adset,
    adspend: num(pickRaw(o, fields.adspend)),
    clicks: num(pickRaw(o, fields.clicks)),
    cpc: num(pickRaw(o, fields.cpc)),
    cvrStart: num(pickRaw(o, fields.cvrStart)),
    leads: num(pickRaw(o, fields.leads)),
  };
}

/** Erster nicht-leerer Roh-Wert aus einer Liste möglicher Spalten-Schlüssel. */
function pickRaw(o, keys) {
  for (const k of keys || []) {
    const v = o[k];
    if (v != null && norm(v) !== '') return v;
  }
  return '';
}

function parseLeadRow(o, fields) {
  const wonAt = parseDate(pickRaw(o, fields.at));
  if (!wonAt) return null; // Zähl-/Summenzeilen ohne gültiges Datum überspringen
  return {
    wonAt,
    firstName: norm(pickRaw(o, fields.firstName)) || norm(pickRaw(o, fields.name)),
    lastName: norm(pickRaw(o, fields.lastName)),
    email: normEmail(pickRaw(o, fields.email)),
    utm: {
      source: norm(pickRaw(o, fields.utmSource)),
      medium: norm(pickRaw(o, fields.utmMedium)),
      campaign: norm(pickRaw(o, fields.utmCampaign)),
      term: norm(pickRaw(o, fields.utmTerm)),
    },
    ticketAt: parseDate(pickRaw(o, fields.ticketColumn)),
  };
}

function parseTicketRow(o, project) {
  const q = project.questionnaire || {};
  const f = q.fields || {};
  const at = parseDate(pickRaw(o, f.at));
  const email = normEmail(pickRaw(o, f.email));
  if (!at && !email) return null;
  const answers = {};
  for (const [key, cols] of Object.entries(q.answers || {})) {
    answers[key] = norm(pickRaw(o, cols));
  }
  return {
    at,
    firstName: norm(pickRaw(o, f.firstName)),
    lastName: norm(pickRaw(o, f.lastName)),
    email,
    emailTypeform: normEmail(pickRaw(o, f.emailTypeform)),
    phone: norm(pickRaw(o, f.phone)),
    answers,
    utm: {
      source: norm(o['utm_source']),
      medium: norm(o['utm_medium']),
      campaign: norm(o['utm_campaign']),
      term: norm(o['utm_term']),
    },
  };
}

/**
 * Hauptfunktion: bekommt die Tabs als [{title, values}] und liefert
 * { leads, tickets, overview, warnings }.
 */
export function parseSheets(sheets, project = DEFAULT_PROJECT) {
  const leads = [];
  const tickets = [];
  const overview = [];
  const warnings = [];
  const seenTickets = new Set();
  const overviewFields = project.sheet?.overview?.fields || DEFAULT_PROJECT.sheet.overview.fields;
  const leadFields = project.sheet?.leads?.fields || DEFAULT_PROJECT.sheet.leads.fields;

  for (const sheet of sheets) {
    const rows = sheet.values || [];
    for (const table of iterateTables(rows, project)) {
      for (const row of table.body) {
        const o = rowToObj(table.header, row);
        if (table.type === 'overview') {
          const r = parseOverviewRow(o, overviewFields);
          if (r) overview.push(r);
        } else if (table.type === 'leads') {
          const r = parseLeadRow(o, leadFields);
          if (r) leads.push(r);
        } else if (table.type === 'tickets') {
          const r = parseTicketRow(o, project);
          if (!r) continue;
          // Dedupe (das Sheet enthält teils zwei Ticket-Tabs)
          const dk = `${r.email}|${r.at || ''}`;
          if (seenTickets.has(dk)) continue;
          seenTickets.add(dk);
          tickets.push(r);
        }
      }
    }
  }

  return { leads, tickets, overview, warnings };
}

export const _internal = {
  classifyHeader: (cells, project = DEFAULT_PROJECT) => classifyHeader(cells, project),
  key,
  num,
  parseDate,
  iterateTables: (rows, project = DEFAULT_PROJECT) => iterateTables(rows, project),
};

import React from 'react';
import { fmtEur, fmtInt, fmtPct } from '../lib.js';

const fmtEur2 = (n) => (n == null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n));
const fmtScore = (n) => (n == null ? '–' : String(Math.round(n)));

/** Kennzahlen einer aggregierten Zeile in drei Sektionen (kein H-Scroll). */
function Metrics({ r }) {
  const groups = [
    {
      title: 'Ergebnis', cls: 'g-result',
      items: [
        ['Adspend', fmtEur(r.spend)],
        ['Leads', fmtInt(r.leads)],
        ['Tickets', fmtInt(r.tickets)],
        ['€/Lead', fmtEur(r.cpl)],
        ['€/Ticket', fmtEur(r.cpt)],
      ],
    },
    {
      title: 'Qualität & Funnel', cls: 'g-quality',
      items: [
        ['Quali-Rate', fmtPct(r.qualifiedRate)],
        ['Ø Quali', fmtScore(r.avgQuality)],
        ['CVR Start', fmtPct(r.cvrStart)],
        ['CVR Ticket', fmtPct(r.ticketRate)],
      ],
    },
    {
      title: 'Facebook', cls: 'g-fb',
      items: [
        ['CPM', fmtEur2(r.cpm)],
        ['CTR ausg.', fmtPct(r.outboundCtr)],
        ['CPC ausg.', fmtEur2(r.cpoc)],
        ['Ausg. Klicks', fmtInt(r.outboundClicks)],
      ],
    },
  ];
  return (
    <div className="cc-metrics">
      {groups.map((g) => (
        <div key={g.title} className={`cc-group ${g.cls}`}>
          <div className="cc-group-title">{g.title}</div>
          <div className="cc-tiles">
            {g.items.map(([label, val]) => (
              <div key={label} className="cc-tile">
                <span className="cc-tile-val">{val}</span>
                <span className="cc-tile-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const SORTS = [
  { key: 'spend', label: 'Adspend' },
  { key: 'leads', label: 'Leads' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'cpl', label: '€/Lead' },
  { key: 'qualifiedRate', label: 'Quali-Rate' },
  { key: 'cvrStart', label: 'CVR Start' },
];

/**
 * Karten-Ansicht der aktuell gewählten Ebene. Klick auf eine Karte = eine
 * Ebene tiefer (Drill-Down via onDrill). Sortierung oben rechts.
 */
export default function CampaignCards({ rows, dimKey, canDrill, onDrill, sort, setSort }) {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.col]; const bv = b[sort.col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv, 'de') : av - bv;
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  return (
    <div>
      <div className="cc-sortbar">
        <span className="muted">{rows.length} {dimKey === 'campaign' ? 'Kampagnen' : dimKey === 'adset' ? 'Anzeigengruppen' : dimKey === 'creative' ? 'Creatives' : 'Placements'}</span>
        <label className="cc-sort">
          Sortieren:
          <select value={sort.col} onChange={(e) => setSort({ col: e.target.value, dir: 'desc' })}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="cc-list">
        {sorted.map((r) => (
          <div key={r.key} className="cc-card">
            <div className={`cc-head ${canDrill ? 'drill' : ''}`} onClick={() => canDrill && onDrill(r.key)} title={canDrill ? 'Klicken = eine Ebene tiefer' : undefined}>
              <span className="cc-name" title={r.key}>{r.key}</span>
              {canDrill && <span className="cc-drill-hint">eine Ebene tiefer ›</span>}
              <span className="cc-head-spend">{fmtEur(r.spend)}</span>
            </div>
            <Metrics r={r} />
          </div>
        ))}
        {sorted.length === 0 && <div className="empty">Keine Daten für die aktuelle Auswahl.</div>}
      </div>
    </div>
  );
}

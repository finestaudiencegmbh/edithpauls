import React, { useState, useMemo } from 'react';
import { fmtDate } from '../lib.js';
import QualityBadge from './QualityBadge.jsx';

const COLS = [
  { key: 'name', label: 'Name', sort: (l) => l.name },
  { key: 'wonAt', label: 'Lead am', sort: (l) => l.wonAt || '' },
  { key: 'sourceType', label: 'Quelle', sort: (l) => l.sourceType },
  { key: 'campaign', label: 'Kampagne', sort: (l) => l.campaign },
  { key: 'adset', label: 'Anzeigengruppe', sort: (l) => l.adset },
  { key: 'creative', label: 'Creative', sort: (l) => l.creative },
  { key: 'placement', label: 'Placement', sort: (l) => l.placement },
  { key: 'ticket', label: 'VIP', sort: (l) => (l.hasTicket ? 1 : 0) },
  { key: 'quality', label: 'Qualität', sort: (l) => l.quality?.score ?? -1 },
];

function exportCsv(leads) {
  const head = ['Name', 'E-Mail', 'Telefon', 'Lead am', 'VIP am', 'Quelle', 'Kampagne', 'Anzeigengruppe', 'Creative', 'Placement', 'Quality-Score', 'Tier', 'Einkommen', 'Beschäftigung', 'Immobilien', 'Investiert', 'Beziehungsstand'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = leads.map((l) =>
    [l.name, l.email, l.phone, l.wonAt, l.ticketAt, l.sourceType, l.campaign, l.adset, l.creative, l.placement, l.quality?.score ?? '', l.quality?.tier ?? '', l.answers?.income, l.answers?.employment, l.answers?.realEstate, l.answers?.invested, l.answers?.relationship].map(esc).join(';')
  );
  const csv = [head.map(esc).join(';'), ...lines].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mmv-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeadsTable({ leads, tiers }) {
  const [sort, setSort] = useState({ col: 'wonAt', dir: 'desc' });
  const [open, setOpen] = useState(null);

  const sorted = useMemo(() => {
    const def = COLS.find((c) => c.key === sort.col) || COLS[1];
    const arr = [...leads].sort((a, b) => {
      const av = def.sort(a);
      const bv = def.sort(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv, 'de') : av - bv;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [leads, sort]);

  const onSort = (col) => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div>
      <div className="table-toolbar">
        <span>{leads.length} Leads</span>
        <button className="ghost-btn" onClick={() => exportCsv(sorted)}>⭳ CSV exportieren</button>
      </div>
      <div className="table-wrap">
        <table className="data-table leads">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={sort.col === c.key ? 'sorted' : ''} onClick={() => onSort(c.key)}>
                  {c.label}{sort.col === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((l, i) => (
              <React.Fragment key={l.email + i}>
                <tr className="clickable" onClick={() => setOpen(open === l.email + i ? null : l.email + i)}>
                  <td className="left">
                    <div className="lead-name">{l.name}</div>
                    <div className="lead-email">{l.email}</div>
                  </td>
                  <td className="nowrap">{fmtDate(l.wonAt)}</td>
                  <td><span className={`pill ${l.sourceType}`}>{l.sourceType === 'paid' ? 'Ads' : 'Organisch'}</span></td>
                  <td className="trunc" title={l.campaign}>{l.campaign}</td>
                  <td className="trunc" title={l.adset}>{l.adset}</td>
                  <td className="trunc" title={l.creative}>{l.creative}</td>
                  <td className="trunc" title={l.placement}>{l.placement}</td>
                  <td>{l.hasTicket ? <span className="pill vip">VIP</span> : <span className="muted">–</span>}</td>
                  <td><QualityBadge quality={l.quality} tiers={tiers} /></td>
                </tr>
                {open === l.email + i && l.answers && (
                  <tr className="detail-row">
                    <td colSpan={COLS.length}>
                      <div className="answers">
                        <Answer label="Beschäftigung" value={l.answers.employment} />
                        <Answer label="Monatliches Einkommen" value={l.answers.income} />
                        <Answer label="Immobilien im Besitz" value={l.answers.realEstate} />
                        <Answer label="Investiertes Kapital" value={l.answers.invested} />
                        <Answer label="Beziehungsstand" value={l.answers.relationship} />
                        <Answer label="Telefon" value={l.phone} />
                        <Answer label="Größte Herausforderung" value={l.answers.challenge} wide />
                        <Answer label="Erwartung an die 4 Abende" value={l.answers.expectation} wide />
                        {l.quality && (
                          <div className="answer wide">
                            <div className="answer-label">Quality-Breakdown</div>
                            <div className="breakdown">
                              {Object.entries(l.quality.breakdown).map(([k, v]) => (
                                <span key={k} className="bd-item">{k}: <strong>{v ?? '–'}</strong></span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {sorted.length === 0 && <tr><td colSpan={COLS.length} className="empty">Keine Leads für die aktuelle Auswahl.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Answer({ label, value, wide }) {
  return (
    <div className={`answer ${wide ? 'wide' : ''}`}>
      <div className="answer-label">{label}</div>
      <div className="answer-value">{value || <span className="muted">–</span>}</div>
    </div>
  );
}

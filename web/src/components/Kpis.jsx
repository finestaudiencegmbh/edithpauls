import React from 'react';
import { fmtEur, fmtInt, fmtPct, fmtScore } from '../lib.js';

function Card({ label, value, sub, accent }) {
  return (
    <div className="kpi-card">
      <span className="kpi-accent" style={accent ? { background: accent, color: accent } : undefined} />
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export default function Kpis({ kpis, dist, tiers }) {
  return (
    <div className="kpi-grid">
      <Card label="Adspend (zugeordnet)" value={fmtEur(kpis.spend)} sub={`${fmtInt(kpis.paid)} bezahlte Leads`} accent="#d0bb5a" />
      <Card label="Leads gesamt" value={fmtInt(kpis.total)} sub={`${fmtInt(kpis.organic)} organisch`} />
      <Card label="CPL" value={fmtEur(kpis.cpl)} sub="Kosten pro Lead" />
      <Card label="VIP-Tickets" value={fmtInt(kpis.tickets)} sub={`Rate ${fmtPct(kpis.ticketRate)}`} accent="#5ec8d8" />
      <Card label="Kosten / Ticket" value={fmtEur(kpis.cpt)} />
      <Card label="Ø Lead-Qualität" value={fmtScore(kpis.avgQuality)} sub="von 100" accent="#6fcf97" />
      <Card label="Qualifizierte Tickets" value={fmtInt(kpis.qualified)} sub={`Tier A/B · ${fmtPct(kpis.qualifiedRate)}`} accent="#d0bb5a" />
      <div className="kpi-card kpi-dist">
        <div className="kpi-label">Qualitäts-Verteilung (Tickets)</div>
        <div className="dist-bars">
          {tiers.map((t) => (
            <div key={t.key} className="dist-row">
              <span className="dist-key" style={{ color: t.color }}>{t.key}</span>
              <div className="dist-track">
                <div className="dist-fill" style={{ width: `${kpis.tickets ? (dist[t.key] / kpis.tickets) * 100 : 0}%`, background: t.color }} />
              </div>
              <span className="dist-count">{dist[t.key] || 0}</span>
            </div>
          ))}
          {dist.none > 0 && (
            <div className="dist-row">
              <span className="dist-key muted">–</span>
              <div className="dist-track"><div className="dist-fill" style={{ width: `${kpis.tickets ? (dist.none / kpis.tickets) * 100 : 0}%`, background: '#94a3b8' }} /></div>
              <span className="dist-count">{dist.none}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

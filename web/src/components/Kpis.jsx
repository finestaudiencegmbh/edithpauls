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

const GOLD = '#d0bb5a';
const CYAN = '#5ec8d8';
const GREEN = '#6fcf97';

export default function Kpis({ kpis, dist, tiers }) {
  return (
    <div className="kpi-sections">
      {/* Bezahlt (Facebook Ads) */}
      <section className="kpi-section">
        <div className="kpi-section-head"><span className="kpi-dot" style={{ background: GOLD }} />Bezahlt · Facebook Ads</div>
        <div className="kpi-grid">
          <Card label="Adspend" value={fmtEur(kpis.spend)} sub={kpis.nonLeadSpend > 0 ? `davon ${fmtEur(kpis.nonLeadSpend)} Traffic` : 'gesamt'} accent={GOLD} />
          <Card label="Bezahlte Leads" value={fmtInt(kpis.paid)} sub="über Ads" accent={GOLD} />
          <Card label="CPL" value={fmtEur(kpis.cpl)} sub={kpis.nonLeadSpend > 0 ? 'nur Lead-Kampagnen' : 'pro bezahltem Lead'} accent={GOLD} />
          <Card label="VIP-Tickets (Paid)" value={fmtInt(kpis.paidTickets)} sub={`Rate ${fmtPct(kpis.paidTicketRate)}`} accent={GOLD} />
          <Card label="Kosten / Ticket" value={fmtEur(kpis.cpt)} sub="pro bezahltem Ticket" accent={GOLD} />
        </div>
      </section>

      {/* Organisch */}
      <section className="kpi-section">
        <div className="kpi-section-head"><span className="kpi-dot" style={{ background: CYAN }} />Organisch</div>
        <div className="kpi-grid">
          <Card label="Organische Leads" value={fmtInt(kpis.organic)} sub="ohne Ad-Kosten" accent={CYAN} />
          <Card label="VIP-Tickets (Organisch)" value={fmtInt(kpis.organicTickets)} sub={`Rate ${fmtPct(kpis.organicTicketRate)}`} accent={CYAN} />
          <Card label="Leads gesamt" value={fmtInt(kpis.total)} sub={`${fmtInt(kpis.paid)} bezahlt · ${fmtInt(kpis.organic)} organisch`} accent={CYAN} />
        </div>
      </section>

      {/* Lead-Qualität (quellenübergreifend) */}
      <section className="kpi-section">
        <div className="kpi-section-head"><span className="kpi-dot" style={{ background: GREEN }} />Lead-Qualität</div>
        <div className="kpi-grid">
          <Card label="Qualifizierte Leads" value={fmtPct(kpis.qualifiedRate)} sub={`${fmtInt(kpis.qualified)} von ${fmtInt(kpis.tickets)} Tickets · Tier A/B`} accent={GREEN} />
          <Card label="Ø Lead-Qualität" value={fmtScore(kpis.avgQuality)} sub="von 100" accent={GREEN} />
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
      </section>
    </div>
  );
}

import React, { useState } from 'react';
import { fmtEur, fmtInt, fmtPct } from '../lib.js';

const fmtEur2 = (n) => (n == null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n));

/** Eine Kennzahlen-Zeile (für alle drei Ebenen identisch).
 *  Bei Nicht-Lead-Kampagnen (Traffic) werden lead-bezogene Kennzahlen
 *  ausgeblendet, weil sie dort keine sinnvolle Aussage haben. */
function MetricCells({ n, leadHidden }) {
  const dash = <span className="muted">–</span>;
  return (
    <>
      <td className="num">{fmtEur(n.spend)}</td>
      <td className="num">{fmtInt(n.impressions)}</td>
      <td className="num">{fmtEur2(n.cpm)}</td>
      <td className="num">{fmtInt(n.outboundClicks)}</td>
      <td className="num">{fmtPct(n.outboundCtr)}</td>
      <td className="num">{fmtEur2(n.cpoc)}</td>
      <td className="num">{leadHidden ? dash : fmtInt(n.leads)}</td>
      <td className="num">{leadHidden ? dash : fmtEur(n.cpl)}</td>
      <td className="num">{leadHidden ? dash : fmtInt(n.tickets)}</td>
      <td className="num">{leadHidden ? dash : fmtEur(n.cpt)}</td>
      <td className="num lp">{leadHidden ? dash : fmtPct(n.lpConversion)}</td>
    </>
  );
}

function StatusDot({ active }) {
  if (active == null) return null;
  return <span className={`status-dot ${active ? 'on' : 'off'}`} title={active ? 'Aktiv' : 'Pausiert'} />;
}

export default function AdHierarchy({ hierarchy }) {
  const [open, setOpen] = useState(() => new Set());
  const [onlyActive, setOnlyActive] = useState(true);

  const toggle = (id) => setOpen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const campaigns = (hierarchy || []).filter((c) => !onlyActive || c.active !== false);

  return (
    <div>
      <div className="table-toolbar">
        <label className="filter checkbox" style={{ paddingBottom: 0 }}>
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          <span>Nur aktive anzeigen</span>
        </label>
        <span className="muted">{campaigns.length} Kampagnen</span>
      </div>
      <div className="table-wrap">
        <table className="data-table hierarchy">
          <thead>
            <tr>
              <th className="left">Kampagne / Anzeigengruppe / Creative</th>
              <th className="num">Spend</th>
              <th className="num">Impr.</th>
              <th className="num">CPM</th>
              <th className="num" title="Individuell ausgehende Klicks">Ausg. Klicks</th>
              <th className="num" title="Individuell ausgehende CTR">Ausg. CTR</th>
              <th className="num" title="Individueller ausgehender Klickpreis">Ausg. CPC</th>
              <th className="num">Leads</th>
              <th className="num">CPL</th>
              <th className="num">Tickets</th>
              <th className="num">€/Ticket</th>
              <th className="num" title="Leads ÷ individuell ausgehende Klicks">LP-CVR</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const cOpen = open.has(c.id);
              const leadHidden = c.leadCampaign === false;
              const adsets = c.adsets.filter((a) => !onlyActive || a.active !== false);
              return (
                <React.Fragment key={c.id}>
                  <tr className="row-campaign clickable" onClick={() => toggle(c.id)}>
                    <td className="left">
                      <span className={`caret ${cOpen ? 'open' : ''}`}>▶</span>
                      <StatusDot active={c.active} />
                      <span className="hier-name lvl-campaign" title={c.name}>{c.name}</span>
                      {c.leadCampaign === false && <span className="traffic-tag" title={`Nicht-Lead-Kampagne${c.objective ? ` (${c.objective})` : ''} – zählt nicht in CPL/€-Ticket`}>Traffic</span>}
                    </td>
                    <MetricCells n={c} leadHidden={leadHidden} />
                  </tr>
                  {cOpen && adsets.map((a) => {
                    const aId = `${c.id}/${a.id}`;
                    const aOpen = open.has(aId);
                    const ads = a.ads || [];
                    return (
                      <React.Fragment key={aId}>
                        <tr className="row-adset clickable" onClick={() => toggle(aId)}>
                          <td className="left indent-1">
                            <span className={`caret ${aOpen ? 'open' : ''}`}>▶</span>
                            <StatusDot active={a.active} />
                            <span className="hier-name lvl-adset" title={a.name}>{a.name}</span>
                          </td>
                          <MetricCells n={a} leadHidden={leadHidden} />
                        </tr>
                        {aOpen && ads.map((ad) => (
                          <tr key={ad.id} className="row-ad">
                            <td className="left indent-2">
                              <span className="hier-name lvl-ad" title={ad.name}>{ad.name}</span>
                            </td>
                            <MetricCells n={ad} leadHidden={leadHidden} />
                          </tr>
                        ))}
                        {aOpen && ads.length === 0 && (
                          <tr className="row-ad"><td className="left indent-2 muted">keine Ads</td><td colSpan={11} /></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {campaigns.length === 0 && (
              <tr><td colSpan={12} className="empty">Keine {onlyActive ? 'aktiven ' : ''}Kampagnen gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

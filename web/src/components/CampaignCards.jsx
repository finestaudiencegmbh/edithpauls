import React, { useState } from 'react';
import { fmtEur, fmtInt, fmtPct } from '../lib.js';

const fmtEur2 = (n) => (n == null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n));
const fmtScore = (n) => (n == null ? '–' : String(Math.round(n)));

/** Kennzahlen in drei Sektionen – ohne horizontales Scrollen, alles umbruchfähig. */
function Metrics({ n, leadHidden }) {
  const lead = (v) => (leadHidden ? '–' : v);
  const groups = [
    {
      title: 'Ergebnis', cls: 'g-result',
      items: [
        ['Adspend', fmtEur(n.spend)],
        ['Leads', lead(fmtInt(n.leads))],
        ['Tickets', lead(fmtInt(n.tickets))],
        ['€/Lead', lead(fmtEur(n.cpl))],
        ['€/Ticket', lead(fmtEur(n.cpt))],
      ],
    },
    {
      title: 'Qualität & Funnel', cls: 'g-quality',
      items: [
        ['Quali-Rate', lead(fmtPct(n.qualifiedRate))],
        ['Ø Quali', lead(fmtScore(n.avgQuality))],
        ['CVR Start', lead(fmtPct(n.cvrStart))],
        ['CVR Ticket', lead(fmtPct(n.cvrTicket))],
      ],
    },
    {
      title: 'Facebook', cls: 'g-fb',
      items: [
        ['CPM', fmtEur2(n.cpm)],
        ['CTR ausg.', fmtPct(n.outboundCtr)],
        ['CPC ausg.', fmtEur2(n.cpoc)],
        ['Ausg. Klicks', fmtInt(n.outboundClicks)],
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

function StatusDot({ active }) {
  if (active == null) return null;
  return <span className={`status-dot ${active ? 'on' : 'off'}`} title={active ? 'Aktiv' : 'Pausiert'} />;
}

export default function CampaignCards({ hierarchy }) {
  const [open, setOpen] = useState(() => new Set());
  const [onlyActive, setOnlyActive] = useState(true);
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

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

      <div className="cc-list">
        {campaigns.map((c) => {
          const cOpen = open.has(c.id);
          const leadHidden = c.leadCampaign === false;
          const adsets = c.adsets.filter((a) => !onlyActive || a.active !== false);
          return (
            <div key={c.id} className={`cc-card ${leadHidden ? 'is-traffic' : ''}`}>
              <button className="cc-head" onClick={() => toggle(c.id)}>
                <span className={`caret ${cOpen ? 'open' : ''}`}>▶</span>
                <StatusDot active={c.active} />
                <span className="cc-name" title={c.name}>{c.name}</span>
                {leadHidden && <span className="traffic-tag">Traffic</span>}
                <span className="cc-head-spend">{fmtEur(c.spend)}</span>
              </button>
              <Metrics n={c} leadHidden={leadHidden} />

              {cOpen && (
                <div className="cc-children">
                  {adsets.map((a) => {
                    const aId = `${c.id}/${a.id}`;
                    const aOpen = open.has(aId);
                    const ads = a.ads || [];
                    return (
                      <div key={aId} className="cc-sub">
                        <button className="cc-subhead" onClick={() => toggle(aId)}>
                          <span className={`caret ${aOpen ? 'open' : ''}`}>▶</span>
                          <StatusDot active={a.active} />
                          <span className="cc-subname" title={a.name}>{a.name}</span>
                          <span className="cc-sub-meta">
                            <span className="cc-sm-item"><b>{fmtEur(a.spend)}</b> Adspend</span>
                            <span className="cc-sm-item"><b>{leadHidden ? '–' : fmtInt(a.leads)}</b> Leads</span>
                            <span className="cc-sm-item"><b>{leadHidden ? '–' : fmtEur(a.cpl)}</b> CPL</span>
                            <span className="cc-sm-item"><b>{leadHidden ? '–' : fmtPct(a.qualifiedRate)}</b> Quali</span>
                          </span>
                        </button>
                        {aOpen && (
                          <div className="cc-sub-body">
                            <Metrics n={a} leadHidden={leadHidden} />
                            {ads.length > 0 && (
                              <div className="cc-ads">
                                <div className="cc-ad cc-ad-headrow">
                                  <span className="cc-ad-name">Werbeanzeige</span>
                                  <span>Adspend</span>
                                  <span>Leads</span>
                                  <span>CPL</span>
                                  <span>Tickets</span>
                                  <span>Quali-Rate</span>
                                  <span>CVR Start</span>
                                  <span>CTR ausg.</span>
                                </div>
                                {ads.map((ad) => (
                                  <div key={ad.id} className="cc-ad">
                                    <span className="cc-ad-name" title={ad.name}>{ad.name}</span>
                                    <span>{fmtEur(ad.spend)}</span>
                                    <span>{leadHidden ? '–' : fmtInt(ad.leads)}</span>
                                    <span>{leadHidden ? '–' : fmtEur(ad.cpl)}</span>
                                    <span>{leadHidden ? '–' : fmtInt(ad.tickets)}</span>
                                    <span>{leadHidden ? '–' : fmtPct(ad.qualifiedRate)}</span>
                                    <span>{leadHidden ? '–' : fmtPct(ad.cvrStart)}</span>
                                    <span>{fmtPct(ad.outboundCtr)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {ads.length === 0 && <div className="muted" style={{ padding: '8px 2px' }}>keine Werbeanzeigen</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {campaigns.length === 0 && <div className="empty">Keine {onlyActive ? 'aktiven ' : ''}Kampagnen gefunden.</div>}
      </div>
    </div>
  );
}

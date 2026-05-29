import React, { useEffect, useMemo, useState } from 'react';
import { fetchData } from './api.js';
import { applyFilters, aggregate, computeKpis, tierDistribution, leadsByDay, DIMENSIONS, fmtDate } from './lib.js';
import Kpis from './components/Kpis.jsx';
import Filters from './components/Filters.jsx';
import BreakdownTable from './components/BreakdownTable.jsx';
import LeadsTable from './components/LeadsTable.jsx';
import TimeChart from './components/TimeChart.jsx';
import AdHierarchy from './components/AdHierarchy.jsx';
import DateRangePicker from './components/DateRangePicker.jsx';
import SourcesView from './components/SourcesView.jsx';
import { fmtEur, fmtInt } from './lib.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { key: 'leads', label: 'Leadliste', icon: 'M3 5h18M3 12h18M3 19h18' },
  { key: 'sources', label: 'Quellen', icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 0v10l7 3' },
];

const EMPTY_FILTERS = {
  search: '', sourceType: 'all', campaign: '', adset: '', creative: '', placement: '',
  income: '', realEstate: '', employment: '', from: '', to: '', onlyTickets: false, tiers: [],
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ from: '', to: '' });
  const [tab, setTab] = useState('campaign');
  const [view, setView] = useState('dashboard');

  const load = async (refresh = false, r = range) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchData({ refresh, from: r.from, to: r.to }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, []);

  const applyRange = (r) => {
    setRange(r);
    // Zeitraum steuert Server (FB) UND die clientseitige Lead-Filterung
    setFilters((f) => ({ ...f, from: r.from, to: r.to }));
    load(false, r);
  };

  const tiers = data?.scoring?.tiers || [];
  const fb = data?.fb || null;
  const hasFb = Boolean(fb?.byDim);
  const filtered = useMemo(() => (data ? applyFilters(data.leads, filters) : []), [data, filters]);
  const kpis = useMemo(() => (data ? computeKpis(filtered, data.overviewByAdset, fb) : null), [data, filtered, fb]);
  const dist = useMemo(() => (data ? tierDistribution(filtered, tiers) : {}), [data, filtered, tiers]);
  const leadDaily = useMemo(() => (data ? leadsByDay(filtered) : []), [data, filtered]);

  const rows = useMemo(
    () => (data ? aggregate(filtered, tab, data.overviewByAdset, fb) : []),
    [data, filtered, tab, fb]
  );

  const selectDim = (key) => setFilters((f) => ({ ...f, [tab]: f[tab] === key ? '' : key }));

  if (loading && !data) return <div className="loader">Lade Daten…</div>;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F&amp;M</div>
          <div className="brand-text">
            <div className="brand-title">MoneyMaker</div>
            <div className="brand-sub">Workshop · 15.–18.06.</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${view === n.key ? 'active' : ''}`} onClick={() => setView(n.key)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.icon} /></svg>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {data && <span className="updated">Stand: {fmtDate(data.fetchedAt)}</span>}
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{NAV.find((n) => n.key === view)?.label}</h1>
            <p className="subtitle">Lead- &amp; VIP-Ticket-Dashboard</p>
          </div>
          <div className="topbar-right">
            <DateRangePicker from={range.from} to={range.to} onApply={applyRange} />
            {data?.source === 'demo' && <span className="demo-badge" title="Es werden synthetische Beispieldaten angezeigt.">DEMO-Daten</span>}
            {hasFb && <span className="fb-badge" title={`Facebook-Daten via ${fb.provider === 'meta' ? 'Meta' : 'Supermetrics'} · ${fb.rows} Zeilen`}>FB live</span>}
            <button className="refresh-btn" onClick={() => load(true)} disabled={loading}>
              <svg className={`btn-icon ${loading ? 'spin' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
              {loading ? 'Lädt…' : 'Aktualisieren'}
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <strong>Fehler:</strong> {error}
            <div className="hint">Prüfe Service-Account, SPREADSHEET_ID und Sheet-Freigabe (siehe README).</div>
          </div>
        )}
        {fb?.configured && fb?.error && (
          <div className="error-banner warn">
            <strong>Facebook{fb.provider === 'meta' ? ' (Meta API)' : ' (Supermetrics)'}:</strong> {fb.error}
            <div className="hint">{fb.provider === 'meta'
              ? 'Das Dashboard funktioniert weiter. Prüfe META_ACCESS_TOKEN (ads_read, nicht abgelaufen) und META_AD_ACCOUNT_ID.'
              : 'Das Dashboard funktioniert weiter. Prüfe SUPERMETRICS_API_KEY und die Query.'}</div>
          </div>
        )}

        {data && (
          <>
            <Filters leads={data.leads} filters={filters} setFilters={setFilters} tiers={tiers} onReset={() => setFilters({ ...EMPTY_FILTERS, from: range.from, to: range.to })} />

            {view === 'dashboard' && (
              <>
                {/* Graphen oben */}
                <section className="panel">
                  <div className="panel-head"><div><h2>Verlauf</h2><span className="panel-sub">Ad-Spend (Facebook) &amp; Leads/Tickets (Sheet) pro Tag · Maus zum Anzeigen</span></div></div>
                  <div className="charts-grid">
                    <TimeChart title="Ad-Spend pro Tag" formatY={(v) => fmtEur(Math.round(v))}
                      series={[{ key: 'spend', label: 'Ad-Spend', color: '#d0bb5a', data: (hasFb && fb.daily ? fb.daily.spend : []).map((d) => ({ date: d.date, value: d.spend })) }]} />
                    <TimeChart title="Leads &amp; Tickets pro Tag" formatY={(v) => fmtInt(Math.round(v))}
                      series={[
                        { key: 'leads', label: 'Leads', color: '#5ec8d8', data: leadDaily.map((d) => ({ date: d.date, value: d.leads })) },
                        { key: 'tickets', label: 'VIP-Tickets', color: '#6fcf97', data: leadDaily.map((d) => ({ date: d.date, value: d.tickets })) },
                      ]} />
                  </div>
                </section>

                {/* KPI-Boxen darunter */}
                <Kpis kpis={kpis} dist={dist} tiers={tiers} />

                {(hasFb && fb.hierarchy) && (
                  <section className="panel">
                    <div className="panel-head"><div><h2>Kampagnen-Aufschlüsselung</h2><span className="panel-sub">Kampagne → Anzeigengruppe → Creative · Facebook-Kennzahlen + Lead-Attribution</span></div></div>
                    <AdHierarchy hierarchy={fb.hierarchy} />
                  </section>
                )}

                <section className="panel">
                  <div className="panel-head"><div><h2>Performance nach Ebene</h2><span className="panel-sub">Kampagnen, Anzeigengruppen, Creatives und Placements</span></div></div>
                  <div className="tabs-row">
                    <div className="tabs">
                      {DIMENSIONS.map((d) => (
                        <button key={d.key} className={`tab ${tab === d.key ? 'active' : ''}`} onClick={() => setTab(d.key)}>{d.label}</button>
                      ))}
                    </div>
                    <span className="tabs-hint">Zeile anklicken = danach filtern</span>
                  </div>
                  {!hasFb && (tab === 'creative' || tab === 'placement') && (
                    <div className="info-note">Adspend ist je Anzeigengruppe im Sheet hinterlegt – auf Creative-/Placement-Ebene über die Facebook-Anbindung.</div>
                  )}
                  <BreakdownTable rows={rows} dimLabel={DIMENSIONS.find((d) => d.key === tab).label} onSelect={selectDim} tiers={tiers} />
                </section>
              </>
            )}

            {view === 'leads' && (
              <section className="panel">
                <div className="panel-head"><div><h2>Alle Leads</h2><span className="panel-sub">Zeile anklicken für Details &amp; Fragebogen-Antworten</span></div></div>
                <LeadsTable leads={filtered} tiers={tiers} />
              </section>
            )}

            {view === 'sources' && <SourcesView leads={filtered} />}

            <footer className="footer">
              {data.counts.leads} Leads · {data.counts.paidLeads} bezahlt · {data.counts.tickets} VIP-Tickets · {data.counts.scored} bewertet
              {' · '}Quelle: {data.source === 'google' ? 'Google Sheet (live)' : 'Demo'}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

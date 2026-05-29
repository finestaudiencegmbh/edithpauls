import React, { useEffect, useMemo, useState } from 'react';
import { fetchData } from './api.js';
import { applyFilters, aggregate, computeKpis, tierDistribution, DIMENSIONS, fmtDate } from './lib.js';
import Kpis from './components/Kpis.jsx';
import Filters from './components/Filters.jsx';
import BreakdownTable from './components/BreakdownTable.jsx';
import LeadsTable from './components/LeadsTable.jsx';

const EMPTY_FILTERS = {
  search: '', sourceType: 'paid', campaign: '', adset: '', creative: '', placement: '',
  income: '', realEstate: '', employment: '', from: '', to: '', onlyTickets: false, tiers: [],
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tab, setTab] = useState('campaign');

  const load = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchData({ refresh }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, []);

  const tiers = data?.scoring?.tiers || [];
  const filtered = useMemo(() => (data ? applyFilters(data.leads, filters) : []), [data, filters]);
  const kpis = useMemo(() => (data ? computeKpis(filtered, data.overviewByAdset) : null), [data, filtered]);
  const dist = useMemo(() => (data ? tierDistribution(filtered, tiers) : {}), [data, filtered, tiers]);

  const spendAttributable = tab === 'campaign' || tab === 'adset';
  const rows = useMemo(
    () => (data ? aggregate(filtered, tab, data.overviewByAdset, spendAttributable) : []),
    [data, filtered, tab, spendAttributable]
  );

  const selectDim = (key) => setFilters((f) => ({ ...f, [tab]: f[tab] === key ? '' : key }));

  if (loading && !data) return (
    <div className="loader">
      <div className="loader-inner">
        <div className="loader-ring" />
        <span>Lade Daten…</span>
      </div>
    </div>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Fuat &amp; Marta · MoneyMaker-Workshop</h1>
          <p className="subtitle">Lead- &amp; VIP-Ticket-Dashboard · 15.–18.06.</p>
        </div>
        <div className="topbar-right">
          {data?.source === 'demo' && <span className="demo-badge" title="Es werden synthetische Beispieldaten angezeigt. Google-Anbindung in der .env konfigurieren.">DEMO-Daten</span>}
          {data && <span className="updated">Stand: {fmtDate(data.fetchedAt)}</span>}
          <button className="refresh-btn" onClick={() => load(true)} disabled={loading}>
            <svg className={`btn-icon ${loading ? 'spin' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {loading ? 'Lädt…' : 'Aktualisieren'}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <strong>Fehler:</strong> {error}
          <div className="hint">Prüfe Service-Account, SPREADSHEET_ID und ob das Sheet für die Service-Account-E-Mail freigegeben ist (siehe README).</div>
        </div>
      )}

      {data && (
        <>
          <Filters leads={data.leads} filters={filters} setFilters={setFilters} tiers={tiers} onReset={() => setFilters(EMPTY_FILTERS)} />
          <Kpis kpis={kpis} dist={dist} tiers={tiers} />

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Performance nach Ebene</h2>
                <span className="panel-sub">Vergleiche Kampagnen, Anzeigengruppen, Creatives und Placements</span>
              </div>
            </div>
            <div className="tabs-row">
              <div className="tabs">
                {DIMENSIONS.map((d) => (
                  <button key={d.key} className={`tab ${tab === d.key ? 'active' : ''}`} onClick={() => setTab(d.key)}>{d.label}</button>
                ))}
              </div>
              <span className="tabs-hint">Zeile anklicken = danach filtern</span>
            </div>
            {!spendAttributable && (
              <div className="info-note">Adspend ist je Anzeigengruppe im Sheet hinterlegt – auf Creative-/Placement-Ebene kommt er mit der Facebook-Anbindung (Phase 2).</div>
            )}
            <BreakdownTable rows={rows} dimLabel={DIMENSIONS.find((d) => d.key === tab).label} spendAttributable={spendAttributable} onSelect={selectDim} tiers={tiers} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Alle Leads</h2>
                <span className="panel-sub">Zeile anklicken für Details &amp; Fragebogen-Antworten</span>
              </div>
            </div>
            <LeadsTable leads={filtered} tiers={tiers} />
          </section>

          <footer className="footer">
            {data.counts.leads} Leads · {data.counts.paidLeads} bezahlt · {data.counts.tickets} VIP-Tickets · {data.counts.scored} bewertet
            {' · '}Quelle: {data.source === 'google' ? 'Google Sheet (live)' : 'Demo'}
          </footer>
        </>
      )}
    </div>
  );
}

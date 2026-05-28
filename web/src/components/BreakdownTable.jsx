import React, { useState, useMemo } from 'react';
import { fmtEur, fmtInt, fmtPct, fmtScore } from '../lib.js';

export default function BreakdownTable({ rows, dimLabel, spendAttributable, onSelect, tiers }) {
  const [sort, setSort] = useState({ col: 'leads', dir: 'desc' });

  const cols = useMemo(() => {
    const base = [
      { key: 'key', label: dimLabel, align: 'left', fmt: (v) => v },
      { key: 'leads', label: 'Leads', fmt: fmtInt },
      { key: 'tickets', label: 'Tickets', fmt: fmtInt },
      { key: 'ticketRate', label: 'Ticket-Rate', fmt: fmtPct },
      { key: 'avgQuality', label: 'Ø Quali', fmt: fmtScore },
      { key: 'qualified', label: 'Quali A/B', fmt: fmtInt },
      { key: 'qualifiedRate', label: 'Quali-Rate', fmt: fmtPct },
    ];
    if (spendAttributable) {
      base.push(
        { key: 'spend', label: 'Adspend', fmt: fmtEur },
        { key: 'cpl', label: 'CPL', fmt: fmtEur },
        { key: 'cpt', label: '€/Ticket', fmt: fmtEur }
      );
    }
    return base;
  }, [dimLabel, spendAttributable]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const { col, dir } = sort;
    arr.sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv, 'de') : av - bv;
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort]);

  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));

  const onSort = (col) => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`${c.align === 'left' ? 'left' : 'num'} ${sort.col === c.key ? 'sorted' : ''}`} onClick={() => onSort(c.key)}>
                {c.label}
                {sort.col === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className="clickable" onClick={() => onSelect?.(r.key)} title="Klicken, um danach zu filtern">
              {cols.map((c) => (
                <td key={c.key} className={c.align === 'left' ? 'left' : 'num'}>
                  {c.key === 'key' ? (
                    <div className="cell-name">
                      <span className="bar" style={{ width: `${(r.leads / maxLeads) * 100}%` }} />
                      <span className="cell-name-text" title={r.key}>{r.key}</span>
                    </div>
                  ) : (
                    c.fmt(r[c.key])
                  )}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={cols.length} className="empty">Keine Daten für die aktuelle Auswahl.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

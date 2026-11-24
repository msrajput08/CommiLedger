import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  Search,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Save,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  CalendarDays,
} from 'lucide-react';
import { useWorkspace, latestStatus } from '../lib/workspace';
import { D, money, currencyDigits } from '../core/money';
import { labels, type ResultRow, type ReviewStatus, type Run } from '../core/types';
import { download, resultCsv } from '../core/export';
import { sourceBuckets } from '../core/analytics';
import { Empty, Modal } from '../components/ui';
const statuses: ReviewStatus[] = [
  'Needs review',
  'Investigating',
  'Resolved',
  'Accepted adjustment',
  'Awaiting carrier response',
];
export function NoRun() {
  return (
    <Empty
      title="Your numbers, in focus."
      action={
        <Link className="btn primary" to="/app/import">
          Start a reconciliation
        </Link>
      }
    >
      Import your expected commissions and carrier payments, or explore the sample workspace from
      the sidebar.
    </Empty>
  );
}
export function ResultDetail({ row, onClose }: { row: ResultRow; onClose: () => void }) {
  const { review, run } = useWorkspace();
  const [status, setStatus] = useState<ReviewStatus>(latestStatus(row)),
    [note, setNote] = useState(''),
    [error, setError] = useState('');
  const current = run?.rows.find((r) => r.id === row.id) || row;
  const safeMoney = (v: string) => {
    try {
      return money(v, row.currency);
    } catch {
      return v;
    }
  };
  return (
    <Modal title={`${row.policy} · Investigation`} onClose={onClose} wide>
      <div className="detail-body">
        <span className={`status ${row.outcome}`}>{labels[row.outcome]}</span>
        <p className="detail-carrier">
          {row.carrier} · {row.period || 'No period'}
        </p>
        <div className="detail-numbers">
          <div>
            <span>Expected</span>
            <strong>{safeMoney(row.expected)}</strong>
          </div>
          <div>
            <span>Received</span>
            <strong>{safeMoney(row.received)}</strong>
          </div>
          <div>
            <span>Difference</span>
            <strong>{safeMoney(row.variance)}</strong>
          </div>
        </div>
        <div className="notice">
          <strong>Why this was flagged</strong>
          <p>{row.evidence}</p>
        </div>
        <h3>Original source evidence</h3>
        {row.sources.map((source) => (
          <details key={source.id}>
            <summary>
              <FileCheck2 size={16} />
              {source.side} · {source.source.file} · {source.source.sheet}, row {source.source.row}
            </summary>
            <div className="source-data">
              {Object.entries(source.source.raw).map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <code>{value || '(empty)'}</code>
                </div>
              ))}
            </div>
            {source.errors.length > 0 && <p className="error-text">{source.errors.join('; ')}</p>}
            <p className="hash">SHA-256: {source.source.hash}</p>
          </details>
        ))}
        <h3>Review decision</h3>
        <p className="subtle">
          Notes do not change amounts or matching. Correct source files and rerun for financial
          corrections.
        </p>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Evidence or explanation
          <textarea
            maxLength={2000}
            rows={3}
            placeholder="Record what you checked and the next action…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button
          className="btn primary"
          onClick={() => {
            try {
              review([row.id], status, note);
              setNote('');
              setError('');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Record decision
        </button>
        {current.review.length > 0 && (
          <>
            <h3>Decision history</h3>
            <ol className="audit-list">
              {current.review.map((r, i) => (
                <li key={i}>
                  <strong>{r.status}</strong>
                  <span>
                    {new Date(r.at).toLocaleString(run?.config.locale, {
                      timeZone: run?.config.timeZone,
                    })}{' '}
                    · {r.actor}
                  </span>
                  <p>{r.note}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Modal>
  );
}
export function Findings({
  issuesOnly = false,
  compact = false,
}: {
  issuesOnly?: boolean;
  compact?: boolean;
}) {
  const { run, review, notify } = useWorkspace();
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [carrier, setCarrier] = useState('all'),
    [currency, setCurrency] = useState('all'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [sort, setSort] = useState('source'),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<ResultRow | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [bulk, setBulk] = useState(false),
    [bulkStatus, setBulkStatus] = useState<ReviewStatus>('Investigating'),
    [bulkNote, setBulkNote] = useState('');
  const filtered = useMemo(() => {
    let rows = (run?.rows || []).filter(
      (r) =>
        (!issuesOnly || r.outcome !== 'matched') &&
        (filter === 'all' || r.outcome === filter) &&
        (carrier === 'all' || r.carrier === carrier) &&
        (currency === 'all' || r.currency === currency) &&
        (!from || r.sources.some((s) => s.date >= from)) &&
        (!to || r.sources.some((s) => !!s.date && s.date <= to)) &&
        `${r.policy} ${r.carrier} ${r.period} ${r.sources.map((s) => s.agent + ' ' + s.transaction).join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    if (sort === 'variance')
      rows = [...rows].sort((a, b) => D(b.variance).abs().comparedTo(D(a.variance).abs()));
    if (sort === 'policy') rows = [...rows].sort((a, b) => a.policy.localeCompare(b.policy));
    return rows;
  }, [run, filter, carrier, currency, from, to, search, issuesOnly, sort]);
  if (!run) return <NoRun />;
  const size = compact ? 6 : 15,
    pages = Math.max(1, Math.ceil(filtered.length / size)),
    currentPage = Math.min(page, pages - 1),
    visible = filtered.slice(currentPage * size, (currentPage + 1) * size);
  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };
  return (
    <section className="panel findings-panel">
      <div className="panel-heading">
        <div>
          <h2>{issuesOnly ? 'Investigation queue' : 'Reconciliation ledger'}</h2>
          <p>
            {filtered.length} findings · {run.inputCount} source rows retained
          </p>
        </div>
        {compact ? (
          <Link className="text-link" to="/app/results">
            View full ledger
          </Link>
        ) : (
          <button
            className="btn secondary small"
            onClick={() =>
              download(
                resultCsv({ ...run, rows: filtered }),
                `commiledger-${run.sample ? 'sample-' : ''}findings.csv`,
              )
            }
          >
            <Download size={15} /> Export view
          </button>
        )}
      </div>
      {!compact && (
        <>
          <div className="table-toolbar">
            <label className="search-input">
              <Search size={17} />
              <input
                aria-label="Search policies or carriers"
                placeholder="Search policy, carrier, agent…"
                value={search}
                onChange={(e) => reset(() => setSearch(e.target.value))}
              />
            </label>
            <select
              aria-label="Filter finding"
              value={filter}
              onChange={(e) => reset(() => setFilter(e.target.value))}
            >
              <option value="all">All findings</option>
              {Object.entries(labels).map(([v, s]) => (
                <option value={v} key={v}>
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter carrier"
              value={carrier}
              onChange={(e) => reset(() => setCarrier(e.target.value))}
            >
              <option value="all">All carriers</option>
              {Array.from(new Set(run.rows.map((r) => r.carrier))).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Filter currency"
              value={currency}
              onChange={(e) => reset(() => setCurrency(e.target.value))}
            >
              <option value="all">All currencies</option>
              {Object.keys(run.totals).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select aria-label="Sort ledger" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="source">Source order</option>
              <option value="policy">Policy A–Z</option>
              <option value="variance">Largest difference</option>
            </select>
          </div>
          <div className="date-filters">
            <label>
              Transaction from{' '}
              <input
                type="date"
                value={from}
                onChange={(e) => reset(() => setFrom(e.target.value))}
              />
            </label>
            <label>
              through{' '}
              <input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} />
            </label>
            <span>{selected.length} selected</span>
            <button className="text-btn" disabled={!selected.length} onClick={() => setBulk(true)}>
              Record bulk decision
            </button>
          </div>
        </>
      )}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable data table">
        <table className="ledger-table">
          <thead>
            <tr>
              {!compact && (
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select visible findings"
                    checked={visible.length > 0 && visible.every((r) => selected.includes(r.id))}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? Array.from(new Set([...selected, ...visible.map((r) => r.id)]))
                          : selected.filter((id) => !visible.some((r) => r.id === id)),
                      )
                    }
                  />
                </th>
              )}
              <th>Policy / carrier</th>
              <th>Period</th>
              <th className="numeric">Expected</th>
              <th className="numeric">Received</th>
              <th className="numeric">Difference</th>
              <th>Finding</th>
              <th>{compact ? 'Actions' : 'Review'}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                {!compact && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.policy}`}
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked ? [...s, r.id] : s.filter((id) => id !== r.id),
                        )
                      }
                    />
                  </td>
                )}
                <td>
                  <button className="policy-link" onClick={() => setDetail(r)}>
                    {r.policy}
                  </button>
                  <small>{r.carrier}</small>
                </td>
                <td>{r.period || '—'}</td>
                {[r.expected, r.received, r.variance].map((v, i) => (
                  <td className={`numeric ${i === 2 && D(v).lt(0) ? 'negative' : ''}`} key={i}>
                    {(() => {
                      try {
                        return money(v, r.currency);
                      } catch {
                        return v;
                      }
                    })()}
                  </td>
                ))}
                <td>
                  <span className={`status ${r.outcome}`}>{labels[r.outcome]}</span>
                </td>
                <td>
                  {!compact && <small>{latestStatus(r)}</small>}
                  <button
                    className="icon-btn"
                    aria-label={`Investigate ${r.policy}`}
                    onClick={() => setDetail(r)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty small">
            <h3>No findings match these filters.</h3>
            <p>Try another policy or a broader date range.</p>
          </div>
        )}
      </div>
      {!compact && (
        <div className="table-footer">
          <span>
            Page {currentPage + 1} of {pages}
          </span>
          <div>
            <button
              className="icon-btn"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label="Next page"
              disabled={currentPage >= pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
      {detail && <ResultDetail row={detail} onClose={() => setDetail(null)} />}
      {bulk && (
        <Modal title="Record a bulk decision" onClose={() => setBulk(false)}>
          <div className="detail-body">
            <p>
              This adds the same decision to {selected.length} findings. Amounts remain unchanged.
            </p>
            <label>
              Review status
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as ReviewStatus)}
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Evidence
              <textarea
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </label>
            <button
              className="btn primary"
              onClick={() => {
                try {
                  review(selected, bulkStatus, bulkNote);
                  setBulk(false);
                  setSelected([]);
                  setBulkNote('');
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Record for selected findings
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
export function RunActions() {
  const { run, save } = useWorkspace();
  return (
    <div className="heading-actions">
      <button className="btn secondary" disabled={!run} onClick={save}>
        <Save size={16} /> Save on device
      </button>
      <Link className="btn primary" to="/app/import">
        New reconciliation
      </Link>
    </div>
  );
}
export function ResultsPage({ issues = false }: { issues?: boolean }) {
  const { run } = useWorkspace();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{issues ? 'FOLLOW THE EVIDENCE' : 'EVERY ROW ACCOUNTED FOR'}</p>
          <h1>{issues ? 'Investigations' : 'Reconciliation results'}</h1>
          <p>
            {run
              ? `${run.name} · ${run.invalidCount} invalid rows reported`
              : 'Start by importing a ledger and payment statement.'}
          </p>
        </div>
        <RunActions />
      </div>
      <Findings issuesOnly={issues} />
    </>
  );
}
export function CurrencyPicker({
  value,
  onChange,
  run,
}: {
  value: string;
  onChange: (s: string) => void;
  run: Run;
}) {
  return (
    <label className="currency-picker">
      Reporting currency
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.keys(run.totals).map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}
export function TrendChart({ run, currency }: { run: Run; currency: string }) {
  const [focused, setFocused] = useState('');
  const months = sourceBuckets(run, currency, 'period');
  const entries = Array.from(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);
  let max = D(1);
  for (const [, m] of entries)
    max = [max, D(m.expected).abs(), D(m.received).abs()].reduce((a, b) => (a.gt(b) ? a : b));
  return (
    <div className="trend-chart">
      <div className="chart-legend">
        <span>
          <i className="legend-expected" />
          Expected
        </span>
        <span>
          <i className="legend-received" />
          Received
        </span>
        <small>{currency} · imported signed amounts</small>
      </div>
      <div className="bars-chart">
        {entries.map(([month, m]) => (
          <button
            className={`chart-column ${focused === month ? 'focused' : ''}`}
            key={month}
            aria-label={`${month}: expected ${money(m.expected, currency)}, received ${money(m.received, currency)}`}
            onClick={() => setFocused(month)}
          >
            <span className="bar-pair">
              <i
                className="bar expected"
                style={{ height: `${D(m.expected).abs().div(max).mul(100).toNumber()}%` }}
              />
              <i
                className={`bar received ${D(m.received).lt(0) ? 'negative-bar' : ''}`}
                style={{ height: `${D(m.received).abs().div(max).mul(100).toNumber()}%` }}
              />
            </span>
            <span className="bar-label">
              {month === 'No period'
                ? month
                : new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en', {
                    month: 'short',
                    year: '2-digit',
                  })}
            </span>
          </button>
        ))}
      </div>
      <div className="chart-tooltip" aria-live="polite">
        {focused && months.has(focused)
          ? `${focused} · Expected ${money(months.get(focused)!.expected, currency)} · Received ${money(months.get(focused)!.received, currency)}`
          : 'Select a month to inspect its exact amounts. Bar heights show absolute magnitude; negative payments remain signed.'}
      </div>
    </div>
  );
}
export function Overview({ analytics = false }: { analytics?: boolean }) {
  const { run } = useWorkspace();
  const [choice, setChoice] = useState('');
  if (!run) return <NoRun />;
  const currency = run.totals[choice] ? choice : Object.keys(run.totals)[0];
  if (!currency)
    return (
      <>
        <div className="notice error">
          No valid financial amounts. Review invalid rows and correct the import.
        </div>
        <Findings />
      </>
    );
  const t = run.totals[currency],
    rows = run.rows.filter((r) => r.currency === currency),
    matched = rows.filter((r) => r.outcome === 'matched').length,
    reviewed = rows.filter(
      (r) =>
        r.outcome === 'matched' || ['Resolved', 'Accepted adjustment'].includes(latestStatus(r)),
    ).length;
  const carrierTotals = Array.from(sourceBuckets(run, currency, 'carrier')).map(
    ([carrier, amounts]) => ({
      carrier,
      expected: amounts.expected,
      received: amounts.received,
      count: rows.filter(
        (r) => r.outcome !== 'matched' && r.sources.some((s) => s.carrier === carrier),
      ).length,
    }),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {analytics ? 'THE BIGGER PICTURE' : 'A CLEAR VIEW OF YOUR COMMISSIONS'}
          </p>
          <h1>{analytics ? 'Commission analytics' : 'Your commission overview.'}</h1>
          <p>
            {run.name} <span className="heading-dot">·</span> As of {run.config.asOf}
          </p>
        </div>
        <RunActions />
      </div>
      <div className="overview-controls">
        <span>
          <CalendarDays size={16} />
          {Array.from(new Set(rows.map((r) => r.period)))
            .filter(Boolean)
            .sort()
            .at(0) || 'All periods'}{' '}
          —{' '}
          {Array.from(new Set(rows.map((r) => r.period)))
            .filter(Boolean)
            .sort()
            .at(-1) || 'All periods'}
        </span>
        <CurrencyPicker value={currency} onChange={setChoice} run={run} />
      </div>
      <div className="metric-grid">
        {[
          {
            label: 'Expected commissions',
            value: t.expected,
            sub: 'From your expected ledger',
            accent: '',
          },
          {
            label: 'Received commissions',
            value: t.received,
            sub: 'Includes flagged duplicate candidates',
            accent: '',
          },
          {
            label: 'Potential outstanding',
            value: t.potentialOutstanding,
            sub: 'Due missing entries + underpayments',
            accent: 'amber',
          },
          {
            label: 'Underpayments',
            value: t.underpayment,
            sub: 'Differences on unambiguous matches',
            accent: 'red',
          },
        ].map((m) => (
          <article className={`metric ${m.accent}`} key={m.label}>
            <span>{m.label}</span>
            <strong>{money(m.value, currency)}</strong>
            <small>{m.sub}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-charts">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Expected meets received</h2>
              <p>A view across the periods in this import</p>
            </div>
            <span className="pill">{currency}</span>
          </div>
          <TrendChart run={run} currency={currency} />
        </section>
        <section className="panel progress-panel">
          <div className="panel-heading">
            <div>
              <h2>Reconciliation progress</h2>
              <p>Matches and recorded review decisions</p>
            </div>
          </div>
          <div
            className="progress-ring"
            style={
              {
                '--progress': `${rows.length ? (reviewed / rows.length) * 100 : 0}%`,
              } as React.CSSProperties
            }
          >
            <div>
              <strong>
                {rows.length ? Math.round((reviewed / rows.length) * 100) : 0}
                <small>%</small>
              </strong>
              <span>review complete</span>
            </div>
          </div>
          <div className="progress-breakdown">
            <span>
              <i className="legend-received" />
              Matched <b>{matched}</b>
            </span>
            <span>
              <i className="legend-amber" />
              Needs a closer look <b>{rows.length - reviewed}</b>
            </span>
            <span>
              <i className="legend-expected" />
              Reviewed adjustments <b>{reviewed - matched}</b>
            </span>
          </div>
        </section>
      </div>
      {analytics ? (
        <>
          <div className="dashboard-charts equal">
            <section className="panel">
              <div className="panel-heading">
                <h2>Finding distribution</h2>
              </div>
              <div className="distribution">
                {Object.entries(labels).map(([key, label]) => {
                  const count = rows.filter((r) => r.outcome === key).length;
                  return count ? (
                    <div key={key}>
                      <span className={`status ${key}`}>{label}</span>
                      <div>
                        <i style={{ width: `${(count / rows.length) * 100}%` }} />
                      </div>
                      <b>{count}</b>
                    </div>
                  ) : null;
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Cash and allocation check</h2>
              </div>
              <dl className="totals-list">
                {[
                  ['Imported payments', t.received],
                  ['Duplicate candidate amount', t.duplicateAmount],
                  ['Eligible payments', t.eligibleReceived],
                  ['Unmatched payments', t.unmatched],
                  ['Confirmed signed variance', t.confirmedVariance],
                  ['Total received − expected', t.variance],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{money(value, currency)}</dd>
                  </div>
                ))}
              </dl>
              <p className="panel-footnote">
                Eligible payments + duplicate candidate amount = imported payments. Invalid rows are
                excluded and separately reported.
              </p>
            </section>
          </div>
        </>
      ) : (
        <Findings compact />
      )}
      <section className="panel carrier-table">
        <div className="panel-heading">
          <div>
            <h2>By carrier</h2>
            <p>Compare amounts in {currency}; other currencies are kept separate.</p>
          </div>
          <Link to="/app/investigations" className="text-link">
            Open investigations
          </Link>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable data table">
          <table>
            <thead>
              <tr>
                <th>Carrier</th>
                <th className="numeric">Expected</th>
                <th className="numeric">Received</th>
                <th className="numeric">Difference</th>
                <th>Flagged findings</th>
              </tr>
            </thead>
            <tbody>
              {carrierTotals.map((c, i) => (
                <tr key={c.carrier}>
                  <td>
                    <span className={`carrier-monogram color-${i % 4}`}>{c.carrier[0]}</span>
                    <strong>{c.carrier}</strong>
                  </td>
                  <td className="numeric">{money(c.expected, currency)}</td>
                  <td className="numeric">{money(c.received, currency)}</td>
                  <td className="numeric">
                    {money(D(c.received).minus(c.expected).toString(), currency)}
                  </td>
                  <td>
                    {c.count ? (
                      <span className="status ambiguous">{c.count} to inspect</span>
                    ) : (
                      <span className="status matched">All matched</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

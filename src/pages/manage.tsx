import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Copy,
  Archive,
  Download,
  Trash2,
  CloudUpload,
  Save,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { storage } from '../lib/storage';
import { api } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { defaultRule, defaultConfig, type Profile, type Run, type Field } from '../core/types';
import { validateConfig } from '../core/engine';
import { validateRule, money, D } from '../core/money';
import { download, resultCsv } from '../core/export';
import { Modal, Empty } from '../components/ui';
import { NoRun } from './results';
export function Profiles() {
  const { config, files, notify, account } = useWorkspace();
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [edit, setEdit] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [cloudVersions, setCloudVersions] = useState<Record<string, number>>({});
  const reload = () =>
    storage
      .profiles()
      .then(setProfiles)
      .catch(() => notify('Local profile storage is unavailable.'));
  useEffect(() => {
    void reload();
  }, []);
  const save = async () => {
    try {
      if (!edit?.name.trim()) throw new Error('Add a carrier name');
      validateConfig(edit.config);
      validateRule(edit.rule);
      const profile = {
        ...edit,
        name: edit.name.trim(),
        version: edit.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await storage.saveProfile(profile);
      await reload();
      setEdit(null);
      notify('Versioned profile saved on this device.');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const cloud = async (p: Profile) => {
    try {
      const r = await api(
        `/account/profiles/${p.id}`,
        { data: p, expectedVersion: cloudVersions[p.id] || 0 },
        'PUT',
      );
      setCloudVersions((v) => ({ ...v, [p.id]: r.version }));
      notify('Carrier configuration saved to your account. No transaction rows were uploaded.');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const loadCloud = async () => {
    try {
      const remote =
        await api<{ id: string; data: string; version: number }[]>('/account/profiles');
      for (const r of remote) {
        const p = JSON.parse(r.data) as Profile;
        const local = profiles.find((x) => x.id === r.id);
        if (local && local.updatedAt > p.updatedAt) continue;
        await storage.saveProfile({ ...p, id: r.id });
      }
      setCloudVersions(Object.fromEntries(remote.map((r) => [r.id, r.version])));
      await reload();
      notify('Cloud profiles loaded; newer local edits were preserved.');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const newProfile = () => {
    const mappingHeaders: Profile['mappingHeaders'] = {};
    for (const f of files) {
      const headers = f.sheets[f.sheet].rows[f.header];
      mappingHeaders[f.side] = Object.fromEntries(
        Object.entries(f.mapping).map(([key, index]) => [key, headers[index!]]),
      );
    }
    setError('');
    setEdit({
      id: crypto.randomUUID(),
      name: '',
      country: '',
      currency: config.currency,
      config: structuredClone(config),
      rule: defaultRule(),
      mappingHeaders,
      version: 0,
      archived: false,
      updatedAt: '',
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUILD A REPEATABLE WORKFLOW</p>
          <h1>Carriers & rules</h1>
          <p>Save a configuration once. Reuse it for the next statement.</p>
        </div>
        <div className="heading-actions">
          {account && (
            <button className="btn secondary" onClick={loadCloud}>
              Load cloud profiles
            </button>
          )}
          <button className="btn primary" onClick={newProfile}>
            <Plus size={16} /> New carrier profile
          </button>
        </div>
      </div>
      <div className="notice">
        Profiles are saved on this device. Cloud sync is an explicit Plus/Pro action. Do not put
        customer policy data in profile names or mappings.
      </div>
      {!profiles.length ? (
        <Empty
          title="A smoother next month."
          action={
            <button className="btn primary" onClick={newProfile}>
              Create your first profile
            </button>
          }
        >
          Capture carrier settings and the current import mappings in a reusable profile.
        </Empty>
      ) : (
        <div className="profile-grid">
          {profiles.map((p) => (
            <article className={`panel profile-card ${p.archived ? 'archived' : ''}`} key={p.id}>
              <div className="profile-top">
                <span className="carrier-monogram">{p.name[0]}</span>
                <span className="pill">{p.archived ? 'Archived' : `Version ${p.version}`}</span>
              </div>
              <h2>{p.name}</h2>
              <p>
                {p.country || 'Country not specified'} · {p.config.currency}
              </p>
              <div className="profile-rule">
                <span>Commission structure</span>
                <strong>
                  {p.rule.kind === 'percentage'
                    ? `${p.rule.rate}% of premium`
                    : p.rule.kind === 'fixed'
                      ? `${p.rule.fixed} fixed`
                      : `${p.rule.tiers.length} progressive tiers`}{' '}
                  · {p.rule.split}% split
                </strong>
                <span>Match on {p.config.keys.join(' + ')} + currency</span>
              </div>
              <div className="profile-actions">
                <button
                  className="btn secondary small"
                  onClick={() => {
                    setError('');
                    setEdit(structuredClone(p));
                  }}
                >
                  Edit profile
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Duplicate ${p.name}`}
                  onClick={() => {
                    setError('');
                    setEdit({
                      ...structuredClone(p),
                      id: crypto.randomUUID(),
                      name: `${p.name} copy`,
                      version: 0,
                    });
                  }}
                >
                  <Copy size={17} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`${p.archived ? 'Restore' : 'Archive'} ${p.name}`}
                  onClick={async () => {
                    try {
                      await storage.saveProfile({
                        ...p,
                        archived: !p.archived,
                        version: p.version + 1,
                        updatedAt: new Date().toISOString(),
                      });
                      await reload();
                    } catch {
                      notify('Profile could not be updated.');
                    }
                  }}
                >
                  <Archive size={17} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Sync ${p.name} configuration to cloud`}
                  disabled={!account?.cloudProfiles}
                  title={
                    account?.cloudProfiles
                      ? 'Explicitly upload this configuration'
                      : 'Requires an active Plus or Pro account'
                  }
                  onClick={() => cloud(p)}
                >
                  <CloudUpload size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <Modal
          title={edit.version ? 'Edit carrier profile' : 'New carrier profile'}
          onClose={() => setEdit(null)}
          wide
        >
          <div className="detail-body">
            <div className="form-grid">
              <label>
                Carrier name
                <input
                  value={edit.name}
                  maxLength={100}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <label>
                Country / market
                <input
                  value={edit.country}
                  maxLength={80}
                  placeholder="United Kingdom, India, Canada…"
                  onChange={(e) => setEdit({ ...edit, country: e.target.value })}
                />
              </label>
              <label>
                Currency
                <select
                  value={edit.config.currency}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      currency: e.target.value,
                      config: { ...edit.config, currency: e.target.value },
                    })
                  }
                >
                  {Intl.supportedValuesOf('currency').map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Commission structure
                <select
                  value={edit.rule.kind}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      rule: { ...edit.rule, kind: e.target.value as Profile['rule']['kind'] },
                    })
                  }
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                  <option value="tiered">Progressive tiers</option>
                </select>
              </label>
              {(['rate', 'fixed', 'split', 'fee', 'taxRate', 'adjustment'] as const).map((key) => (
                <label key={key}>
                  {
                    {
                      rate: 'Rate (%)',
                      fixed: 'Fixed amount',
                      split: 'Split (%)',
                      fee: 'Fee deducted',
                      taxRate: 'Tax added (%)',
                      adjustment: 'Adjustment',
                    }[key]
                  }
                  <input
                    value={edit.rule[key]}
                    inputMode="decimal"
                    onChange={(e) =>
                      setEdit({ ...edit, rule: { ...edit.rule, [key]: e.target.value } })
                    }
                  />
                </label>
              ))}
              <label>
                Rounding
                <select
                  value={edit.rule.rounding}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      rule: {
                        ...edit.rule,
                        rounding: e.target.value as Profile['rule']['rounding'],
                      },
                    })
                  }
                >
                  <option value="half-up">Half up</option>
                  <option value="half-even">Half even (banker’s)</option>
                  <option value="down">Toward zero</option>
                </select>
              </label>
              <label>
                Matching tolerance
                <input
                  value={edit.config.tolerance}
                  onChange={(e) =>
                    setEdit({ ...edit, config: { ...edit.config, tolerance: e.target.value } })
                  }
                />
              </label>
            </div>
            {edit.rule.kind === 'tiered' && (
              <div>
                <h3>Progressive tiers</h3>
                <p className="subtle">
                  Each rate applies only to the portion within its band. The last ceiling must cover
                  the full premium.
                </p>
                {edit.rule.tiers.map((tier, i) => (
                  <div className="inline-fields" key={i}>
                    <label>
                      Up to
                      <input
                        value={tier.upTo}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            rule: {
                              ...edit.rule,
                              tiers: edit.rule.tiers.map((t, j) =>
                                i === j ? { ...t, upTo: e.target.value } : t,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Rate (%)
                      <input
                        value={tier.rate}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            rule: {
                              ...edit.rule,
                              tiers: edit.rule.tiers.map((t, j) =>
                                i === j ? { ...t, rate: e.target.value } : t,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    <button
                      className="icon-btn"
                      aria-label={`Remove tier ${i + 1}`}
                      onClick={() =>
                        setEdit({
                          ...edit,
                          rule: { ...edit.rule, tiers: edit.rule.tiers.filter((_, j) => i !== j) },
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  className="btn secondary small"
                  onClick={() =>
                    setEdit({
                      ...edit,
                      rule: {
                        ...edit.rule,
                        tiers: [...edit.rule.tiers, { upTo: '10000', rate: '10' }],
                      },
                    })
                  }
                >
                  Add tier
                </button>
              </div>
            )}
            <p className="notice">
              Formula: ((base − fee) × (1 + tax %) + adjustment) × split %. In the import workspace,
              select this profile under Expected amount source and leave the expected amount column
              unmapped to calculate commissions from Premium. Explicitly mapped expected amounts
              take precedence. Current matching keys and import mappings are captured with this
              profile.
            </p>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="btn primary" onClick={save}>
              <Save size={16} /> Save profile version
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function History() {
  const { setRun, notify, account, run } = useWorkspace();
  const [runs, setRuns] = useState<Run[]>([]),
    [deleting, setDeleting] = useState<Run | null>(null),
    [compare, setCompare] = useState<string[]>([]);
  const navigate = useNavigate();
  const reload = () =>
    storage
      .runs()
      .then((r) => setRuns(r.sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(() => notify('Local history is unavailable.'));
  useEffect(() => {
    void reload();
  }, []);
  const sync = async (r: Run) => {
    try {
      const { id, name, createdAt, sample, inputCount, totals } = r;
      await api('/account/history', { id, name, createdAt, sample, inputCount, totals });
      notify('Only aggregate totals and run metadata were uploaded.');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const pair = runs.filter((r) => compare.includes(r.id));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR RECONCILIATION RECORD</p>
          <h1>Run history</h1>
          <p>Only runs you explicitly saved on this device appear here.</p>
        </div>
        <Link className="btn primary" to="/app/import">
          New reconciliation
        </Link>
      </div>
      {!runs.length ? (
        <Empty
          title="Your first run is waiting."
          action={
            <Link className="btn primary" to="/app/import">
              Import statements
            </Link>
          }
        >
          Complete a reconciliation, then choose “Save on device” to retain its source data and
          decisions.
        </Empty>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Saved on this device</h2>
              <p>
                Select two runs to compare aggregate totals. Verify compatible scope before drawing
                conclusions.
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Compare</th>
                  <th>Reconciliation</th>
                  <th>Saved run time</th>
                  <th>Source rows</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Compare ${r.name}`}
                        checked={compare.includes(r.id)}
                        disabled={compare.length === 2 && !compare.includes(r.id)}
                        onChange={(e) =>
                          setCompare((a) =>
                            e.target.checked ? [...a, r.id] : a.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="policy-link"
                        onClick={() => {
                          setRun(r);
                          navigate('/app/results');
                        }}
                      >
                        {r.name}
                      </button>
                      <small>
                        {r.sample ? 'Synthetic sample' : 'Imported data'} · engine {r.engineVersion}
                      </small>
                    </td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>{r.inputCount}</td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label={`Export ${r.name}`}
                        onClick={() =>
                          download(
                            JSON.stringify(r, null, 2),
                            `commiledger-${r.id}.json`,
                            'application/json',
                          )
                        }
                      >
                        <Download size={17} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={!account?.cloudHistory}
                        aria-label={`Sync aggregate summary for ${r.name}`}
                        onClick={() => sync(r)}
                      >
                        <CloudUpload size={17} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Delete ${r.name}`}
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {pair.length === 2 && (
        <section className="panel comparison">
          <h2>Saved run comparison</h2>
          <p>
            Difference is run B minus run A. These may be different import scopes, not a financial
            trend.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>A: {pair[0].name}</th>
                  <th>B: {pair[1].name}</th>
                  <th>Received change</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  new Set([...Object.keys(pair[0].totals), ...Object.keys(pair[1].totals)]),
                ).map((c) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td>
                      {pair[0].totals[c] ? money(pair[0].totals[c].received, c) : 'No records'}
                    </td>
                    <td>
                      {pair[1].totals[c] ? money(pair[1].totals[c].received, c) : 'No records'}
                    </td>
                    <td>
                      {pair[0].totals[c] && pair[1].totals[c]
                        ? money(
                            D(pair[1].totals[c].received)
                              .minus(pair[0].totals[c].received)
                              .toString(),
                            c,
                          )
                        : 'Not comparable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {deleting && (
        <Modal title="Delete saved run?" onClose={() => setDeleting(null)}>
          <div className="detail-body">
            <p>
              Remove {deleting.name}, including its source rows and review notes, from this device.
              Export a backup first if needed.
            </p>
            <button
              className="btn danger"
              onClick={async () => {
                try {
                  await storage.deleteRun(deleting.id);
                  setDeleting(null);
                  await reload();
                  notify('Saved run deleted from this device.');
                } catch {
                  notify('Could not delete the run.');
                }
              }}
            >
              Delete local run
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Reports() {
  const { run, account, notify } = useWorkspace();
  if (!run) return <NoRun />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLEAR RECORDS, READY TO SHARE</p>
          <h1>Reports & exports</h1>
          <p>
            {run.name} · {run.sample ? 'Synthetic sample' : 'Imported data'} · {run.inputCount}{' '}
            source rows
          </p>
        </div>
      </div>
      <div className="notice">
        <ShieldCheck size={17} /> Exports contain your data. Review recipients and retain reports
        according to your organization’s policy.
      </div>
      <div className="feature-grid three">
        {[
          {
            title: 'Complete reconciliation',
            description:
              'All findings, signed amounts, source references, file hashes and latest review notes.',
            action: () => download(resultCsv(run), 'commiledger-reconciliation.csv'),
            label: 'Export CSV',
            icon: FileText,
          },
          {
            title: 'Discrepancy report',
            description:
              'A focused report of all non-matched findings for follow-up with carriers.',
            action: () => download(resultCsv(run, true), 'commiledger-discrepancies.csv'),
            label: 'Export discrepancies',
            icon: FileText,
          },
          {
            title: 'Reproducible audit record',
            description:
              'Engine version, configuration, every source value and full decision history. Local audit notes are not tamper-proof.',
            action: () =>
              download(JSON.stringify(run, null, 2), 'commiledger-audit.json', 'application/json'),
            label: 'Export audit JSON',
            icon: Download,
          },
        ].map(({ title, description, action, label, icon: Icon }) => (
          <article className="feature-card" key={title}>
            <Icon size={28} />
            <h2>{title}</h2>
            <p>{description}</p>
            <button className="btn secondary" onClick={action}>
              <Download size={16} />
              {label}
            </button>
          </article>
        ))}
      </div>
      <div className="report-summary panel">
        <h2>Financial summary by currency</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Currency</th>
                <th>Expected</th>
                <th>Received</th>
                <th>Potential outstanding</th>
                <th>Confirmed signed variance</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(run.totals).map(([c, t]) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{money(t.expected, c)}</td>
                  <td>{money(t.received, c)}</td>
                  <td>{money(t.potentialOutstanding, c)}</td>
                  <td>{money(t.confirmedVariance, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="subtle">
          Received includes duplicate candidates. Invalid rows: {run.invalidCount}. Potential
          outstanding is not a confirmed carrier debt.
        </p>
        <button className="btn secondary" onClick={() => window.print()}>
          Print summary / save as PDF
        </button>
        {account?.auditExport && (
          <button
            className="btn secondary"
            onClick={async () => {
              try {
                const data = await api('/account/audit-export');
                download(
                  JSON.stringify(data, null, 2),
                  'commiledger-account-audit.json',
                  'application/json',
                );
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Export Pro cloud audit
          </button>
        )}
      </div>
    </>
  );
}
export function Settings() {
  const { config, setConfig, account, notify, refreshAccount, status } = useWorkspace();
  const [clear, setClear] = useState(false),
    [deleteAccount, setDeleteAccount] = useState(false),
    [cloudHistory, setCloudHistory] = useState<any[]>([]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE, YOUR CONTROL</p>
          <h1>Settings & security</h1>
          <p>Manage regional conventions, local data and your account.</p>
        </div>
      </div>
      <section className="panel settings-section">
        <h2>Regional defaults</h2>
        <div className="form-grid">
          <label>
            Reporting time zone
            <select
              value={config.timeZone}
              onChange={(e) => setConfig((c) => ({ ...c, timeZone: e.target.value }))}
            >
              {Array.from(
                new Set([config.timeZone, 'UTC', ...Intl.supportedValuesOf('timeZone')]),
              ).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Default currency
            <select
              value={config.currency}
              onChange={(e) => setConfig((c) => ({ ...c, currency: e.target.value }))}
            >
              {Intl.supportedValuesOf('currency').map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="subtle">
          Statement dates are calendar dates. Reporting time zone affects audit timestamp
          presentation, not the date stored in a source file.
        </p>
      </section>
      <section className="panel settings-section">
        <h2>Account</h2>
        {account ? (
          <>
            <p>
              {account.user.name} · {account.user.email} · {account.plan.toUpperCase()}
            </p>
            <div className="heading-actions">
              <button
                className="btn secondary"
                onClick={async () => {
                  try {
                    const data = await api('/account/export');
                    download(
                      JSON.stringify(data, null, 2),
                      'commiledger-account-data.json',
                      'application/json',
                    );
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Export account data
              </button>
              <button
                className="btn secondary"
                onClick={async () => {
                  try {
                    await api('/auth/sign-out', {});
                    await refreshAccount();
                    notify('Signed out. Local data remains on this device.');
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Sign out
              </button>
              <button className="btn danger" onClick={() => setDeleteAccount(true)}>
                Delete account
              </button>
            </div>
            <div className="cloud-history">
              <h3>Optional cloud summaries</h3>
              <button
                className="btn secondary small"
                onClick={async () => {
                  try {
                    setCloudHistory(await api('/account/history'));
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Load my cloud summaries
              </button>
              {cloudHistory.map((r) => (
                <div key={r.id}>
                  <span>
                    {JSON.parse(r.data).name} · {r.created_at}
                  </span>
                  <button
                    className="text-btn"
                    onClick={async () => {
                      try {
                        await api(`/account/history/${r.id}`, {}, 'DELETE');
                        setCloudHistory((a) => a.filter((x) => x.id !== r.id));
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    Delete cloud summary
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>
              {status?.accounts
                ? 'Sign in to manage optional cloud features.'
                : 'Account services are not configured on this installation. Local file reconciliation remains available.'}
            </p>
            <Link className="btn secondary" to="/signin">
              Sign in
            </Link>
          </>
        )}
      </section>
      <section className="panel settings-section">
        <h2>Data on this device</h2>
        <p>
          Saved runs contain original cell values and review notes. They are stored in browser
          IndexedDB and are not encrypted by CommiLedger. Use a trusted device.
        </p>
        <button className="btn danger" onClick={() => setClear(true)}>
          Clear saved runs and profiles
        </button>
      </section>
      {clear && (
        <Modal title="Clear saved local data?" onClose={() => setClear(false)}>
          <div className="detail-body">
            <p>
              This deletes all saved runs, source values, notes and carrier profiles on this device.
              Export backups first. The current in-memory run and cloud summaries are unaffected.
            </p>
            <button
              className="btn danger"
              onClick={async () => {
                try {
                  await storage.clear();
                  setClear(false);
                  notify('Saved local runs and profiles cleared.');
                } catch {
                  notify('Could not clear local storage.');
                }
              }}
            >
              Delete saved local data
            </button>
          </div>
        </Modal>
      )}
      {deleteAccount && (
        <Modal title="Request account deletion" onClose={() => setDeleteAccount(false)}>
          <div className="detail-body">
            <p>
              Cancel any active subscription first. Account deletion removes cloud configurations
              and summaries; local device files are managed separately. A confirmation link will be
              emailed to your verified address.
            </p>
            <button
              className="btn danger"
              onClick={async () => {
                try {
                  await api('/auth/delete-user', { callbackURL: '/' });
                  setDeleteAccount(false);
                  notify('Check your email to confirm account deletion.');
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Email deletion confirmation
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

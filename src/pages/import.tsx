import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, X, Play, ShieldCheck, ChevronDown, Check } from 'lucide-react';
import { useWorkspace, workerTask } from '../lib/workspace';
import { aliases, LIMITS, suggestMapping, detectHeader } from '../core/import';
import { sampleFiles } from '../core/sample';
import type { ImportFile, Side, Field, Run, MatchField, Profile } from '../core/types';
import { storage } from '../lib/storage';
export function ImportPage() {
  const { files, setFiles, config, setConfig, setRun, notify } = useWorkspace();
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [name, setName] = useState('Commission reconciliation'),
    [profiles, setProfiles] = useState<Profile[]>([]);
  const worker = useRef<Worker | null>(null),
    navigate = useNavigate();
  useEffect(() => {
    storage
      .profiles()
      .then(setProfiles)
      .catch(() => {});
    return () => worker.current?.terminate();
  }, []);
  const patch = (id: string, part: Partial<ImportFile>) =>
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...part } : f)));
  const upload = async (list: FileList | File[], side: Side) => {
    setError('');
    if (files.length + list.length > LIMITS.files) {
      setError(`Choose at most ${LIMITS.files} files per run`);
      return;
    }
    setBusy('Reading files…');
    try {
      const next: ImportFile[] = [];
      for (const file of Array.from(list)) {
        if (file.size > LIMITS.fileBytes) throw new Error(`${file.name}: maximum 10 MiB per file`);
        next.push(
          await workerTask<ImportFile>(
            { type: 'parse', file: { name: file.name, bytes: await file.arrayBuffer() }, side },
            setBusy,
            worker,
          ),
        );
      }
      setFiles((fs) => [...fs, ...next]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const run = async () => {
    setError('');
    setBusy('Preparing reconciliation…');
    try {
      if (!files.some((f) => f.side === 'expected') || !files.some((f) => f.side === 'received'))
        throw new Error('Add at least one expected file and one payment file');
      const result = await workerTask<Run>(
        {
          type: 'reconcile',
          files,
          config,
          name,
          sample: files.every((f) => f.hash === 'synthetic-sample-v1'),
        },
        setBusy,
        worker,
      );
      setRun(result);
      navigate('/app/results');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const applyProfile = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    setConfig({ ...profile.config, asOf: config.asOf });
    setFiles((fs) =>
      fs.map((f) => {
        const h = f.sheets[f.sheet].rows[f.header];
        const mapping = { ...f.mapping };
        for (const [field, header] of Object.entries(profile.mappingHeaders[f.side] || {})) {
          const idx = h.indexOf(header);
          if (idx >= 0) mapping[field as Field] = idx;
        }
        return { ...f, mapping };
      }),
    );
    notify(`Applied ${profile.name}, version ${profile.version}. Verify mappings before running.`);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR RECONCILIATION WORKSPACE</p>
          <h1>A clear start.</h1>
          <p>Bring your expected ledger and carrier statements together.</p>
        </div>
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() => {
            setFiles(sampleFiles());
            setConfig((c) => ({
              ...c,
              asOf: '2026-11-22',
              locale: 'en-US',
              currency: 'USD',
              dateFormat: 'YMD',
              keys: ['policy', 'carrier', 'period'],
            }));
            setName('Synthetic sample reconciliation');
          }}
        >
          Use sample files
        </button>
      </div>
      <div className="steps">
        <span className="active">
          1 <b>Import files</b>
        </span>
        <i />
        <span className={files.length ? 'active' : ''}>
          2 <b>Confirm mappings</b>
        </span>
        <i />
        <span>
          3 <b>Review results</b>
        </span>
      </div>
      <div className="upload-grid">
        {(['expected', 'received'] as Side[]).map((side) => (
          <section className="upload-card" key={side}>
            <div className="upload-title">
              <span className={`file-icon ${side}`}>
                <FileSpreadsheet />
              </span>
              <div>
                <h2>{side === 'expected' ? 'Expected commissions' : 'Carrier payments'}</h2>
                <p>
                  {side === 'expected'
                    ? 'What your records say should be paid.'
                    : 'What the carrier statement says was paid.'}
                </p>
              </div>
            </div>
            <label
              className={`dropzone ${busy ? 'disabled' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) void upload(e.dataTransfer.files, side);
              }}
            >
              <Upload size={24} />
              <strong>Choose files or drop them here</strong>
              <span>CSV or XLSX · Up to 10 MiB each</span>
              <input
                aria-label={`Upload ${side} files`}
                type="file"
                accept=".csv,.xlsx"
                multiple
                disabled={!!busy}
                onChange={(e) => {
                  if (e.target.files) void upload(e.target.files, side);
                  e.target.value = '';
                }}
              />
            </label>
            <div className="file-chips">
              {files
                .filter((f) => f.side === side)
                .map((f) => (
                  <span key={f.id}>
                    <FileSpreadsheet size={14} />
                    {f.name}
                    <button
                      aria-label={`Remove ${f.name}`}
                      disabled={!!busy}
                      onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
            </div>
          </section>
        ))}
      </div>
      <div className="privacy-line">
        <ShieldCheck size={17} /> Files are read on this device. Nothing is saved until you choose
        to save a completed run.
      </div>
      {files.length > 0 && (
        <>
          <section className="panel config-panel">
            <div className="panel-heading">
              <div>
                <h2>Set the context</h2>
                <p>Explicit conventions prevent accidental financial assumptions.</p>
              </div>
              {profiles.some((p) => !p.archived) && (
                <label>
                  Use carrier profile
                  <select defaultValue="" onChange={(e) => applyProfile(e.target.value)}>
                    <option value="">Select a saved profile</option>
                    {profiles
                      .filter((p) => !p.archived)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · v{p.version}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <div className="form-grid four">
              <label>
                Run name
                <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
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
              <label>
                Number format
                <select
                  value={config.locale}
                  onChange={(e) => setConfig((c) => ({ ...c, locale: e.target.value }))}
                >
                  <option value="en-US">1,234.56 · US / UK</option>
                  <option value="en-IN">1,23,456.78 · India</option>
                  <option value="de-DE">1.234,56 · Germany</option>
                  <option value="fr-FR">1 234,56 · France</option>
                </select>
              </label>
              <label>
                Date convention
                <select
                  value={config.dateFormat}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      dateFormat: e.target.value as 'YMD' | 'DMY' | 'MDY',
                    }))
                  }
                >
                  <option value="YMD">Year / month / day</option>
                  <option value="DMY">Day / month / year</option>
                  <option value="MDY">Month / day / year</option>
                </select>
              </label>
              <label>
                Review as of
                <input
                  type="date"
                  value={config.asOf}
                  onChange={(e) => setConfig((c) => ({ ...c, asOf: e.target.value }))}
                />
              </label>
              <label>
                Amount tolerance
                <input
                  value={config.tolerance}
                  inputMode="decimal"
                  onChange={(e) => setConfig((c) => ({ ...c, tolerance: e.target.value }))}
                />
              </label>
              <label>
                Coverage starts
                <input
                  type="date"
                  value={config.coverageStart}
                  onChange={(e) => setConfig((c) => ({ ...c, coverageStart: e.target.value }))}
                />
              </label>
              <label>
                Coverage ends
                <input
                  type="date"
                  value={config.coverageEnd}
                  onChange={(e) => setConfig((c) => ({ ...c, coverageEnd: e.target.value }))}
                />
              </label>
            </div>
            <div className="checks">
              <label>
                Expected amount source
                <select
                  aria-label="Expected amount source"
                  value={config.expectedRule?.profileId || ''}
                  onChange={(e) => {
                    const p = profiles.find((x) => x.id === e.target.value);
                    setConfig((c) => ({
                      ...c,
                      expectedRule: p
                        ? {
                            profileId: p.id,
                            profileVersion: p.version,
                            name: p.name,
                            rule: structuredClone(p.rule),
                          }
                        : undefined,
                    }));
                  }}
                >
                  <option value="">Use mapped expected amount</option>
                  {profiles
                    .filter((p) => !p.archived && p.config.currency === config.currency)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Calculate from premium · {p.name} v{p.version}
                      </option>
                    ))}
                </select>
              </label>
              {config.expectedRule && (
                <p className="notice">
                  The selected rule is used only when the expected amount column is unmapped. Map
                  Premium and verify the rule, currency, fee and tax basis before running.
                </p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={config.completeStatement}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, completeStatement: e.target.checked }))
                  }
                />{' '}
                I have included the complete payment statements for this coverage.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={config.caseSensitive}
                  onChange={(e) => setConfig((c) => ({ ...c, caseSensitive: e.target.checked }))}
                />{' '}
                Keep identifiers case-sensitive.
              </label>
            </div>
            <div className="key-picker">
              <span>Match using</span>
              {(
                [
                  'policy',
                  'carrier',
                  'agent',
                  'period',
                  'transaction',
                  'date',
                  'premium',
                ] as MatchField[]
              ).map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={config.keys.includes(k)}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        keys: e.target.checked ? [...c.keys, k] : c.keys.filter((x) => x !== k),
                      }))
                    }
                  />
                  {k}
                </label>
              ))}
              <span className="pill">
                <Check size={12} /> currency always included
              </span>
            </div>
          </section>
          {files.map((f) => {
            const sheet = f.sheets[f.sheet],
              headers = sheet.rows[f.header] || [];
            return (
              <section className="panel mapping-panel" key={f.id}>
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">
                      {f.side === 'expected' ? 'EXPECTED LEDGER' : 'PAYMENT STATEMENT'}
                    </span>
                    <h2>{f.name}</h2>
                  </div>
                  <div className="inline-fields">
                    <label>
                      Worksheet
                      <select
                        value={f.sheet}
                        onChange={(e) => {
                          const sheet = Number(e.target.value),
                            header = detectHeader(f.sheets[sheet].rows);
                          patch(f.id, {
                            sheet,
                            header,
                            mapping: suggestMapping(f.sheets[sheet].rows[header]).mapping,
                          });
                        }}
                      >
                        {f.sheets.map((s, i) => (
                          <option key={i} value={i}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Header row
                      <select
                        value={f.header}
                        onChange={(e) => {
                          const header = Number(e.target.value);
                          patch(f.id, {
                            header,
                            mapping: suggestMapping(sheet.rows[header]).mapping,
                          });
                        }}
                      >
                        {sheet.rows.slice(0, 20).map((r, i) => (
                          <option key={i} value={i}>
                            {i + 1}: {r.slice(0, 2).join(' / ').slice(0, 45)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="form-grid mapping-grid">
                  {(Object.keys(aliases) as Field[]).map((field) => (
                    <label key={field}>
                      {field === 'amount'
                        ? 'Commission amount'
                        : field === 'due'
                          ? 'Payment due date'
                          : field}
                      {(field === 'amount' || config.keys.includes(field as MatchField)) && (
                        <span className="required"> *</span>
                      )}
                      <select
                        value={f.mapping[field] ?? ''}
                        onChange={(e) => {
                          const mapping = { ...f.mapping };
                          if (e.target.value === '') delete mapping[field];
                          else mapping[field] = Number(e.target.value);
                          patch(f.id, { mapping });
                        }}
                      >
                        <option value="">
                          {field === 'currency' ? `Use ${config.currency}` : 'Not mapped'}
                        </option>
                        {headers.map((h, i) => (
                          <option value={i} key={i}>
                            {i + 1}. {h || 'Unnamed column'}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <details>
                  <summary>
                    Source preview · {sheet.rows.length - f.header - 1} rows after header{' '}
                    <ChevronDown size={14} />
                  </summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Source row</th>
                          {headers.map((h, i) => (
                            <th key={i}>{h || 'Unnamed'}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.slice(f.header + 1, f.header + 6).map((row, i) => (
                          <tr key={i}>
                            <td>{f.header + i + 2}</td>
                            {headers.map((_, j) => (
                              <td key={j}>{row[j] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <div className="import-warnings">
                  {f.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                  <p>
                    Rows 1–{f.header + 1} are treated as title/header rows. Fully empty rows are
                    ignored. All other rows are retained or reported invalid.
                  </p>
                </div>
              </section>
            );
          })}
        </>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="notice progress" role="status">
          <span className="spinner" />
          {busy}
          <button
            className="text-btn"
            onClick={() => {
              worker.current?.terminate();
              worker.current = null;
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="run-footer">
        <p>Up to 25,000 source rows per run · currencies remain separate</p>
        <button className="btn primary" disabled={!!busy || files.length === 0} onClick={run}>
          <Play size={16} /> Run reconciliation
        </button>
      </div>
    </>
  );
}

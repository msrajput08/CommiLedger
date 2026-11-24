import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Copy, Archive, CloudUpload } from 'lucide-react';
import type { Profile, Workflow } from '../core/types';
import { validateWorkflow } from '../core/workflows';
import { storage } from '../lib/storage';
import { api } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { Modal, Empty } from '../components/ui';

export function Workflows() {
  const { account, notify } = useWorkspace();
  const [items, setItems] = useState<Workflow[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [edit, setEdit] = useState<Workflow | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [versions, setVersions] = useState<Record<string, number>>({});
  const navigate = useNavigate();
  const reload = async () => {
    try {
      const [w, p] = await Promise.all([storage.workflows(), storage.profiles()]);
      setItems(w);
      setProfiles(p);
    } catch {
      notify('Local workflow storage is unavailable.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  const save = async () => {
    if (!edit) return;
    try {
      const item = validateWorkflow({
        ...edit,
        version: edit.version + 1,
        updatedAt: new Date().toISOString(),
      });
      await storage.saveWorkflow(item);
      await reload();
      setEdit(null);
      notify('Workflow saved with versioned profile snapshots.');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const cloud = async (item: Workflow) => {
    try {
      const r = await api(
        `/account/workflows/${item.id}`,
        { data: item, expectedVersion: versions[item.id] || 0 },
        'PUT',
      );
      setVersions((v) => ({ ...v, [item.id]: r.version }));
      notify('Workflow configuration saved to your account. No source rows uploaded.');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const loadCloud = async () => {
    try {
      const remote =
        await api<{ id: string; data: string; version: number }[]>('/account/workflows');
      for (const row of remote) {
        const item = validateWorkflow(JSON.parse(row.data));
        if (!items.some((w) => w.id === item.id && w.updatedAt > item.updatedAt))
          await storage.saveWorkflow(item);
      }
      setVersions(Object.fromEntries(remote.map((r) => [r.id, r.version])));
      await reload();
      notify('Cloud workflows loaded. Newer local edits were preserved.');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A REPEATABLE MONTH-END</p>
          <h1>Workflows</h1>
          <p>One template. Separate, traceable results for each carrier.</p>
        </div>
        <div className="heading-actions">
          {account && (
            <button className="btn secondary" onClick={loadCloud}>
              Load cloud workflows
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => {
              setError('');
              setEdit({
                id: crypto.randomUUID(),
                name: '',
                version: 0,
                archived: false,
                updatedAt: new Date().toISOString(),
                stages: [],
              });
            }}
          >
            <Plus size={16} /> New workflow
          </button>
        </div>
      </div>
      <div className="notice">
        Each stage retains a snapshot of its carrier profile, mappings and rule. Files stay on your
        device. Cloud template sync is a Pro feature.
      </div>
      {loading ? (
        <p role="status">Loading saved workflows…</p>
      ) : !items.length ? (
        <Empty title="Make the next reconciliation repeatable.">
          <p>Create carrier profiles, then combine them into a reusable workflow.</p>
          <Link className="btn secondary" to="/app/profiles">
            Manage carrier profiles
          </Link>
        </Empty>
      ) : (
        <div className="profile-grid">
          {items.map((w) => (
            <article className={`panel profile-card ${w.archived ? 'archived' : ''}`} key={w.id}>
              <span className="pill">{w.archived ? 'Archived' : `Version ${w.version}`}</span>
              <h2>{w.name}</h2>
              <p>{w.stages.map((s) => `${s.profile.name} v${s.profile.version}`).join(' · ')}</p>
              <p>
                {w.stages.length} separately reconciled stages · up to 25,000 combined source rows
              </p>
              <div className="profile-actions">
                <button
                  className="btn primary small"
                  disabled={w.archived}
                  onClick={() => navigate(`/app/import?workflow=${w.id}`)}
                >
                  Use workflow
                </button>
                <button
                  className="btn secondary small"
                  onClick={() => {
                    setError('');
                    setEdit(structuredClone(w));
                  }}
                >
                  Edit
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Duplicate ${w.name}`}
                  onClick={() => {
                    setError('');
                    setEdit({
                      ...structuredClone(w),
                      id: crypto.randomUUID(),
                      name: `${w.name.slice(0, 90)} copy`,
                      version: 0,
                      archived: false,
                    });
                  }}
                >
                  <Copy size={17} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`${w.archived ? 'Restore' : 'Archive'} ${w.name}`}
                  onClick={async () => {
                    try {
                      await storage.saveWorkflow({
                        ...w,
                        archived: !w.archived,
                        version: w.version + 1,
                        updatedAt: new Date().toISOString(),
                      });
                      await reload();
                    } catch {
                      notify('Workflow could not be updated.');
                    }
                  }}
                >
                  <Archive size={17} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Sync ${w.name} workflow to cloud`}
                  disabled={!account?.workflowTemplates}
                  onClick={() => cloud(w)}
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
          title={edit.version ? 'Edit workflow' : 'New workflow'}
          onClose={() => setEdit(null)}
        >
          <div className="detail-body">
            <label>
              Workflow name
              <input
                maxLength={100}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <p>
              Select up to five stages. Adding a profile captures its current version; later profile
              edits do not silently change this workflow.
            </p>
            <label>
              Add carrier stage
              <select
                value=""
                disabled={edit.stages.length >= 5}
                onChange={(e) => {
                  const p = profiles.find((x) => x.id === e.target.value);
                  if (p)
                    setEdit({
                      ...edit,
                      stages: [
                        ...edit.stages,
                        {
                          id: crypto.randomUUID(),
                          profile: structuredClone(p),
                          deriveExpected: false,
                        },
                      ],
                    });
                }}
              >
                <option value="">Choose a saved profile</option>
                {profiles
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · v{p.version}
                    </option>
                  ))}
              </select>
            </label>
            {!profiles.length && <p>Create a carrier profile first in Carriers & rules.</p>}
            {edit.stages.map((stage, i) => (
              <section className="panel config-panel" key={stage.id}>
                <h3>
                  {i + 1}. {stage.profile.name} · v{stage.profile.version}
                </h3>
                <p>
                  {stage.profile.config.currency} · {stage.profile.config.keys.join(' + ')} ·{' '}
                  {stage.profile.rule.kind} commission
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={stage.deriveExpected}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        stages: edit.stages.map((s) =>
                          s.id === stage.id ? { ...s, deriveExpected: e.target.checked } : s,
                        ),
                      })
                    }
                  />{' '}
                  Derive expected amounts from this rule when no amount column is mapped
                </label>
                <button
                  className="btn secondary small"
                  onClick={() =>
                    setEdit({ ...edit, stages: edit.stages.filter((s) => s.id !== stage.id) })
                  }
                >
                  Remove stage {i + 1}
                </button>
              </section>
            ))}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" onClick={save}>
              Save workflow
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

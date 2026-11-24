import { describe, it, expect } from 'vitest';
import { restoreBackup } from '../src/core/backup';
import { prepareBatch, mapProfile, validateWorkflow } from '../src/core/workflows';
import { defaultConfig, defaultRule, type Workflow, type Profile } from '../src/core/types';
import { sampleFiles } from '../src/core/sample';
import { normalizeFile } from '../src/core/import';
import { reconcile } from '../src/core/engine';
const config = { ...defaultConfig(), asOf: '2026-11-22' };
const makeProfile = (name = 'Test carrier'): Profile => ({
  id: crypto.randomUUID(),
  name,
  country: 'India',
  currency: 'USD',
  config: structuredClone(config),
  rule: defaultRule(),
  mappingHeaders: {},
  version: 2,
  archived: false,
  updatedAt: new Date().toISOString(),
});
const template = (): Workflow => ({
  id: crypto.randomUUID(),
  name: 'Month end',
  version: 1,
  archived: false,
  updatedAt: new Date().toISOString(),
  stages: [{ id: crypto.randomUUID(), profile: makeProfile(), deriveExpected: false }],
});
const sampleRun = () =>
  reconcile(
    sampleFiles().flatMap((f) => normalizeFile(f, config)),
    config,
    { sample: true },
  );
describe('verified audit backup restore', () => {
  it('recalculates all source-backed findings and preserves review notes under a new run ID', () => {
    const original = sampleRun();
    original.rows[0].review.push({
      status: 'Investigating',
      note: 'Synthetic evidence',
      actor: 'Local reviewer',
      at: new Date().toISOString(),
    });
    const restored = restoreBackup(JSON.stringify(original));
    expect(restored.id).not.toBe(original.id);
    expect(restored.totals).toEqual(original.totals);
    expect(restored.rows.map((r) => r.review)).toEqual(original.rows.map((r) => r.review));
    expect(restored.inputCount).toBe(original.inputCount);
  });
  it.each(['total', 'finding', 'count', 'duplicate-source', 'engine', 'extra-field'])(
    'rejects inconsistent %s backups',
    (kind) => {
      const run = sampleRun();
      if (kind === 'total') run.totals.USD.received = '1.00';
      if (kind === 'finding') run.rows[0].received = '1.00';
      if (kind === 'count') run.inputCount++;
      if (kind === 'duplicate-source') run.rows[1].sources[0].id = run.rows[0].sources[0].id;
      if (kind === 'engine') run.engineVersion = '99.0.0';
      if (kind === 'extra-field') (run as any).cloudUpload = 'https://example.test';
      expect(() => restoreBackup(JSON.stringify(run))).toThrow();
    },
  );
  it('retains invalid records without including them in financial totals', () => {
    const input = sampleFiles().flatMap((f) => normalizeFile(f, config));
    input[0].amount = 'not money';
    const run = reconcile(input, config);
    const copy = restoreBackup(JSON.stringify(run));
    expect(copy.invalidCount).toBe(run.invalidCount);
    expect(copy.totals).toEqual(run.totals);
  });
});
describe('reusable carrier batch workflows', () => {
  it('keeps two carrier groups independent and preserves every assigned row', () => {
    const w = template();
    w.stages.push({
      id: crypto.randomUUID(),
      profile: makeProfile('Second carrier'),
      deriveExpected: false,
    });
    const first = sampleFiles(),
      second = sampleFiles().map((f) => ({ ...f, id: crypto.randomUUID() }));
    const files = [...first, ...second];
    const assignments = Object.fromEntries(files.map((f, i) => [f.id, w.stages[i < 2 ? 0 : 1].id]));
    const jobs = prepareBatch(w, files, assignments, config);
    expect(jobs).toHaveLength(2);
    const runs = jobs.map((j) =>
      reconcile(
        j.files.flatMap((f) => normalizeFile(f, j.config)),
        j.config,
      ),
    );
    expect(runs[0].inputCount + runs[1].inputCount).toBe(186);
    expect(runs[0].totals).toEqual(runs[1].totals);
  });
  it('requires explicit assignment and both sides for every stage', () => {
    const w = template(),
      files = sampleFiles();
    expect(() => prepareBatch(w, files, {}, config)).toThrow('Assign every file');
    expect(() => prepareBatch(w, [files[0]], { [files[0].id]: w.stages[0].id }, config)).toThrow(
      'payment statement',
    );
  });
  it('captures per-stage conventions, explicit derivation and current coverage without mutating the template', () => {
    const w = template();
    w.stages[0].deriveExpected = true;
    w.stages[0].profile.config.locale = 'en-IN';
    const files = sampleFiles();
    const job = prepareBatch(
      w,
      files,
      Object.fromEntries(files.map((f) => [f.id, w.stages[0].id])),
      { ...config, asOf: '2027-01-15' },
    )[0];
    expect(job.config.locale).toBe('en-IN');
    expect(job.config.asOf).toBe('2027-01-15');
    expect(job.config.expectedRule?.profileVersion).toBe(2);
    job.config.expectedRule!.rule.rate = '30';
    expect(w.stages[0].profile.rule.rate).toBe('10');
  });
  it('rejects archived templates, repeated stages and raw rows in cloud configurations', () => {
    const w = template(),
      files = sampleFiles();
    expect(() => prepareBatch({ ...w, archived: true }, files, {}, config)).toThrow(
      'Restore the workflow',
    );
    expect(() => validateWorkflow({ ...w, stages: [w.stages[0], w.stages[0]] })).toThrow('unique');
    expect(() => validateWorkflow({ ...w, rows: [{ policy: 'private' }] })).toThrow();
  });
  it('does not substitute a different financial column when a saved header is absent or ambiguous', () => {
    const file = sampleFiles()[0],
      p = makeProfile();
    p.mappingHeaders.expected = { amount: 'Absent' };
    expect(mapProfile(file, p).mapping.amount).toBeUndefined();
    const headers = file.sheets[file.sheet].rows[file.header];
    headers.push(headers[file.mapping.amount!]);
    p.mappingHeaders.expected = { amount: headers[file.mapping.amount!] };
    expect(mapProfile(file, p).mapping.amount).toBeUndefined();
  });
});

import { it, expect } from 'vitest';
import { defaultConfig, defaultRule } from '../src/core/types';
import { sampleFiles } from '../src/core/sample';
import { normalizeFile } from '../src/core/import';
import { reconcile } from '../src/core/engine';
import { sourceBuckets } from '../src/core/analytics';
it('derives expected commissions from an explicitly selected versioned rule', () => {
  const file = sampleFiles()[0];
  delete file.mapping.amount;
  const config = {
    ...defaultConfig(),
    expectedRule: {
      profileId: 'carrier',
      profileVersion: 2,
      name: 'Carrier standard',
      rule: { ...defaultRule(), rate: '12.5', split: '50' },
    },
  };
  const rows = normalizeFile(file, config);
  expect(rows[0].amount).toBe('625.00');
  expect(rows[0].source.raw['9: Commission']).toBe('450.00');
  const run = reconcile(rows, config);
  expect(run.config.expectedRule?.profileVersion).toBe(2);
  expect(run.rows[0].evidence).toContain('v2');
});
it('never silently replaces a mapped expected amount with a rule calculation', () => {
  const config = {
    ...defaultConfig(),
    expectedRule: { profileId: 'carrier', profileVersion: 1, name: 'Rule', rule: defaultRule() },
  };
  const rows = normalizeFile(sampleFiles()[0], config);
  expect(rows[0].amount).toBe('450.00');
});
it('rejects derivation for a different currency rather than applying fixed fees across currencies', () => {
  const file = sampleFiles()[0];
  delete file.mapping.amount;
  file.sheets[0].rows[1][7] = 'EUR';
  const config = {
    ...defaultConfig(),
    expectedRule: { profileId: 'carrier', profileVersion: 1, name: 'Rule', rule: defaultRule() },
  };
  const rows = normalizeFile(file, config);
  expect(rows[0].errors.join(' ')).toContain('currency');
});
it('monthly charts preserve source periods even when period is not a matching key', () => {
  const config = { ...defaultConfig(), keys: ['policy', 'carrier'] as ('policy' | 'carrier')[] };
  const e = normalizeFile(sampleFiles()[0], config)[0],
    p = {
      ...structuredClone(e),
      side: 'received' as const,
      id: 'pay',
      period: '2026-09',
      transaction: 'p',
      amount: '450.00',
    };
  const run = reconcile([e, p], config);
  expect(run.rows[0].outcome).toBe('matched');
  const months = sourceBuckets(run, 'USD', 'period');
  expect(months.get('2026-08')?.expected).toBe('450');
  expect(months.get('2026-08')?.received).toBe('0');
  expect(months.get('2026-09')?.received).toBe('450');
});
it('case-insensitive matching cannot bypass duplicate quarantine by changing carrier case', () => {
  const config = { ...defaultConfig(), caseSensitive: false },
    p = normalizeFile(sampleFiles()[1], config)[0],
    q = { ...structuredClone(p), id: 'other', carrier: p.carrier.toUpperCase() };
  const run = reconcile([p, q], config);
  expect(run.rows[0].outcome).toBe('duplicate');
});

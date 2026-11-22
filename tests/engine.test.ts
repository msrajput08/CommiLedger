import { describe, it, expect } from 'vitest';
import { reconcile, validateConfig } from '../src/core/engine';
import {
  defaultConfig,
  defaultRule,
  type RecordRow,
  type Side,
  type Config,
} from '../src/core/types';
import { parseMoney, calculateCommission, money } from '../src/core/money';
import { parseDate } from '../src/core/dates';
const config: Config = { ...defaultConfig(), asOf: '2026-11-22' };
let serial = 0;
const row = (side: Side, amount = '100.00', rest: Partial<RecordRow> = {}): RecordRow => ({
  id: String(++serial),
  side,
  policy: '001-A',
  carrier: 'Carrier',
  agent: 'Agent 1',
  period: '2026-11',
  transaction: '',
  date: '2026-11-01',
  due: '2026-11-20',
  currency: 'USD',
  amount,
  premium: '1000.00',
  source: { file: `${side}.csv`, sheet: 'CSV', row: 2, hash: 'test', raw: {} },
  errors: [],
  ...rest,
});
describe('decimal financial arithmetic', () => {
  it.each([
    ['1,234.56', 'USD', 'en-US', '1234.56'],
    ['1,23,456.78', 'INR', 'en-IN', '123456.78'],
    ['1.234,56', 'EUR', 'de-DE', '1234.56'],
    ['1 234,56', 'EUR', 'fr-FR', '1234.56'],
    ['(125.25)', 'USD', 'en-US', '-125.25'],
    ['USD 200.00', 'USD', 'en-US', '200.00'],
    ['999999999999999999999999', 'JPY', 'en-US', '999999999999999999999999'],
    ['0.001', 'KWD', 'en-US', '0.001'],
  ])('parses %s for %s', (...[s, c, l, out]) => expect(parseMoney(s, c, l)).toBe(out));
  it.each([
    '1,23.00',
    '$100',
    '1.005',
    'Infinity',
    'NaN',
    '1e6',
    '1.2.3',
    '',
    '10.',
    '--1',
    '1,000.000',
    '9999999999999999999999999',
  ])('rejects unsafe input %s', (s) => expect(() => parseMoney(s, 'USD', 'en-US')).toThrow());
  it('rejects unknown currency', () => expect(() => parseMoney('1', 'XYZ', 'en-US')).toThrow());
  it('never rounds imported JPY fractions', () =>
    expect(() => parseMoney('1.1', 'JPY', 'en-US')).toThrow());
  it('calculates exact percentage without float error', () =>
    expect(calculateCommission('0.30', 'USD', { ...defaultRule(), rate: '10' })).toBe('0.03'));
  it('supports fixed split and explicit tax fee order', () =>
    expect(
      calculateCommission('0', 'USD', {
        ...defaultRule(),
        kind: 'fixed',
        fixed: '100',
        fee: '10',
        taxRate: '10',
        adjustment: '1',
        split: '50',
      }),
    ).toBe('50.00'));
  it('applies progressive tiers', () =>
    expect(
      calculateCommission('1500', 'USD', {
        ...defaultRule(),
        kind: 'tiered',
        tiers: [
          { upTo: '1000', rate: '10' },
          { upTo: '2000', rate: '5' },
        ],
      }),
    ).toBe('125.00'));
  it('preserves negative tiered refunds', () =>
    expect(
      calculateCommission('-1500', 'USD', {
        ...defaultRule(),
        kind: 'tiered',
        tiers: [
          { upTo: '1000', rate: '10' },
          { upTo: '2000', rate: '5' },
        ],
      }),
    ).toBe('-125.00'));
  it('requires complete tier coverage', () =>
    expect(() =>
      calculateCommission('2000', 'USD', {
        ...defaultRule(),
        kind: 'tiered',
        tiers: [{ upTo: '1000', rate: '10' }],
      }),
    ).toThrow());
  it.each([
    ['half-up', '0.01'],
    ['half-even', '0.00'],
    ['down', '0.00'],
  ] as const)('rounding mode %s', (rounding, value) =>
    expect(calculateCommission('0.05', 'USD', { ...defaultRule(), rate: '10', rounding })).toBe(
      value,
    ),
  );
  it('rejects an invalid split', () =>
    expect(() => calculateCommission('100', 'USD', { ...defaultRule(), split: '101' })).toThrow());
  it('formats huge values exactly', () =>
    expect(money('999999999999999999999999.99', 'USD')).toContain(
      '999,999,999,999,999,999,999,999.99',
    ));
});
describe('dates', () => {
  it.each([
    ['31/01/2026', 'DMY', '2026-01-31'],
    ['01/31/2026', 'MDY', '2026-01-31'],
    ['2024-02-29', 'DMY', '2024-02-29'],
  ] as const)('parses %s', (s, f, r) => expect(parseDate(s, f)).toBe(r));
  it.each(['2026-02-29', '31/04/2026', '2026-13-01', '11/22/26'])('rejects invalid %s', (s) =>
    expect(() => parseDate(s, 'DMY')).toThrow(),
  );
});
describe('reconciliation and conservation', () => {
  it.each([
    ['100.00', 'matched', '0.00'],
    ['80.00', 'underpaid', '-20.00'],
    ['120.00', 'overpaid', '20.00'],
    ['100.01', 'matched', '0.01'],
  ] as const)('%s → %s', (amount, outcome, variance) => {
    const run = reconcile([row('expected'), row('received', amount)], config);
    expect(run.rows[0].outcome).toBe(outcome);
    expect(run.rows[0].variance).toBe(variance);
  });
  it('aggregates one-to-many distinct payments exactly once', () => {
    const r = reconcile(
      [
        row('expected'),
        row('received', '40.00', { transaction: 'a' }),
        row('received', '60.00', { transaction: 'b' }),
      ],
      config,
    );
    expect(r.rows[0].outcome).toBe('matched');
    expect(r.totals.USD.received).toBe('100.00');
    expect(r.rows[0].sources).toHaveLength(3);
  });
  it('quarantines ALL duplicate candidates; does not falsely flag expected as missing', () => {
    const r = reconcile(
      [
        row('expected'),
        row('received', '100.00', { transaction: 'same' }),
        row('received', '100.00', { transaction: 'same' }),
      ],
      config,
    );
    expect(r.rows.map((r) => r.outcome)).toEqual(['duplicate', 'ambiguous']);
    expect(r.totals.USD.received).toBe('200.00');
    expect(r.totals.USD.duplicateAmount).toBe('200.00');
    expect(r.totals.USD.eligibleReceived).toBe('0.00');
    expect(r.totals.USD.potentialOutstanding).toBe('0.00');
  });
  it('detects duplicate fingerprints without transaction IDs', () =>
    expect(reconcile([row('received'), row('received')], config).rows[0].outcome).toBe(
      'duplicate',
    ));
  it('keeps legitimate identical amounts with distinct transaction IDs', () =>
    expect(
      reconcile(
        [
          row('expected', '200'),
          row('received', '100', { transaction: 'a' }),
          row('received', '100', { transaction: 'b' }),
        ],
        config,
      ).rows[0].outcome,
    ).toBe('matched'));
  it('refuses many-to-many ambiguous allocation', () => {
    const r = reconcile([row('expected'), row('expected'), row('received', '200')], config);
    expect(r.rows[0].outcome).toBe('ambiguous');
    expect(r.totals.USD.confirmedVariance).toBe('0.00');
  });
  it('never matches across currencies', () => {
    const r = reconcile([row('expected'), row('received', '100.00', { currency: 'EUR' })], config);
    expect(r.rows.map((r) => r.outcome)).toEqual(['missing', 'unmatched']);
    expect(Object.keys(r.totals)).toHaveLength(2);
  });
  it('does not collapse leading zeros or punctuation', () => {
    expect(
      reconcile([row('expected'), row('received', '100', { policy: '1A' })], config).rows,
    ).toHaveLength(2);
  });
  it('supports additional agent keys', () => {
    const r = reconcile([row('expected'), row('received', '100', { agent: 'other' })], {
      ...config,
      keys: [...config.keys, 'agent'],
    });
    expect(r.rows).toHaveLength(2);
  });
  it('preserves reversal amounts and flags review', () => {
    const r = reconcile([row('expected'), row('received', '-25')], config);
    expect(r.rows[0].outcome).toBe('reversal');
    expect(r.totals.USD.received).toBe('-25.00');
    expect(r.totals.USD.confirmedVariance).toBe('0.00');
  });
  it('does not label absent entries definitive nonpayment', () => {
    const r = reconcile([row('expected')], config);
    expect(r.rows[0].evidence).toContain('insufficient');
    expect(r.totals.USD.potentialOutstanding).toBe('100.00');
  });
  it('excludes future-due amounts from potential outstanding', () =>
    expect(
      reconcile([row('expected', '100', { due: '2026-12-01' })], config).totals.USD
        .potentialOutstanding,
    ).toBe('0.00'));
  it('requires dates for complete coverage declaration', () =>
    expect(() => validateConfig({ ...config, completeStatement: true })).toThrow());
  it('rejects negative tolerances', () =>
    expect(() => reconcile([], { ...config, tolerance: '-1' })).toThrow());
  it('reports invalid records without discarding or summing their amounts', () => {
    const bad = row('received', 'invalid');
    const r = reconcile([row('expected'), bad], config);
    expect(r.inputCount).toBe(2);
    expect(r.invalidCount).toBe(1);
    expect(r.rows.flatMap((r) => r.sources)).toHaveLength(2);
    expect(r.totals.USD.received).toBe('0.00');
  });
  it('rejects colliding internal source IDs', () => {
    const x = row('expected');
    expect(() => reconcile([x, x], config)).toThrow();
  });
  it('conserves every source across mixed outcomes', () => {
    const data = [
      row('expected'),
      row('received', '80'),
      row('received', '10', { policy: 'other' }),
      row('received', 'bad'),
      row('expected', '30', { policy: 'no-pay' }),
    ];
    const r = reconcile(data, config);
    expect(r.rows.flatMap((r) => r.sources.map((s) => s.id)).sort()).toEqual(
      data.map((r) => r.id).sort(),
    );
    expect(r.totals.USD.expected).toBe('130.00');
    expect(r.totals.USD.received).toBe('90.00');
    expect(r.totals.USD.variance).toBe('-40.00');
    expect(r.totals.USD.confirmedVariance).toBe('-20.00');
    expect(r.totals.USD.potentialOutstanding).toBe('50.00');
  });
  it('is reproducible with fixed run metadata and does not mutate inputs', () => {
    const rows = [row('expected'), row('received')],
      before = JSON.stringify(rows),
      opts = { id: 'fixed', now: '2026-11-22T00:00:00.000Z' };
    expect(reconcile(rows, config, opts)).toEqual(reconcile(rows, config, opts));
    expect(JSON.stringify(rows)).toBe(before);
  });
});

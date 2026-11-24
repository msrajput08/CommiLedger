import { D, currencyDigits, decimalInput, validateRule } from './money';
import { parseDate } from './dates';
import {
  ENGINE_VERSION,
  type Config,
  type RecordRow,
  type ResultRow,
  type Run,
  type Totals,
  type Outcome,
} from './types';
const canonical = (s: string, c: Config) =>
  c.caseSensitive ? s.trim() : s.trim().toLocaleUpperCase('en-US');
const key = (r: RecordRow, c: Config) =>
  JSON.stringify([r.currency, ...c.keys.map((k) => canonical(r[k], c))]);
export function validateConfig(c: Config) {
  const allowed = ['policy', 'carrier', 'agent', 'period', 'transaction', 'date', 'premium'];
  if (
    c.version !== 1 ||
    !c.keys.length ||
    c.keys.some((k) => !allowed.includes(k)) ||
    new Set(c.keys).size !== c.keys.length
  )
    throw new Error('Select unique, supported matching fields');
  if (!c.keys.includes('policy') && !c.keys.includes('transaction'))
    throw new Error('Matching needs a policy or transaction identifier');
  if (decimalInput(c.tolerance, 'Tolerance').lt(0) || D(c.tolerance).gt(1000))
    throw new Error('Tolerance must be between 0 and 1000 currency units');
  currencyDigits(c.currency);
  new Intl.NumberFormat(c.locale);
  new Intl.DateTimeFormat(c.locale, { timeZone: c.timeZone });
  if (c.expectedRule) validateRule(c.expectedRule.rule);
  if (!parseDate(c.asOf, 'YMD')) throw new Error('As-of date is required');
  parseDate(c.coverageStart, 'YMD');
  parseDate(c.coverageEnd, 'YMD');
  if (
    c.completeStatement &&
    (!c.coverageStart || !c.coverageEnd || c.coverageStart > c.coverageEnd)
  )
    throw new Error('Complete statements require a valid coverage date range');
}
export function reconcile(
  input: RecordRow[],
  config: Config,
  options: { name?: string; sample?: boolean; now?: string; id?: string } = {},
): Run {
  validateConfig(config);
  if (new Set(input.map((r) => r.id)).size !== input.length)
    throw new Error('Source row identifiers must be unique');
  const rows: ResultRow[] = [];
  const valid: RecordRow[] = [];
  const make = (outcome: Outcome, sources: RecordRow[], evidence: string): ResultRow => {
    const first = sources[0];
    let expected = D(0),
      received = D(0);
    for (const r of sources) {
      if (r.errors.length) continue;
      r.side === 'expected'
        ? (expected = expected.plus(r.amount))
        : (received = received.plus(r.amount));
    }
    let digits = 2;
    try {
      digits = currencyDigits(first.currency);
    } catch {
      /* Invalid currencies are not in totals. */
    }
    return {
      id: `result:${sources.map((s) => s.id).join('|')}`,
      outcome,
      policy: first.policy || '—',
      carrier: first.carrier || 'Unspecified',
      period: first.period,
      currency: first.currency,
      expected: expected.toFixed(digits),
      received: received.toFixed(digits),
      variance: received.minus(expected).toFixed(digits),
      evidence,
      sources,
      overdue: sources.some((s) => s.side === 'expected' && !!s.due && s.due <= config.asOf),
      review: [],
    };
  };
  for (const original of input) {
    const r = { ...original, errors: [...original.errors] };
    try {
      const digits = currencyDigits(r.currency);
      if (decimalInput(r.amount).decimalPlaces() > digits)
        r.errors.push('Amount has excess decimal places');
    } catch (e) {
      r.errors.push((e as Error).message);
    }
    for (const field of config.keys)
      if (!r[field]) r.errors.push(`Required matching field missing: ${field}`);
    for (const field of ['date', 'due'] as const)
      try {
        parseDate(r[field], 'YMD');
      } catch {
        r.errors.push(`Invalid ${field}`);
      }
    if (r.errors.length) rows.push(make('invalid', [r], r.errors.join('; ')));
    else valid.push(r);
  }
  const duplicateIndex = new Map<string, RecordRow[]>();
  for (const r of valid.filter((r) => r.side === 'received')) {
    const fingerprint = r.transaction
      ? JSON.stringify([
          'id',
          canonical(r.carrier, config),
          r.currency,
          canonical(r.transaction, config),
        ])
      : JSON.stringify([
          'row',
          canonical(r.policy, config),
          canonical(r.carrier, config),
          r.currency,
          canonical(r.agent, config),
          r.period,
          r.date,
          D(r.amount).toString(),
          r.premium,
        ]);
    const arr = duplicateIndex.get(fingerprint) || [];
    arr.push(r);
    duplicateIndex.set(fingerprint, arr);
  }
  const duplicateIds = new Set<string>();
  const blockedKeys = new Set<string>();
  for (const group of duplicateIndex.values())
    if (group.length > 1) {
      for (const r of group) {
        duplicateIds.add(r.id);
        blockedKeys.add(key(r, config));
      }
      rows.push(
        make(
          'duplicate',
          group,
          'Repeated transaction ID or indistinguishable payment rows. All candidates are excluded from confident matching until corrected in the source; imported cash totals still include them.',
        ),
      );
    }
  const groups = new Map<string, RecordRow[]>();
  for (const r of valid) {
    if (duplicateIds.has(r.id)) continue;
    const k = key(r, config);
    const arr = groups.get(k) || [];
    arr.push(r);
    groups.set(k, arr);
  }
  for (const [k, group] of groups) {
    const e = group.filter((r) => r.side === 'expected'),
      p = group.filter((r) => r.side === 'received');
    const proof = `Exact ${config.keys.join(' + ')} and currency; ${config.caseSensitive ? 'case-sensitive' : 'case-insensitive'}; ${e.length} expected / ${p.length} payment rows; tolerance ${config.tolerance}. ${config.expectedRule ? `If no expected amount column was mapped, premium used rule ${config.expectedRule.name} v${config.expectedRule.profileVersion}; the complete rule is stored with this run. ` : ''}`;
    if (blockedKeys.has(k)) {
      rows.push(
        make(
          'ambiguous',
          group,
          proof + 'Related duplicate candidates prevent a reliable allocation.',
        ),
      );
      continue;
    }
    if (e.length > 1) {
      rows.push(
        make(
          'ambiguous',
          group,
          proof +
            'Multiple expected entries share this key. Add an agent, transaction or date key, or correct the source; no allocation was guessed.',
        ),
      );
      continue;
    }
    if (!e.length) {
      rows.push(
        make(
          p.some((r) => D(r.amount).lt(0)) ? 'reversal' : 'unmatched',
          group,
          proof + 'No expected record found in the imported ledger.',
        ),
      );
      continue;
    }
    if (!p.length) {
      const due = e[0].due;
      const covered =
        !!due &&
        config.completeStatement &&
        due >= config.coverageStart &&
        due <= config.coverageEnd &&
        due <= config.asOf;
      rows.push(
        make(
          'missing',
          group,
          proof +
            (covered
              ? 'Due date falls within the user-declared complete coverage. Potential outstanding; carrier confirmation is still needed.'
              : 'Absent from these imported payments. Coverage or payment timing is insufficient to establish non-payment.'),
        ),
      );
      continue;
    }
    const r = make('matched', group, proof);
    const delta = D(r.variance);
    r.outcome =
      p.some((r) => D(r.amount).lt(0)) || D(r.expected).lt(0)
        ? 'reversal'
        : delta.abs().lte(config.tolerance)
          ? 'matched'
          : delta.lt(0)
            ? 'underpaid'
            : 'overpaid';
    r.evidence +=
      r.outcome === 'reversal'
        ? 'Negative transaction preserved; inspect the adjustment before accepting it.'
        : 'Payments were summed once and compared with the expected amount.';
    rows.push(r);
  }
  const totals: Record<string, Totals> = {};
  const zero = () => ({
    expected: '0',
    received: '0',
    eligibleReceived: '0',
    duplicateAmount: '0',
    variance: '0',
    confirmedVariance: '0',
    potentialOutstanding: '0',
    unmatched: '0',
    underpayment: '0',
  });
  for (const r of valid) {
    const t = (totals[r.currency] ??= zero());
    if (r.side === 'expected') t.expected = D(t.expected).plus(r.amount).toString();
    else {
      t.received = D(t.received).plus(r.amount).toString();
      const k = duplicateIds.has(r.id) ? 'duplicateAmount' : 'eligibleReceived';
      t[k] = D(t[k]).plus(r.amount).toString();
    }
  }
  for (const r of rows) {
    const t = totals[r.currency];
    if (!t) continue;
    if (['underpaid', 'overpaid'].includes(r.outcome))
      t.confirmedVariance = D(t.confirmedVariance).plus(r.variance).toString();
    if (r.outcome === 'underpaid') {
      t.underpayment = D(t.underpayment).minus(r.variance).toString();
      t.potentialOutstanding = D(t.potentialOutstanding).minus(r.variance).toString();
    }
    if (r.outcome === 'missing' && D(r.expected).gt(0) && r.overdue)
      t.potentialOutstanding = D(t.potentialOutstanding).plus(r.expected).toString();
    if (
      r.outcome === 'unmatched' ||
      (r.outcome === 'reversal' && !r.sources.some((s) => s.side === 'expected'))
    )
      t.unmatched = D(t.unmatched).plus(r.received).toString();
  }
  for (const [currency, t] of Object.entries(totals)) {
    t.variance = D(t.received).minus(t.expected).toString();
    for (const k of Object.keys(t) as (keyof Totals)[])
      t[k] = D(t[k]).toFixed(currencyDigits(currency));
  }
  const preserved = rows.flatMap((r) => r.sources).length;
  if (preserved !== input.length) throw new Error('Internal record conservation check failed');
  return {
    id: options.id || crypto.randomUUID(),
    name: options.name || 'Commission reconciliation',
    createdAt: options.now || new Date().toISOString(),
    config: structuredClone(config),
    engineVersion: ENGINE_VERSION,
    sample: options.sample || false,
    rows,
    totals,
    inputCount: input.length,
    validCount: valid.length,
    invalidCount: input.length - valid.length,
  };
}

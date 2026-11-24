import { z } from 'zod';
import { configSchema } from './validation';
import { ENGINE_VERSION, type Run } from './types';
import { reconcile } from './engine';
import { LIMITS } from './limits';
const text = z.string().max(2000);
const amount = z.string().regex(/^-?\d{1,40}(\.\d{1,12})?$/);
const source = z
  .object({
    id: z.string().min(1).max(1000),
    side: z.enum(['expected', 'received']),
    policy: text,
    carrier: text,
    agent: text,
    period: text,
    transaction: text,
    date: text,
    due: text,
    currency: text,
    amount: text,
    premium: text,
    errors: z.array(text).max(100),
    source: z
      .object({
        file: text,
        sheet: text,
        row: z.number().int().positive(),
        hash: text,
        raw: z.record(text, text).refine((r) => Object.keys(r).length <= 80),
      })
      .strict(),
  })
  .strict();
const total = z
  .object({
    expected: amount,
    received: amount,
    eligibleReceived: amount,
    duplicateAmount: amount,
    variance: amount,
    confirmedVariance: amount,
    potentialOutstanding: amount,
    unmatched: amount,
    underpayment: amount,
  })
  .strict();
const finding = z
  .object({
    id: z.string().min(1).max(2000000),
    outcome: z.enum([
      'matched',
      'missing',
      'underpaid',
      'overpaid',
      'duplicate',
      'unmatched',
      'reversal',
      'ambiguous',
      'invalid',
    ]),
    policy: text,
    carrier: text,
    period: text,
    currency: text,
    expected: amount,
    received: amount,
    variance: amount,
    evidence: z.string().max(20000),
    sources: z.array(source).min(1).max(LIMITS.totalRows),
    overdue: z.boolean(),
    review: z
      .array(
        z
          .object({
            status: z.enum([
              'Needs review',
              'Investigating',
              'Resolved',
              'Accepted adjustment',
              'Awaiting carrier response',
            ]),
            note: text,
            at: z.iso.datetime(),
            actor: text,
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
const schema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    createdAt: z.iso.datetime(),
    config: configSchema,
    engineVersion: z.string(),
    sample: z.boolean(),
    rows: z.array(finding).max(LIMITS.totalRows),
    totals: z.record(z.string().length(3), total),
    inputCount: z.number().int().min(0).max(LIMITS.totalRows),
    validCount: z.number().int().nonnegative(),
    invalidCount: z.number().int().nonnegative(),
  })
  .strict();
export const BACKUP_BYTES = 40 * 1024 * 1024;
/** Verifies internal consistency, not authenticity: source files and local notes are user-controlled. */
export function restoreBackup(json: string): Run {
  if (new TextEncoder().encode(json).byteLength > BACKUP_BYTES)
    throw new Error('Audit backup exceeds 40 MiB');
  const saved = schema.parse(JSON.parse(json));
  if (saved.engineVersion !== ENGINE_VERSION)
    throw new Error('This backup requires a different engine version');
  const input = saved.rows.flatMap((r) => r.sources);
  if (input.length !== saved.inputCount || input.length > LIMITS.totalRows)
    throw new Error('Backup source-row count is inconsistent');
  const recomputed = reconcile(input, saved.config, {
    name: saved.name,
    sample: saved.sample,
    now: saved.createdAt,
  });
  const previous = new Map(saved.rows.map((r) => [r.id, r]));
  if (previous.size !== saved.rows.length || recomputed.rows.length !== saved.rows.length)
    throw new Error('Backup finding groups are inconsistent');
  for (const r of recomputed.rows) {
    const old = previous.get(r.id);
    if (
      !old ||
      ['outcome', 'expected', 'received', 'variance', 'overdue'].some(
        (k) => r[k as keyof typeof r] !== old[k as keyof typeof old],
      )
    )
      throw new Error('Backup results do not agree with its source rows');
    r.review = old.review;
  }
  const currencies = Object.keys(recomputed.totals);
  if (
    currencies.length !== Object.keys(saved.totals).length ||
    currencies.some(
      (c) =>
        !saved.totals[c] ||
        Object.keys(recomputed.totals[c]).some(
          (k) =>
            recomputed.totals[c][k as keyof typeof total._output] !==
            saved.totals[c][k as keyof typeof total._output],
        ),
    ) ||
    recomputed.validCount !== saved.validCount ||
    recomputed.invalidCount !== saved.invalidCount
  )
    throw new Error('Backup totals do not agree with its source rows');
  // New ID prevents a restore from overwriting a saved run or silently replacing local decisions.
  return recomputed;
}

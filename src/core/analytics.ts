import type { Run } from './types';
import { D } from './money';
export function sourceBuckets(run: Run, currency: string, field: 'period' | 'carrier') {
  const values = new Map<string, { expected: string; received: string; count: number }>();
  for (const result of run.rows) {
    if (result.outcome === 'invalid') continue;
    for (const source of result.sources) {
      if (source.currency !== currency || source.errors.length) continue;
      const key = source[field] || (field === 'period' ? 'No period' : 'Unspecified');
      const bucket = values.get(key) || { expected: '0', received: '0', count: 0 };
      bucket[source.side] = D(bucket[source.side]).plus(source.amount).toString();
      bucket.count++;
      values.set(key, bucket);
    }
  }
  return values;
}

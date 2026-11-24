import { performance } from 'node:perf_hooks';
import { writeFile, mkdir } from 'node:fs/promises';
import { reconcile } from '../src/core/engine';
import { defaultConfig, type RecordRow } from '../src/core/types';
import { parseFile, normalizeFile } from '../src/core/import';
const cases = [];
for (const count of [1000, 5000, 25000, 50000]) {
  const rows: RecordRow[] = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    side: i % 2 ? 'received' : 'expected',
    policy: `POL-${Math.floor(i / 2)}`,
    carrier: `Carrier-${Math.floor(i / 2) % 10}`,
    agent: 'AG-1',
    period: '2026-11',
    transaction: i % 2 ? `PAY-${i}` : '',
    date: '2026-11-20',
    due: '2026-11-20',
    currency: 'USD',
    amount: '125.25',
    premium: '1252.50',
    source: {
      file: 'benchmark.csv',
      sheet: 'CSV',
      row: i + 2,
      hash: 'synthetic',
      raw: { Policy: `POL-${Math.floor(i / 2)}`, Amount: '125.25' },
    },
    errors: [],
  }));
  const times = [];
  let heapDelta = 0;
  for (let n = 0; n < 3; n++) {
    const before = process.memoryUsage().heapUsed,
      start = performance.now();
    const result = reconcile(rows, { ...defaultConfig(), asOf: '2026-11-22' });
    times.push(performance.now() - start);
    heapDelta = Math.max(heapDelta, process.memoryUsage().heapUsed - before);
    if (result.rows.length !== count / 2 || result.rows.some((r) => r.outcome !== 'matched'))
      throw new Error('Benchmark result validation failed');
  }
  const csv =
    'policy,carrier,period,currency,amount\n' +
    rows.map((r) => `${r.policy},${r.carrier},${r.period},USD,125.25`).join('\n');
  let parseMs: number | null = null;
  if (count <= 25000) {
    const start = performance.now();
    const f = await parseFile(
      { name: 'benchmark.csv', bytes: new TextEncoder().encode(csv).buffer },
      'received',
    );
    normalizeFile(f, defaultConfig());
    parseMs = performance.now() - start;
  }
  cases.push({
    sourceRows: count,
    reconciliationMs: times.map((t) => Math.round(t)),
    peakObservedHeapDeltaMiB: Math.round((heapDelta / 1048576) * 10) / 10,
    csvBytes: Buffer.byteLength(csv),
    parseAndNormalizeMs: parseMs ? Math.round(parseMs) : null,
  });
}
const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  scope:
    'Synthetic Node benchmark, not a browser/device guarantee. 50k is exploratory engine-only and not exposed as a release limit.',
  guardrail: { sourceRows: 25000, fileMiB: 10, expandedWorkbookMiB: 40, files: 10 },
  cases,
};
await mkdir('docs', { recursive: true });
await writeFile('docs/benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

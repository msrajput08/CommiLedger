import Papa from 'papaparse';
import type { Run } from './types';
import { labels } from './types';
export function resultCsv(run: Run, issuesOnly = false): string {
  return (
    '\uFEFF' +
    Papa.unparse(
      run.rows
        .filter((r) => !issuesOnly || r.outcome !== 'matched')
        .map((r) => ({
          'Run ID': run.id,
          'Synthetic sample': run.sample ? 'Yes' : 'No',
          'Engine version': run.engineVersion,
          'As of': run.config.asOf,
          Policy: r.policy,
          Carrier: r.carrier,
          Period: r.period,
          Currency: r.currency,
          Expected: r.expected,
          Received: r.received,
          'Variance (received - expected)': r.variance,
          Finding: labels[r.outcome],
          Explanation: r.evidence,
          'Review status': r.review.at(-1)?.status || 'Needs review',
          'Latest note': r.review.at(-1)?.note || '',
          'Source rows': r.sources
            .map((s) => `${s.source.file} / ${s.source.sheet} / row ${s.source.row}`)
            .join('; '),
          'Source SHA256': Array.from(new Set(r.sources.map((s) => s.source.hash))).join('; '),
        })),
      { escapeFormulae: true },
    )
  );
}
export function download(content: string, name: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const templateCsv = (side: 'expected' | 'received') =>
  Papa.unparse([
    {
      policy: 'POL-1001',
      carrier: 'Your carrier',
      agent: 'AGENT-01',
      period: '2026-11',
      transaction: side === 'received' ? 'PAY-1001' : '',
      date: side === 'received' ? '2026-11-20' : '2026-11-01',
      due: side === 'expected' ? '2026-11-20' : '',
      currency: 'USD',
      amount: '125.00',
      premium: '1250.00',
    },
  ]);

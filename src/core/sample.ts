import type { ImportFile, Side } from './types';
import { suggestMapping } from './import';
// Intentionally synthetic. Never mixed with a user's imported workspace.
export const sampleFiles = (): ImportFile[] => {
  const headers = [
    'Policy Number',
    'Carrier',
    'Agent',
    'Period',
    'Transaction ID',
    'Transaction Date',
    'Due Date',
    'Currency',
    'Commission',
    'Premium',
  ];
  const expected: string[][] = [],
    received: string[][] = [];
  const carriers = ['Harbor Mutual', 'Northstar Life', 'Summit Assurance', 'Cedar & Co.'];
  for (let i = 0; i < 48; i++) {
    const amount = (450 + (i % 8) * 125).toFixed(2),
      policy = `POL-${24001 + i}`,
      carrier = carriers[i % 4],
      period = `2026-${String(8 + Math.floor(i / 12)).padStart(2, '0')}`;
    const base = [
      policy,
      carrier,
      `AG-${(i % 3) + 1}`,
      period,
      '',
      `${period}-15`,
      `${period}-20`,
      'USD',
      amount,
      '10000.00',
    ];
    expected.push(base);
    if (i % 11 === 0) continue;
    const p = [...base];
    p[4] = `PAY-${10000 + i}`;
    p[6] = '';
    if (i % 9 === 0) p[8] = (Number(amount) - 175).toFixed(2);
    if (i % 13 === 0) p[8] = (Number(amount) + 50).toFixed(2);
    if (i === 17) p[8] = '-250.00';
    received.push(p);
    if (i === 22) received.push([...p]);
    if (i === 31) {
      p[8] = (Number(amount) / 2).toFixed(2);
      const split = [...p];
      split[4] += '-B';
      received.push(split);
    }
  }
  received.push([
    'POL-UNKNOWN',
    'Harbor Mutual',
    'AG-1',
    '2026-11',
    'PAY-EXTRA',
    '2026-11-15',
    '',
    'USD',
    '320.00',
    '',
  ]);
  return (['expected', 'received'] as Side[]).map((side) => ({
    id: `sample-${side}`,
    name: `sample-${side}.csv`,
    hash: 'synthetic-sample-v1',
    sheets: [{ name: 'CSV', rows: [headers, ...(side === 'expected' ? expected : received)] }],
    side,
    sheet: 0,
    header: 0,
    mapping: suggestMapping(headers).mapping,
    warnings: ['Synthetic sample data for product exploration.'],
  }));
};

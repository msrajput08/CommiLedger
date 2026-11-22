export type Side = 'expected' | 'received';
export type Field =
  | 'policy'
  | 'carrier'
  | 'agent'
  | 'period'
  | 'transaction'
  | 'date'
  | 'due'
  | 'currency'
  | 'amount'
  | 'premium';
export type MatchField =
  'policy' | 'carrier' | 'agent' | 'period' | 'transaction' | 'date' | 'premium';
export type Mapping = Partial<Record<Field, number>>;
export type Source = {
  file: string;
  sheet: string;
  row: number;
  hash: string;
  raw: Record<string, string>;
};
export type RecordRow = {
  id: string;
  side: Side;
  policy: string;
  carrier: string;
  agent: string;
  period: string;
  transaction: string;
  date: string;
  due: string;
  currency: string;
  amount: string;
  premium: string;
  source: Source;
  errors: string[];
};
export type Outcome =
  | 'matched'
  | 'missing'
  | 'underpaid'
  | 'overpaid'
  | 'duplicate'
  | 'unmatched'
  | 'reversal'
  | 'ambiguous'
  | 'invalid';
export type ReviewStatus =
  | 'Needs review'
  | 'Investigating'
  | 'Resolved'
  | 'Accepted adjustment'
  | 'Awaiting carrier response';
export type Review = { status: ReviewStatus; note: string; at: string; actor: string };
export type ResultRow = {
  id: string;
  outcome: Outcome;
  policy: string;
  carrier: string;
  period: string;
  currency: string;
  expected: string;
  received: string;
  variance: string;
  evidence: string;
  sources: RecordRow[];
  overdue: boolean;
  review: Review[];
};
export type Config = {
  version: 1;
  keys: MatchField[];
  tolerance: string;
  asOf: string;
  coverageStart: string;
  coverageEnd: string;
  completeStatement: boolean;
  locale: string;
  dateFormat: 'YMD' | 'DMY' | 'MDY';
  currency: string;
  timeZone: string;
  caseSensitive: boolean;
  expectedRule?: { profileId: string; profileVersion: number; name: string; rule: Rule };
};
export type Totals = {
  expected: string;
  received: string;
  eligibleReceived: string;
  duplicateAmount: string;
  variance: string;
  confirmedVariance: string;
  potentialOutstanding: string;
  unmatched: string;
  underpayment: string;
};
export type Run = {
  id: string;
  name: string;
  createdAt: string;
  config: Config;
  engineVersion: string;
  sample: boolean;
  rows: ResultRow[];
  totals: Record<string, Totals>;
  inputCount: number;
  validCount: number;
  invalidCount: number;
};
export type Sheet = { name: string; rows: string[][] };
export type ImportFile = {
  id: string;
  name: string;
  hash: string;
  sheets: Sheet[];
  sheet: number;
  header: number;
  mapping: Mapping;
  warnings: string[];
  side: Side;
};
export type Rule = {
  kind: 'percentage' | 'fixed' | 'tiered';
  rate: string;
  fixed: string;
  tiers: { upTo: string; rate: string }[];
  split: string;
  fee: string;
  taxRate: string;
  adjustment: string;
  rounding: 'half-up' | 'half-even' | 'down';
};
export type Profile = {
  id: string;
  name: string;
  country: string;
  currency: string;
  config: Config;
  rule: Rule;
  mappingHeaders: Partial<Record<Side, Partial<Record<Field, string>>>>;
  version: number;
  archived: boolean;
  updatedAt: string;
};
export const ENGINE_VERSION = '1.0.0';
export const defaultConfig = (): Config => ({
  version: 1,
  keys: ['policy', 'carrier', 'period'],
  tolerance: '0.01',
  asOf: new Date().toISOString().slice(0, 10),
  coverageStart: '',
  coverageEnd: '',
  completeStatement: false,
  locale: 'en-US',
  dateFormat: 'YMD',
  currency: 'USD',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  caseSensitive: true,
});
export const defaultRule = (): Rule => ({
  kind: 'percentage',
  rate: '10',
  fixed: '0',
  tiers: [],
  split: '100',
  fee: '0',
  taxRate: '0',
  adjustment: '0',
  rounding: 'half-up',
});
export const labels: Record<Outcome, string> = {
  matched: 'Matched',
  missing: 'Missing in statement',
  underpaid: 'Underpaid',
  overpaid: 'Overpaid',
  duplicate: 'Possible duplicate',
  unmatched: 'Unmatched payment',
  reversal: 'Reversal / clawback',
  ambiguous: 'Ambiguous match',
  invalid: 'Invalid record',
};

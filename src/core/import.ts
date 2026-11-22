import Papa from 'papaparse';
import { unzipSync } from 'fflate';
import readXlsxFile, { readSheetNames } from 'read-excel-file/web-worker';
import { parseDate } from './dates';
import { parseMoney, calculateCommission } from './money';
import type { Config, Field, ImportFile, Mapping, RecordRow, Side } from './types';
export const LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  expandedBytes: 40 * 1024 * 1024,
  totalRows: 25000,
  columns: 80,
  files: 10,
  cellChars: 2000,
};
export const aliases: Record<Field, string[]> = {
  policy: ['policy', 'policy number', 'policy id', 'contract number'],
  carrier: ['carrier', 'carrier name', 'insurance company', 'insurer'],
  agent: ['agent', 'agent id', 'producer', 'broker'],
  period: ['period', 'commission period', 'reporting period'],
  transaction: ['transaction', 'transaction id', 'payment id', 'reference'],
  date: ['date', 'statement date', 'transaction date', 'payment date'],
  due: ['due', 'due date', 'expected payment date'],
  currency: ['currency', 'currency code', 'ccy'],
  amount: [
    'amount',
    'commission',
    'commission amount',
    'payment',
    'compensation',
    'expected commission',
    'received commission',
  ],
  premium: ['premium', 'written premium', 'net premium'],
};
const clean = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');
export function suggestMapping(headers: string[]): { mapping: Mapping; warnings: string[] } {
  const mapping: Mapping = {},
    warnings: string[] = [];
  for (const [field, names] of Object.entries(aliases)) {
    const matches = headers
      .map((h, i) => (names.includes(clean(h)) ? i : -1))
      .filter((i) => i >= 0);
    if (matches.length === 1) mapping[field as Field] = matches[0];
    else if (matches.length > 1)
      warnings.push(
        `Choose ${field}: multiple columns match (${matches.map((i) => headers[i]).join(', ')}).`,
      );
  }
  return { mapping, warnings };
}
export function detectHeader(rows: string[][]): number {
  let best = 0,
    score = 0;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const count = Object.keys(suggestMapping(rows[i]).mapping).length;
    if (count > score) {
      best = i;
      score = count;
    }
  }
  return best;
}
export function validateSheet(rows: string[][]) {
  if (rows.length > LIMITS.totalRows + 20)
    throw new Error(`File exceeds ${LIMITS.totalRows.toLocaleString()} rows`);
  if (!rows.length) throw new Error('File contains no rows');
  if (rows.some((r) => r.length > LIMITS.columns))
    throw new Error(`Maximum ${LIMITS.columns} columns`);
  if (rows.some((r) => r.some((c) => c.length > LIMITS.cellChars)))
    throw new Error(`A cell exceeds ${LIMITS.cellChars} characters`);
}
export function checkZip(bytes: Uint8Array) {
  let expanded = 0,
    count = 0;
  // fflate's filter runs before decompression. Rejected/oversize archives never reach the XLSX reader.
  unzipSync(bytes, {
    filter: (entry) => {
      count++;
      expanded += entry.originalSize;
      if (
        entry.originalSize > LIMITS.expandedBytes ||
        expanded > LIMITS.expandedBytes ||
        count > 1000
      )
        throw new Error('Workbook expands beyond safe import limits');
      if (/vbaProject|externalLinks\//i.test(entry.name))
        throw new Error('Macro or externally linked workbooks are not supported');
      return false;
    },
  });
}
export async function parseFile(
  file: { name: string; bytes: ArrayBuffer },
  side: Side,
): Promise<ImportFile> {
  if (file.bytes.byteLength > LIMITS.fileBytes) throw new Error('Maximum file size is 10 MiB');
  const bytes = new Uint8Array(file.bytes),
    warnings: string[] = [];
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  let sheets: { name: string; rows: string[][] }[] = [];
  if (/\.csv$/i.test(file.name)) {
    let encoding = 'utf-8';
    if (bytes[0] === 255 && bytes[1] === 254) encoding = 'utf-16le';
    else if (bytes[0] === 254 && bytes[1] === 255) encoding = 'utf-16be';
    let source: string;
    try {
      source = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Unknown text encoding. Re-save as UTF-8 CSV; nothing was guessed.');
    }
    const parsed = Papa.parse<string[]>(source, { skipEmptyLines: false });
    const errors = parsed.errors.filter((e) => e.code !== 'UndetectableDelimiter');
    if (errors.length)
      throw new Error(errors.map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`).join('; '));
    sheets = [{ name: 'CSV', rows: parsed.data }];
    warnings.push(
      `Detected delimiter ${parsed.meta.delimiter === '\t' ? 'tab' : JSON.stringify(parsed.meta.delimiter)}; ${encoding.toUpperCase()}.`,
    );
  } else if (/\.xlsx$/i.test(file.name)) {
    checkZip(bytes);
    const names = await readSheetNames(file.bytes);
    for (const name of names) {
      const rows = await readXlsxFile(file.bytes, { sheet: name });
      sheets.push({
        name,
        rows: rows.map((row) =>
          row.map((cell) =>
            cell instanceof Date
              ? cell.toISOString().slice(0, 10)
              : cell === null
                ? ''
                : String(cell),
          ),
        ),
      });
    }
    warnings.push(
      'Excel numeric identifiers may have lost leading zeros. Use text cells for policy IDs. Recalculate formula cells in Excel before import; formula definitions are not evaluated here.',
    );
  } else throw new Error('Choose a CSV or XLSX file. Other formats are not supported.');
  let total = 0;
  for (const sheet of sheets) {
    validateSheet(sheet.rows);
    total += sheet.rows.length;
  }
  if (total > LIMITS.totalRows + 20 * sheets.length)
    throw new Error('Workbook exceeds the total row limit');
  const header = detectHeader(sheets[0].rows);
  const guessed = suggestMapping(sheets[0].rows[header]);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    hash,
    sheets,
    sheet: 0,
    header,
    mapping: guessed.mapping,
    warnings: [...warnings, ...guessed.warnings],
    side,
  };
}
export function normalizeFile(file: ImportFile, config: Config): RecordRow[] {
  const sheet = file.sheets[file.sheet];
  if (!sheet) throw new Error('Choose an available worksheet');
  const headers = sheet.rows[file.header];
  if (!headers) throw new Error('Choose a valid header row');
  const indexes = Object.values(file.mapping);
  if (new Set(indexes).size !== indexes.length)
    throw new Error('Each column can map to only one field');
  const derive =
    file.side === 'expected' && file.mapping.amount === undefined && !!config.expectedRule;
  if (file.mapping.amount === undefined && !derive)
    throw new Error(
      `${file.name}: map the commission amount column, or explicitly select a saved rule to calculate expected commissions from premium`,
    );
  if (derive && file.mapping.premium === undefined)
    throw new Error('Map the premium column to use the selected commission rule');
  if (file.mapping.currency === undefined && !config.currency)
    throw new Error('Select a default currency or map the currency column');
  const results: RecordRow[] = [];
  for (let i = file.header + 1; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i];
    if (raw.every((c) => !c.trim())) continue;
    const get = (f: Field) =>
      file.mapping[f] === undefined ? '' : (raw[file.mapping[f]!] ?? '').trim();
    const r: RecordRow = {
      id: `${file.id}:${file.sheet}:${i + 1}`,
      side: file.side,
      policy: get('policy'),
      carrier: get('carrier'),
      agent: get('agent'),
      period: get('period'),
      transaction: get('transaction'),
      date: get('date'),
      due: get('due'),
      currency: (get('currency') || config.currency).toUpperCase(),
      amount: get('amount'),
      premium: get('premium'),
      source: {
        file: file.name,
        sheet: sheet.name,
        row: i + 1,
        hash: file.hash,
        raw: Object.fromEntries(raw.map((v, c) => [`${c + 1}: ${headers[c] || 'Unnamed'}`, v])),
      },
      errors: [],
    };
    if (!derive)
      try {
        r.amount = parseMoney(r.amount, r.currency, config.locale);
      } catch (e) {
        r.errors.push((e as Error).message);
      }
    if (r.premium)
      try {
        r.premium = parseMoney(r.premium, r.currency, config.locale);
      } catch (e) {
        r.errors.push(`Premium: ${(e as Error).message}`);
      }
    if (derive)
      try {
        if (r.currency !== config.currency)
          throw new Error('Rule currency does not match this row; use a separate carrier workflow');
        if (!r.premium) throw new Error('Premium is missing');
        if (!r.errors.length)
          r.amount = calculateCommission(r.premium, r.currency, config.expectedRule!.rule);
      } catch (e) {
        r.errors.push(`Calculated commission: ${(e as Error).message}`);
      }
    for (const k of ['date', 'due'] as const)
      try {
        r[k] = parseDate(r[k], config.dateFormat);
      } catch (e) {
        r.errors.push(`${k}: ${(e as Error).message}`);
      }
    if (r.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period))
      r.errors.push('Period must use YYYY-MM. Map transaction date separately.');
    results.push(r);
  }
  return results;
}

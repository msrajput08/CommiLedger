import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import Papa from 'papaparse';
import {
  parseFile,
  normalizeFile,
  suggestMapping,
  detectHeader,
  LIMITS,
  checkZip,
} from '../src/core/import';
import { reconcile } from '../src/core/engine';
import { defaultConfig } from '../src/core/types';
import { resultCsv } from '../src/core/export';
import { sampleFiles } from '../src/core/sample';
export function workbook() {
  const xml: Record<string, string> = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Commission" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Policy Number</t></is></c><c r="B1" t="inlineStr"><is><t>Commission</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>001-A</t></is></c><c r="B2"><v>100.25</v></c></row></sheetData></worksheet>',
  };
  return zipSync(Object.fromEntries(Object.entries(xml).map(([k, v]) => [k, strToU8(v)])))
    .buffer as ArrayBuffer;
}
describe('actual file imports', () => {
  it('parses delimiter, unicode and leading zero IDs', async () => {
    const file = await parseFile(
      {
        name: 'test.csv',
        bytes: new TextEncoder().encode(
          'Policy Number;Carrier;Period;Commission;Currency\n001-A;Étoile;2026-11;100,25;EUR',
        ).buffer,
      },
      'expected',
    );
    const rows = normalizeFile(file, { ...defaultConfig(), locale: 'de-DE' });
    expect(rows[0].policy).toBe('001-A');
    expect(rows[0].amount).toBe('100.25');
    expect(rows[0].source.row).toBe(2);
    expect(rows[0].source.hash).toHaveLength(64);
  });
  it('reads an actual XLSX ZIP preserving text IDs', async () => {
    const file = await parseFile({ name: 'test.xlsx', bytes: workbook() }, 'expected');
    expect(file.sheets[0].name).toBe('Commission');
    expect(file.sheets[0].rows[1]).toEqual(['001-A', '100.25']);
  });
  it('declines ambiguous amount columns', () => {
    const r = suggestMapping(['Policy Number', 'Payment', 'Commission']);
    expect(r.mapping.amount).toBeUndefined();
    expect(r.warnings).toHaveLength(1);
  });
  it('detects a header beneath a carrier title', () =>
    expect(
      detectHeader([['Carrier export'], [], ['Policy Number', 'Commission', 'Currency']]),
    ).toBe(2));
  it('rejects unsupported file formats', async () =>
    expect(
      parseFile({ name: 'file.pdf', bytes: new ArrayBuffer(1) }, 'received'),
    ).rejects.toThrow());
  it('rejects malformed CSV quoting', async () =>
    expect(
      parseFile(
        { name: 'bad.csv', bytes: new TextEncoder().encode('policy,amount\n"a,10').buffer },
        'expected',
      ),
    ).rejects.toThrow());
  it('rejects unknown encoding instead of silently replacing characters', async () =>
    expect(
      parseFile({ name: 'bad.csv', bytes: new Uint8Array([0xc3, 0x28]).buffer }, 'expected'),
    ).rejects.toThrow('encoding'));
  it('rejects files beyond the byte limit before parsing', async () =>
    expect(
      parseFile({ name: 'big.xlsx', bytes: new ArrayBuffer(LIMITS.fileBytes + 1) }, 'received'),
    ).rejects.toThrow('10 MiB'));
  it('rejects macro workbook contents', () =>
    expect(() => checkZip(zipSync({ 'xl/vbaProject.bin': strToU8('bad') }))).toThrow('Macro'));
  it('rejects duplicate mapping assignments', () => {
    const file = sampleFiles()[0];
    file.mapping.carrier = file.mapping.policy;
    expect(() => normalizeFile(file, defaultConfig())).toThrow('only one');
  });
  it('runs sample through actual parser normalization and engine', () => {
    const files = sampleFiles(),
      config = { ...defaultConfig(), asOf: '2026-11-22' },
      rows = files.flatMap((f) => normalizeFile(f, config));
    const run = reconcile(rows, config, { sample: true });
    expect(run.invalidCount).toBe(0);
    expect(run.rows.some((r) => r.outcome === 'underpaid')).toBe(true);
    expect(run.rows.flatMap((r) => r.sources)).toHaveLength(rows.length);
  });
  it('neutralizes spreadsheet formulas in exports', () => {
    const config = defaultConfig(),
      files = sampleFiles(),
      rows = files.flatMap((f) => normalizeFile(f, config));
    rows[0].policy = '=HYPERLINK("https://bad")';
    const csv = resultCsv(reconcile(rows, config));
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true });
    expect(parsed.data.some((r) => r.Policy?.startsWith("'=HYPERLINK"))).toBe(true);
  });
});

export function parseDate(value: string, format: 'YMD' | 'DMY' | 'MDY'): string {
  if (!value.trim()) return '';
  const s = value.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    [, y, m, d] = iso.map(Number);
  } else {
    const a = /^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/.exec(s);
    if (!a) throw new Error('Date must be YYYY-MM-DD or use the selected date convention');
    const parts = a.slice(1).map(Number);
    [y, m, d] =
      format === 'YMD'
        ? parts
        : format === 'DMY'
          ? [parts[2], parts[1], parts[0]]
          : [parts[2], parts[0], parts[1]];
  }
  if (y! < 1900 || y! > 2200 || m! < 1 || m! > 12 || d! < 1 || d! > 31)
    throw new Error('Invalid date');
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (dt.getUTCMonth() !== m! - 1 || dt.getUTCDate() !== d)
    throw new Error('Invalid calendar date');
  return `${y!}-${String(m!).padStart(2, '0')}-${String(d!).padStart(2, '0')}`;
}

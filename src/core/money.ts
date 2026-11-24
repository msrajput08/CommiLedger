import Decimal from 'decimal.js';
import type { Rule } from './types';
Decimal.set({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export const D = (n: string | number) => new Decimal(n);
const currencies = new Set(Intl.supportedValuesOf('currency'));
const digitCache = new Map<string, number>();
export function currencyDigits(currency: string): number {
  if (!currencies.has(currency)) throw new Error(`Unknown ISO currency: ${currency}`);
  if (!digitCache.has(currency))
    digitCache.set(
      currency,
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits!,
    );
  return digitCache.get(currency)!;
}
export function parseMoney(value: string, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  let s = value.trim().replace(/\u00a0|\u202f/g, ' ');
  if (!s) throw new Error('Amount is missing');
  if (s.length > 80) throw new Error('Amount is too long');
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.89);
  const decimal = parts.find((x) => x.type === 'decimal')?.value || '.';
  const group = (parts.find((x) => x.type === 'group')?.value || ',').replace(
    /\u00a0|\u202f/g,
    ' ',
  );
  // Only an explicit matching ISO code is accepted; currency symbols are ambiguous.
  s = s.replace(new RegExp(`^${currency}\\s*|\\s*${currency}$`, 'g'), '');
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
  const negative = s.startsWith('-');
  if (/^[+-]/.test(s)) s = s.slice(1);
  const halves = s.split(decimal);
  if (halves.length > 2) throw new Error('Ambiguous decimal separators');
  let whole = halves[0];
  const fraction = halves[1] ?? '';
  if (whole.includes(group)) {
    const groups = whole.split(group);
    const valid =
      locale === 'en-IN'
        ? /^[0-9]{1,2}(?:,[0-9]{2})*,[0-9]{3}$/.test(whole)
        : groups.every((g, i) => new RegExp(i ? '^[0-9]{3}$' : '^[0-9]{1,3}$').test(g));
    if (!valid) throw new Error(`Invalid grouping for ${locale}`);
    whole = groups.join('');
  }
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || (halves.length === 2 && !fraction))
    throw new Error(`Invalid number for ${locale}; use an ISO currency column, not symbols`);
  if (fraction.length > digits)
    throw new Error(
      `${currency} allows ${digits} decimal places; imported amounts are never rounded silently`,
    );
  if (whole.length > 24) throw new Error('Amount exceeds supported precision (24 integer digits)');
  return D(`${negative ? '-' : ''}${whole}.${fraction || '0'}`).toFixed(digits);
}
export function decimalInput(s: string, label = 'Value') {
  if (!/^-?\d{1,24}(\.\d{1,12})?$/.test(s))
    throw new Error(`${label} must be a plain decimal number`);
  return D(s);
}
export function validateRule(rule: Rule) {
  if (
    !['percentage', 'fixed', 'tiered'].includes(rule.kind) ||
    !['half-up', 'half-even', 'down'].includes(rule.rounding)
  )
    throw new Error('Invalid rule type or rounding');
  for (const k of ['rate', 'fixed', 'split', 'fee', 'taxRate', 'adjustment'] as const)
    decimalInput(rule[k], k);
  if (
    D(rule.split).lt(0) ||
    D(rule.split).gt(100) ||
    D(rule.rate).lt(0) ||
    D(rule.rate).gt(1000) ||
    D(rule.taxRate).lt(0) ||
    D(rule.taxRate).gt(100) ||
    D(rule.fee).lt(0)
  )
    throw new Error('Split must be 0–100%, rate 0–1000%, tax 0–100%, fee nonnegative');
  if (rule.tiers.length > 50) throw new Error('Maximum 50 tiers');
  let previous = D(0);
  for (const tier of rule.tiers) {
    const up = decimalInput(tier.upTo, 'Tier ceiling');
    const rate = decimalInput(tier.rate, 'Tier rate');
    if (up.lte(previous) || rate.lt(0) || rate.gt(1000))
      throw new Error('Tier ceilings must increase and rates must be 0–1000%');
    previous = up;
  }
  if (rule.kind === 'tiered' && !rule.tiers.length)
    throw new Error('At least one tier is required');
}
export function calculateCommission(premium: string, currency: string, rule: Rule): string {
  validateRule(rule);
  const p = decimalInput(premium, 'Premium');
  let base = D(0);
  if (rule.kind === 'fixed') base = D(rule.fixed);
  if (rule.kind === 'percentage') base = p.mul(rule.rate).div(100);
  if (rule.kind === 'tiered') {
    let prev = D(0),
      remaining = p.abs();
    for (const tier of rule.tiers) {
      const width = Decimal.min(remaining, D(tier.upTo).minus(prev));
      base = base.plus(width.mul(tier.rate).div(100));
      remaining = remaining.minus(width);
      prev = D(tier.upTo);
      if (remaining.isZero()) break;
    }
    if (remaining.gt(0)) throw new Error('Premium exceeds the last configured tier');
    if (p.isNegative()) base = base.negated();
  }
  const total = base
    .minus(rule.fee)
    .mul(D(1).plus(D(rule.taxRate).div(100)))
    .plus(rule.adjustment)
    .mul(rule.split)
    .div(100);
  return total.toFixed(
    currencyDigits(currency),
    {
      'half-up': Decimal.ROUND_HALF_UP,
      'half-even': Decimal.ROUND_HALF_EVEN,
      down: Decimal.ROUND_DOWN,
    }[rule.rounding],
  );
}
export function money(value: string, currency: string, locale = 'en-US'): string {
  // Never turn large financial values into imprecise Number values just to display them.
  const number = D(value),
    negative = number.isNegative(),
    fixed = number.abs().toFixed(currencyDigits(currency));
  const [whole, fraction] = fixed.split('.');
  const p = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).formatToParts(negative ? -1 : 1);
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(whole));
  return p
    .map((x) =>
      x.type === 'integer'
        ? grouped
        : x.type === 'fraction'
          ? fraction
          : x.type === 'group'
            ? ''
            : x.value,
    )
    .join('');
}

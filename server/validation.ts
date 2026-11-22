import { z } from 'zod';
const decimal = z.string().regex(/^-?\d{1,24}(\.\d{1,12})?$/);
export const ruleSchema = z
  .object({
    kind: z.enum(['percentage', 'fixed', 'tiered']),
    rate: decimal,
    fixed: decimal,
    tiers: z.array(z.object({ upTo: decimal, rate: decimal }).strict()).max(50),
    split: decimal,
    fee: decimal,
    taxRate: decimal,
    adjustment: decimal,
    rounding: z.enum(['half-up', 'half-even', 'down']),
  })
  .strict();
export const configSchema = z
  .object({
    version: z.literal(1),
    keys: z
      .array(z.enum(['policy', 'carrier', 'agent', 'period', 'transaction', 'date', 'premium']))
      .min(1)
      .max(7),
    tolerance: decimal,
    asOf: z.string().max(10),
    coverageStart: z.string().max(10),
    coverageEnd: z.string().max(10),
    completeStatement: z.boolean(),
    locale: z.string().max(20),
    dateFormat: z.enum(['YMD', 'DMY', 'MDY']),
    currency: z.string().length(3),
    timeZone: z.string().max(100),
    caseSensitive: z.boolean(),
    expectedRule: z
      .object({
        profileId: z.string().max(100),
        profileVersion: z.number().int().positive(),
        name: z.string().max(100),
        rule: ruleSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
const fields = z.enum([
  'policy',
  'carrier',
  'agent',
  'period',
  'transaction',
  'date',
  'due',
  'currency',
  'amount',
  'premium',
]);
const mapping = z.partialRecord(fields, z.string().max(200));
export const profileSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
    name: z.string().trim().min(1).max(100),
    country: z.string().max(80),
    currency: z.string().length(3),
    config: configSchema,
    rule: ruleSchema,
    mappingHeaders: z
      .object({ expected: mapping.optional(), received: mapping.optional() })
      .strict(),
    version: z.number().int().nonnegative().max(1000000),
    archived: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

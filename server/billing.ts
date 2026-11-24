import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { z } from 'zod';
import type { Env } from './env';
export type Plan = 'free' | 'plus' | 'pro';
export const paddle = (env: Env) =>
  new Paddle(env.PADDLE_API_KEY!, {
    environment: env.PADDLE_ENV === 'production' ? Environment.production : Environment.sandbox,
  });
export async function planFor(
  db: D1Database,
  userId: string,
  now = new Date().toISOString(),
): Promise<Plan> {
  const all = await db
    .prepare(
      "SELECT plan FROM subscriptions WHERE user_id=? AND status='active' AND paid_through>? ORDER BY CASE plan WHEN 'pro' THEN 2 WHEN 'plus' THEN 1 ELSE 0 END DESC LIMIT 1",
    )
    .bind(userId, now)
    .first<{ plan: Plan }>();
  return all?.plan || 'free';
}
export const features = (plan: Plan) => ({
  plan,
  cloudProfiles: plan !== 'free',
  cloudHistory: plan !== 'free',
  workflowTemplates: plan === 'pro',
  auditExport: plan === 'pro',
});
const eventSchema = z.object({
  event_id: z.string().min(1).max(100),
  event_type: z.string(),
  occurred_at: z.iso.datetime(),
  data: z.object({
    id: z.string().min(1),
    customer_id: z.string(),
    status: z.enum(['active', 'trialing', 'past_due', 'paused', 'canceled']),
    custom_data: z.object({ user_id: z.string(), checkout_ref: z.string() }).nullable().optional(),
    items: z.array(z.object({ price: z.object({ id: z.string() }) })),
    current_billing_period: z.object({ ends_at: z.iso.datetime() }).nullable().optional(),
  }),
});
// Signature is verified by Paddle's SDK before this function is called.
export async function applySubscriptionEvent(db: D1Database, env: Env, raw: unknown) {
  const event = eventSchema.parse(raw);
  if (!event.event_type.startsWith('subscription.')) return;
  const existing = await db
    .prepare('SELECT user_id,customer_id FROM subscriptions WHERE id=?')
    .bind(event.data.id)
    .first<{ user_id: string; customer_id: string }>();
  let userId = existing?.user_id;
  if (existing && existing.customer_id !== event.data.customer_id)
    throw new Error('Subscription customer mismatch');
  if (!userId) {
    const custom = event.data.custom_data;
    if (!custom) throw new Error('Subscription has no server checkout reference');
    const checkout = await db
      .prepare('SELECT user_id FROM checkout_intents WHERE id=? AND user_id=?')
      .bind(custom.checkout_ref, custom.user_id)
      .first<{ user_id: string }>();
    if (!checkout) throw new Error('Unknown checkout reference');
    userId = checkout.user_id;
  }
  const prices = event.data.items.map((i) => i.price.id);
  const plan = prices.includes(env.PADDLE_PRO_PRICE_ID || '__unset__')
    ? 'pro'
    : prices.includes(env.PADDLE_PLUS_PRICE_ID || '__unset__')
      ? 'plus'
      : 'free';
  const status = plan === 'free' ? 'paused' : event.data.status;
  // A single D1 atomic batch makes event insertion + entitlement update idempotent, including retries.
  await db.batch([
    db
      .prepare('INSERT OR IGNORE INTO webhook_events(id,occurred_at,received_at) VALUES(?,?,?)')
      .bind(event.event_id, event.occurred_at, new Date().toISOString()),
    db
      .prepare(
        `INSERT INTO subscriptions(id,user_id,customer_id,plan,status,paid_through,event_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET plan=excluded.plan,status=excluded.status,paid_through=excluded.paid_through,event_at=excluded.event_at WHERE excluded.event_at>subscriptions.event_at`,
      )
      .bind(
        event.data.id,
        userId,
        event.data.customer_id,
        plan,
        status,
        event.data.current_billing_period?.ends_at || null,
        event.occurred_at,
      ),
  ]);
}

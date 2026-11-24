import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { createAuth } from './auth';
import { authReady, billingReady, type Env } from './env';
import { paddle, planFor, features, applySubscriptionEvent } from './billing';
import { validateConfig } from '../src/core/engine';
import { validateRule } from '../src/core/money';
import { profileSchema } from './validation';
import { validateWorkflow } from '../src/core/workflows';
type Variables = {
  user: { id: string; email: string; name: string; emailVerified: boolean };
  plan: 'free' | 'plus' | 'pro';
};
export const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
    referrerPolicy: 'no-referrer',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }),
);
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: 'Request exceeds 1 MiB' }, 413),
  }),
);
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
    c.req.path !== '/api/billing/webhook' &&
    c.req.header('origin') !== c.env.APP_URL
  )
    return c.json({ error: 'Invalid request origin' }, 403);
  await next();
});
app.get('/api/health', (c) => c.json({ ok: true, service: 'commiledger', version: '0.1.0' }));
app.get('/api/status', (c) =>
  c.json({
    accounts: authReady(c.env),
    billing: billingReady(c.env),
    billingEnvironment: c.env.PADDLE_ENV || 'sandbox',
    supportEmail: c.env.SUPPORT_EMAIL || null,
  }),
);
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  if (!authReady(c.env))
    return c.json(
      {
        error:
          'Accounts are not configured on this installation. Local reconciliation is available.',
      },
      503,
    );
  return createAuth(c.env).handler(c.req.raw);
});
app.post('/api/billing/webhook', async (c) => {
  if (!billingReady(c.env)) return c.json({ error: 'Billing is not configured' }, 503);
  const raw = await c.req.text();
  const signature = c.req.header('paddle-signature');
  if (!signature) return c.json({ error: 'Missing signature' }, 401);
  try {
    await paddle(c.env).webhooks.unmarshal(raw, c.env.PADDLE_WEBHOOK_SECRET!, signature);
  } catch {
    return c.json({ error: 'Invalid webhook signature' }, 401);
  }
  const event = JSON.parse(raw);
  if (typeof event.event_type !== 'string') return c.json({ error: 'Invalid event' }, 400);
  if (event.event_type.startsWith('subscription.'))
    await applySubscriptionEvent(c.env.DB, c.env, event);
  return c.json({ received: true });
});
app.use('/api/account/*', async (c, next) => {
  if (!authReady(c.env)) return c.json({ error: 'Accounts are not configured' }, 503);
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || !session.user.emailVerified)
    return c.json({ error: 'A verified account is required' }, 401);
  c.set('user', session.user);
  c.set('plan', await planFor(c.env.DB, session.user.id));
  // Account-scoped writes are bounded even across worker isolates.
  if (c.req.method !== 'GET') {
    const key = `account:${session.user.id}:${Math.floor(Date.now() / 60000)}`;
    const r = await c.env.DB.prepare(
      'INSERT INTO api_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
      .bind(key, Date.now() + 120000)
      .first<{ count: number }>();
    if ((r?.count || 0) > 30)
      return c.json({ error: 'Too many account changes. Try again in a minute.' }, 429);
  }
  await next();
});
app.get('/api/account/me', (c) => c.json({ user: c.get('user'), ...features(c.get('plan')) }));
app.get('/api/account/export', async (c) => {
  const id = c.get('user').id;
  const data = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id,data,version,updated_at FROM profiles WHERE user_id=?').bind(id),
    c.env.DB.prepare('SELECT id,data,created_at FROM run_summaries WHERE user_id=?').bind(id),
    c.env.DB.prepare('SELECT plan,status,paid_through FROM subscriptions WHERE user_id=?').bind(id),
    c.env.DB.prepare('SELECT id,data,version,updated_at FROM workflows WHERE user_id=?').bind(id),
  ]);
  return c.json({
    user: c.get('user'),
    profiles: data[0].results,
    history: data[1].results,
    subscriptions: data[2].results,
    workflows: data[3].results,
  });
});
app.get('/api/account/profiles', async (c) => {
  const data = await c.env.DB.prepare(
    'SELECT id,data,version FROM profiles WHERE user_id=? ORDER BY updated_at DESC',
  )
    .bind(c.get('user').id)
    .all();
  return c.json(data.results);
});
app.put('/api/account/profiles/:id', async (c) => {
  if (c.get('plan') === 'free')
    return c.json({ error: 'Plus or Pro is required for cloud profiles' }, 403);
  const body = z
    .object({ data: z.unknown(), expectedVersion: z.number().int().nonnegative() })
    .parse(await c.req.json());
  const data = profileSchema.parse(body.data);
  if (
    !data ||
    typeof data.name !== 'string' ||
    data.name.length > 100 ||
    JSON.stringify(data).length > 20000
  )
    return c.json({ error: 'Invalid profile' }, 400);
  validateConfig(data.config);
  validateRule(data.rule);
  const id = c.req.param('id');
  if (data.id !== id) return c.json({ error: 'Profile ID mismatch' }, 400);
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return c.json({ error: 'Invalid profile ID' }, 400);
  const uid = c.get('user').id,
    now = new Date().toISOString();
  const query =
    body.expectedVersion === 0
      ? c.env.DB.prepare(
          'INSERT OR IGNORE INTO profiles(id,user_id,data,version,updated_at) SELECT ?,?,?,1,? WHERE (SELECT count(*) FROM profiles WHERE user_id=?)<50',
        ).bind(id, uid, JSON.stringify(data), now, uid)
      : c.env.DB.prepare(
          'UPDATE profiles SET data=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?',
        ).bind(JSON.stringify(data), now, id, uid, body.expectedVersion);
  const r = await query.run();
  if (!r.meta.changes)
    return c.json(
      {
        error:
          'Profile changed, is unavailable, or the 50-profile account storage budget is full. Reload before saving.',
      },
      409,
    );
  return c.json({ version: body.expectedVersion + 1 });
});
app.delete('/api/account/profiles/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM profiles WHERE id=? AND user_id=?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});
app.get('/api/account/workflows', async (c) => {
  const r = await c.env.DB.prepare(
    'SELECT id,data,version FROM workflows WHERE user_id=? ORDER BY updated_at DESC',
  )
    .bind(c.get('user').id)
    .all();
  return c.json(r.results);
});
app.put('/api/account/workflows/:id', async (c) => {
  if (c.get('plan') !== 'pro')
    return c.json({ error: 'Pro is required for cloud workflow templates' }, 403);
  const body = z
    .object({ data: z.unknown(), expectedVersion: z.number().int().nonnegative() })
    .strict()
    .parse(await c.req.json());
  const data = validateWorkflow(body.data),
    id = c.req.param('id'),
    uid = c.get('user').id;
  if (id !== data.id) return c.json({ error: 'Workflow ID mismatch' }, 400);
  const query =
    body.expectedVersion === 0
      ? c.env.DB.prepare(
          'INSERT OR IGNORE INTO workflows(id,user_id,data,version,updated_at) SELECT ?,?,?,1,? WHERE (SELECT count(*) FROM workflows WHERE user_id=?)<20',
        ).bind(id, uid, JSON.stringify(data), new Date().toISOString(), uid)
      : c.env.DB.prepare(
          'UPDATE workflows SET data=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?',
        ).bind(JSON.stringify(data), new Date().toISOString(), id, uid, body.expectedVersion);
  const r = await query.run();
  if (!r.meta.changes)
    return c.json(
      {
        error:
          'Workflow changed, is unavailable, or the 20-workflow storage budget is full. Reload before saving.',
      },
      409,
    );
  return c.json({ version: body.expectedVersion + 1 });
});
app.delete('/api/account/workflows/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM workflows WHERE id=? AND user_id=?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});
app.get('/api/account/history', async (c) => {
  const r = await c.env.DB.prepare(
    'SELECT id,data,created_at FROM run_summaries WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(c.get('user').id)
    .all();
  return c.json(r.results);
});
app.post('/api/account/history', async (c) => {
  if (c.get('plan') === 'free')
    return c.json({ error: 'Plus or Pro is required for cloud history' }, 403);
  const body = z
    .object({
      id: z.string().uuid(),
      name: z.string().max(100),
      createdAt: z.iso.datetime(),
      sample: z.boolean(),
      inputCount: z.number().int().min(0).max(25000),
      totals: z.record(
        z.string().length(3),
        z.record(z.string(), z.string().regex(/^-?\d+(\.\d+)?$/)),
      ),
    })
    .strict()
    .parse(await c.req.json());
  if (JSON.stringify(body).length > 20000) return c.json({ error: 'Summary exceeds 20 KiB' }, 400);
  // Only aggregate totals; raw financial rows and customer policy IDs are not accepted.
  const saved = await c.env.DB.prepare(
    'INSERT INTO run_summaries(id,user_id,data,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM run_summaries WHERE user_id=?)<100 OR EXISTS(SELECT 1 FROM run_summaries WHERE id=? AND user_id=?) ON CONFLICT(id,user_id) DO UPDATE SET data=excluded.data',
  )
    .bind(
      body.id,
      c.get('user').id,
      JSON.stringify(body),
      body.createdAt,
      c.get('user').id,
      body.id,
      c.get('user').id,
    )
    .run();
  if (!saved.meta.changes)
    return c.json(
      { error: 'Account summary storage budget is full. Export and remove an older summary.' },
      409,
    );
  return c.json({ ok: true });
});
app.delete('/api/account/history/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM run_summaries WHERE id=? AND user_id=?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});
app.get('/api/account/audit-export', async (c) => {
  if (c.get('plan') !== 'pro')
    return c.json({ error: 'Pro is required for cloud audit exports' }, 403);
  const uid = c.get('user').id;
  const data = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id,data,version,updated_at FROM profiles WHERE user_id=?').bind(uid),
    c.env.DB.prepare('SELECT id,data,created_at FROM run_summaries WHERE user_id=?').bind(uid),
    c.env.DB.prepare('SELECT id,data,version,updated_at FROM workflows WHERE user_id=?').bind(uid),
  ]);
  return c.json({
    generatedAt: new Date().toISOString(),
    profiles: data[0].results,
    summaries: data[1].results,
    workflows: data[2].results,
    scope: 'Account configurations and aggregate run summaries; source data remains on device.',
  });
});
app.post('/api/account/checkout', async (c) => {
  if (!billingReady(c.env))
    return c.json({ error: 'Billing is not live on this installation' }, 503);
  const { plan } = z.object({ plan: z.enum(['plus', 'pro']) }).parse(await c.req.json());
  const uid = c.get('user').id;
  const active = await c.env.DB.prepare(
    "SELECT id FROM subscriptions WHERE user_id=? AND status NOT IN ('canceled','paused') LIMIT 1",
  )
    .bind(uid)
    .first();
  if (active)
    return c.json({ error: 'Manage your existing subscription through the billing portal' }, 409);
  const ref = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO checkout_intents(id,user_id,created_at) VALUES(?,?,?)')
    .bind(ref, uid, new Date().toISOString())
    .run();
  const transaction = await paddle(c.env).transactions.create({
    items: [
      {
        priceId: plan === 'pro' ? c.env.PADDLE_PRO_PRICE_ID! : c.env.PADDLE_PLUS_PRICE_ID!,
        quantity: 1,
      },
    ],
    customData: { user_id: uid, checkout_ref: ref },
    collectionMode: 'automatic',
  });
  if (!transaction.checkout?.url)
    return c.json(
      { error: 'Checkout URL unavailable. Check the approved Paddle checkout domain.' },
      502,
    );
  return c.json({ url: transaction.checkout.url });
});
app.post('/api/account/portal', async (c) => {
  if (!billingReady(c.env)) return c.json({ error: 'Billing is not configured' }, 503);
  const sub = await c.env.DB.prepare(
    'SELECT customer_id,id FROM subscriptions WHERE user_id=? ORDER BY event_at DESC LIMIT 1',
  )
    .bind(c.get('user').id)
    .first<{ customer_id: string; id: string }>();
  if (!sub) return c.json({ error: 'No billing account found' }, 404);
  const session = await paddle(c.env).customerPortalSessions.create(sub.customer_id, [sub.id]);
  return c.json({ url: session.urls.general.overview });
});
app.notFound((c) =>
  c.req.path.startsWith('/api/')
    ? c.json({ error: 'Endpoint not found' }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
);
app.onError((error, c) => {
  if (error instanceof z.ZodError)
    return c.json({ error: 'Invalid request', details: error.issues.map((i) => i.message) }, 400);
  console.error(
    JSON.stringify({
      event: 'request_failed',
      path: c.req.path,
      requestId: c.req.header('cf-ray') || 'local',
    }),
  );
  return c.json(
    { error: 'The request could not be completed. Your local reconciliation is unaffected.' },
    500,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM api_limits WHERE expires_at<?').bind(Date.now()),
      env.DB.prepare('DELETE FROM webhook_events WHERE received_at<?').bind(
        new Date(Date.now() - 90 * 86400000).toISOString(),
      ),
      env.DB.prepare('DELETE FROM session WHERE expiresAt<?').bind(Date.now()),
      env.DB.prepare('DELETE FROM verification WHERE expiresAt<?').bind(Date.now()),
      env.DB.prepare('DELETE FROM rateLimit WHERE lastRequest<?').bind(Date.now() - 86400000),
    ]);
  },
};

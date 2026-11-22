import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { database } from './d1';
import { app } from '../server/index';
import type { Env } from '../server/env';
import { planFor, applySubscriptionEvent } from '../server/billing';
import { defaultConfig, defaultRule } from '../src/core/types';
const local = database();
const mails: { to: string[]; text: string }[] = [];
const env: Env = {
  DB: local.db,
  ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
  APP_URL: 'https://commiledger.test',
  BETTER_AUTH_SECRET: 'this-is-a-long-test-secret-only-for-local-verification',
  RESEND_API_KEY: 'test-email-key',
  MAIL_FROM: 'test@example.test',
  PADDLE_API_KEY: 'test-key',
  PADDLE_WEBHOOK_SECRET: 'test-signature-secret',
  PADDLE_PLUS_PRICE_ID: 'pri_plus',
  PADDLE_PRO_PRICE_ID: 'pri_pro',
  PADDLE_ENV: 'sandbox',
  BILLING_ENABLED: 'true',
};
async function request(
  path: string,
  {
    method = 'GET',
    body,
    cookie,
    origin = env.APP_URL,
  }: { method?: string; body?: unknown; cookie?: string; origin?: string } = {},
) {
  return app.request(
    `${env.APP_URL}/api${path}`,
    {
      method,
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
}
async function signup(email: string) {
  const response = await request('/auth/sign-up/email', {
    method: 'POST',
    body: { email, password: 'a-strong-test-password-42', name: email.split('@')[0] },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as any;
  const mail = [...mails].reverse().find((m) => m.to[0] === email)!;
  const url = mail.text.split('\n\n')[1];
  const verify = await app.request(url, { headers: { origin: env.APP_URL } }, env);
  expect([200, 302]).toContain(verify.status);
  const login = await request('/auth/sign-in/email', {
    method: 'POST',
    body: { email, password: 'a-strong-test-password-42' },
  });
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return { id: body.user.id, cookie };
}
let a: { id: string; cookie: string }, b: { id: string; cookie: string };
beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      if (String(url) === 'https://api.resend.com/emails') {
        mails.push(JSON.parse(String(options?.body)));
        return new Response(JSON.stringify({ id: 'mail' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error('Unexpected external request in tests');
    }),
  );
  a = await signup('alpha@example.test');
  b = await signup('beta@example.test');
}, 15000);
afterAll(() => {
  vi.unstubAllGlobals();
  local.close();
});
const profile = {
  id: 'profile-1',
  name: 'Test carrier',
  country: 'India',
  currency: 'USD',
  config: defaultConfig(),
  rule: defaultRule(),
  mappingHeaders: {},
  version: 1,
  archived: false,
  updatedAt: new Date().toISOString(),
};
describe('auth and API security with real Better Auth and SQLite D1 contract', () => {
  it('denies unauthenticated account data', async () =>
    expect((await request('/account/export')).status).toBe(401));
  it('requires configured email and secret', async () =>
    expect(
      (
        await app.request(
          `${env.APP_URL}/api/auth/sign-in/email`,
          { method: 'POST', headers: { origin: env.APP_URL } },
          { ...env, RESEND_API_KEY: undefined },
        )
      ).status,
    ).toBe(503));
  it('verifies email and sets secure HTTP-only sessions', async () => {
    const r = await request('/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'alpha@example.test', password: 'a-strong-test-password-42' },
    });
    expect(r.headers.get('set-cookie')).toContain('HttpOnly');
    expect(r.headers.get('set-cookie')).toContain('Secure');
    expect((await request('/account/me', { cookie: a.cookie })).status).toBe(200);
  });
  it('rejects cross-origin mutation', async () =>
    expect(
      (
        await request('/account/profiles/profile-1', {
          method: 'PUT',
          body: { data: profile, expectedVersion: 0 },
          cookie: a.cookie,
          origin: 'https://evil.test',
        })
      ).status,
    ).toBe(403));
  it('denies free-tier cloud writes despite client claims', async () => {
    const r = await request('/account/profiles/profile-1', {
      method: 'PUT',
      cookie: a.cookie,
      body: { data: profile, expectedVersion: 0, plan: 'pro' },
    });
    expect(r.status).toBe(403);
  });
  it('paid backend resources are isolated by account', async () => {
    local.sqlite
      .prepare('INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?)')
      .run(
        'sub-a',
        a.id,
        'customer-a',
        'plus',
        'active',
        '2099-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );
    const put = await request('/account/profiles/profile-1', {
      method: 'PUT',
      cookie: a.cookie,
      body: { data: profile, expectedVersion: 0 },
    });
    expect(put.status).toBe(200);
    const mine = await request('/account/profiles', { cookie: a.cookie }),
      other = await request('/account/profiles', { cookie: b.cookie });
    expect((await mine.json()) as any[]).toHaveLength(1);
    expect(await other.json()).toEqual([]);
    await request('/account/profiles/profile-1', { method: 'DELETE', cookie: b.cookie, body: {} });
    expect(
      (await (await request('/account/profiles', { cookie: a.cookie })).json()) as any[],
    ).toHaveLength(1);
  });
  it('prevents stale profile overwrites', async () =>
    expect(
      (
        await request('/account/profiles/profile-1', {
          method: 'PUT',
          cookie: a.cookie,
          body: { data: profile, expectedVersion: 0 },
        })
      ).status,
    ).toBe(409));
  it('rejects raw rows from the aggregate history API', async () =>
    expect(
      (
        await request('/account/history', {
          method: 'POST',
          cookie: a.cookie,
          body: {
            id: crypto.randomUUID(),
            name: 'run',
            createdAt: new Date().toISOString(),
            sample: false,
            inputCount: 1,
            totals: { USD: { received: '10.00' } },
            rows: [{ policy: 'SECRET' }],
          },
        })
      ).status,
    ).toBe(400));
  it('allows paid summary persistence and protects it from another account', async () => {
    const id = crypto.randomUUID();
    const payload = {
      id,
      name: 'run',
      createdAt: new Date().toISOString(),
      sample: false,
      inputCount: 1,
      totals: { USD: { received: '10.00' } },
    };
    expect(
      (await request('/account/history', { method: 'POST', cookie: a.cookie, body: payload }))
        .status,
    ).toBe(200);
    expect(await (await request('/account/history', { cookie: b.cookie })).json()).toEqual([]);
    expect(
      (await request('/account/history/' + id, { method: 'DELETE', cookie: a.cookie, body: {} }))
        .status,
    ).toBe(200);
  });
  it('denies Pro audit exports to Plus users', async () =>
    expect((await request('/account/audit-export', { cookie: a.cookie })).status).toBe(403));
  it('expires paid entitlements without client state', async () => {
    expect(await planFor(local.db, a.id)).toBe('plus');
    expect(await planFor(local.db, a.id, '2100-01-01T00:00:00.000Z')).toBe('free');
  });
  it('rejects expired sessions', async () => {
    local.sqlite.prepare('UPDATE session SET expiresAt=? WHERE userId=?').run(0, b.id);
    expect((await request('/account/me', { cookie: b.cookie })).status).toBe(401);
  });
  it('provides security headers and disables response caching', async () => {
    const r = await request('/account/me', { cookie: a.cookie });
    expect(r.headers.get('content-security-policy')).toContain("object-src 'none'");
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('fails closed for billing when the launch switch is off', async () =>
    expect(
      (
        await app.request(
          `${env.APP_URL}/api/account/checkout`,
          {
            method: 'POST',
            headers: { origin: env.APP_URL, cookie: a.cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ plan: 'pro' }),
          },
          { ...env, BILLING_ENABLED: 'false' },
        )
      ).status,
    ).toBe(503));
});
describe('signed subscription lifecycle', () => {
  const event = (change: Record<string, unknown> = {}) => ({
    event_id: 'evt_initial',
    event_type: 'subscription.activated',
    occurred_at: '2026-11-22T12:00:00.000Z',
    data: {
      id: 'sub-test',
      customer_id: 'ctm-test',
      status: 'active',
      custom_data: { user_id: a.id, checkout_ref: 'intent-test' },
      items: [{ price: { id: 'pri_pro' } }],
      current_billing_period: { ends_at: '2099-01-01T00:00:00.000Z' },
    },
    ...change,
  });
  it('requires a valid signature', async () => {
    const r = await request('/billing/webhook', { method: 'POST', body: event() });
    expect(r.status).toBe(401);
  });
  it('rejects stale signed deliveries', async () => {
    const raw = JSON.stringify(event()),
      ts = '1',
      sig = createHmac('sha256', env.PADDLE_WEBHOOK_SECRET!).update(`${ts}:${raw}`).digest('hex');
    const r = await app.request(
      `${env.APP_URL}/api/billing/webhook`,
      { method: 'POST', headers: { 'paddle-signature': `ts=${ts};h1=${sig}` }, body: raw },
      env,
    );
    expect(r.status).toBe(401);
  });
  it('rejects unknown checkout reference', async () =>
    expect(applySubscriptionEvent(local.db, env, event())).rejects.toThrow('Unknown checkout'));
  it('applies authentic events once and ignores out-of-order changes', async () => {
    local.sqlite
      .prepare('INSERT INTO checkout_intents VALUES(?,?,?)')
      .run('intent-test', a.id, new Date().toISOString());
    await applySubscriptionEvent(local.db, env, event());
    await applySubscriptionEvent(local.db, env, event());
    expect(
      (
        await local.db
          .prepare('SELECT count(*) as n FROM webhook_events WHERE id=?')
          .bind('evt_initial')
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
    expect(await planFor(local.db, a.id)).toBe('pro');
    await applySubscriptionEvent(
      local.db,
      env,
      event({
        event_id: 'evt_old',
        occurred_at: '2026-11-21T00:00:00.000Z',
        data: { ...event().data, status: 'canceled' },
      }),
    );
    expect(await planFor(local.db, a.id)).toBe('pro');
  });
  it('removes Pro when a newer payment-failure state arrives', async () => {
    await applySubscriptionEvent(
      local.db,
      env,
      event({
        event_id: 'evt_failed',
        event_type: 'subscription.past_due',
        occurred_at: '2026-11-23T00:00:00.000Z',
        data: { ...event().data, status: 'past_due' },
      }),
    );
    expect(await planFor(local.db, a.id)).toBe('plus');
  });
  it('uses only configured price IDs for plan derivation', async () => {
    await applySubscriptionEvent(
      local.db,
      env,
      event({
        event_id: 'evt_unknown_price',
        occurred_at: '2026-11-24T00:00:00.000Z',
        data: { ...event().data, items: [{ price: { id: 'pri_invented' } }] },
      }),
    );
    expect(await planFor(local.db, a.id)).toBe('plus');
  });
});

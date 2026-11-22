# Configuration and deployment

## Local reconciliation only

`npm ci && npm run dev` runs the browser application. It needs no cloud credentials. Account availability fails closed when the API is unavailable. Never use a local session as evidence of a successful paid purchase.

For a production-mode frontend preview: `npm run build && npm run preview`. Set `SITE_URL` to the approved HTTPS canonical origin when building for a public launch. Without it the build is intentionally noindex. Fonts, workers and frontend assets are bundled locally; no external font fetch is required.

## Cloudflare Worker + D1

1. Create a Cloudflare D1 database named `commiledger` in the owner's account. Replace the all-zero placeholder `database_id` in `wrangler.jsonc` with its real ID. No database has been provisioned by this change.
2. Set `APP_URL` to the exact HTTPS public origin and `SITE_URL` to the same origin for the frontend build. Static assets and `/api/*` must share the origin. In split development, the Vite proxy points to Wrangler port 8787; configure Better Auth's origin to match the URL actually used in the browser.
3. Apply migrations locally first, then to the authorized production database: `npm run db:migrate:local` and `npm run db:migrate:remote`. Never regenerate migrations on a populated database. `scripts/generate-auth-schema.ts` documents how the initial auth schema was generated from the installed package.
4. Configure account secrets with `wrangler secret put`, not Git or frontend variables: `BETTER_AUTH_SECRET` (at least 32 random bytes), `RESEND_API_KEY`, `MAIL_FROM`. Configure `SUPPORT_EMAIL` and final operator/legal details.
5. Verify the sending domain at Resend. Account verification/reset delivery is a necessary dependency for cloud accounts, but local reconciliation remains independent. The adapter is intentionally small and can be replaced with another provider using a reliable server API.
6. Build with the correct `SITE_URL`, then run `npm run build:api`. This command is a deployment dry run. **Do not run `npm run deploy` until the owner authorizes publication and release gates pass.**
7. After authorized deployment, check `/api/health`, `/api/status`, authentication, cookie attributes, source-file network behavior, static CSP, the full signup/reset journey and each paid entitlement. Configure Cloudflare budgets and alerts.

The account workload should use Workers Paid (starting at the documented $5/month base). Password hashing may exceed the Free plan's 10 ms invocation CPU allowance; no claim is made that secure accounts are viable under that limit. No custom password cryptography is used.

## Paddle sandbox, then live

Paddle was selected because its official supplier-country documentation supports software businesses globally except listed excluded countries; India is not listed as excluded. This is **eligibility evidence, not merchant approval**. Approval, identity/business checks, payout configuration, product review and final commercial terms are still required.

- Create recurring Plus/Pro prices in Paddle. Starting proposals: USD 19/month and USD 39/month. Set `PADDLE_PLUS_PRICE_ID`, `PADDLE_PRO_PRICE_ID` and `PADDLE_API_KEY` on the server.
- Set `PADDLE_ENV=sandbox` during validation. Set an approved default payment link/checkout domain in Paddle, otherwise transaction creation may not return a usable `checkout.url`.
- Create a notification destination at `/api/billing/webhook` for subscription lifecycle events. Store its distinct `PADDLE_WEBHOOK_SECRET`.
- Enable `BILLING_ENABLED=true` only in the environment being tested, with the correct provider environment. Credentials absent or launch switch off means checkout is disabled.
- The server creates the transaction and a checkout reference bound to the verified user. It never accepts a price ID or arbitrary user ID from the client. Signed subscription state and `current_billing_period.ends_at` determine entitlements. Past-due/paused/canceled subscriptions grant no entitlement; scheduled cancellation remains active until the provider's effective state changes.
- Validate checkout, activation, renewal, failed payment, cancellation, price change/downgrade, delayed/out-of-order events, retries, refund policy and portal invoice access in the real Paddle sandbox. Automated tests use synthetic events and do **not** substitute for these tests.
- The customer portal handles cancellation, payment methods and invoices. Plan change capabilities depend on the provider's configured portal. If that portal does not expose the intended change flow, implement and validate a dedicated provider update route before advertising self-service downgrades.
- Do not collect live payments while Pro capabilities are incomplete or legal terms are drafts. Confirm merchant approval and redo the full flow against live configuration before launch.

## Backups and recovery

Raw local files/runs have no server backup. Users should export audit JSON/CSV before clearing browser data. Optional account configurations and aggregate summaries live in D1; use its available recovery facilities plus regular owner-controlled D1 exports. Test restoring to an isolated database before relying on a backup. Avoid public build artifacts containing database dumps or personal data.

The daily cleanup removes expired session/verification/rate-limit data and 90-day webhook event identifiers. Provider financial records follow separate retention requirements. Account deletion cascades through owned profiles/summaries/subscriptions after active subscriptions are canceled. Local device data is deleted separately.

## CI and secrets

CI runs tests, dependency auditing, type checking, static build, Worker dry run and desktop/mobile browser checks. It has read-only repository permissions and no deployment secrets. Playwright artifacts contain synthetic test data only. There is no automatic production deploy.

# CommiLedger

A local-first insurance commission reconciliation application with a React/TypeScript UI, deterministic decimal arithmetic, browser-worker CSV/XLSX imports, optional Better Auth accounts and a Paddle subscription integration.

**Status: reviewable implementation, not a commercially launched or independently certified service.** No live payment, email or Cloudflare account credentials are included. The local workflow works without those providers. See [release status](docs/RELEASE.md) for evidence and remaining gates.

## Run it

Node 24 and npm are required. The lockfile fixes the dependency graph.

```bash
npm ci
npm run dev
```

Open the Vite URL. Choose **Explore sample workspace**, or import your expected ledger and actual payments. Samples are synthetic and run through the same normalization and reconciliation engine.

```bash
npm test
npm run typecheck
npm run build
npm run build:api
npm run benchmark
```

`build:api` is a Wrangler dry run: it bundles but does not publish. The frontend build prerenders the marketing/documentation routes. Without `SITE_URL`, it deliberately emits noindex and a blocking robots file.

## What works

- CSV/XLSX import in a cancellable browser worker: multi-file selection, worksheet/header choice, explicit locale/date conventions, editable mappings, validation and file hashes.
- Exact composite-key reconciliation, currency isolation, decimal-safe calculations, one-to-many payment aggregation, under/overpayments, missing entries, duplicate quarantine, unmatched payments, reversals and ambiguous/invalid findings.
- Percentage, fixed, progressive tier, split, tax, fee and adjustment calculations. Save a carrier rule and explicitly select it in import to derive expected amounts from premium; mapped expected amounts take precedence.
- Actual-data dashboard, currency separation, monthly/carrier charts, search/filter/sort, source evidence, individual/bulk review notes, device-only history, comparison, versioned profiles and CSV/JSON/print reports.
- Marketing, pricing, commission calculator, CSV templates, guide, help, security, draft privacy/terms and account screens. Dark/light themes and responsive navigation.
- Server account routes using Better Auth: verified email, passwords/reset, sessions, account export/deletion, input validation, origin checks and rate limiting.
- Server-verified Plus/Pro cloud capabilities, scoped configurations and aggregate history, Paddle checkout/portal and signed subscription events with expiry and out-of-order protection.

## Architecture

```
src/core/       Portable deterministic engine, import, rules, export and worker
src/pages/      Product, marketing and account UI
src/lib/        Explicit IndexedDB storage and account API client
server/         Hono Cloudflare Worker, Better Auth and Paddle integration
migrations/     Auth-generated schema and application tables
tests/          Unit, integration, semantic accessibility and UI tests
e2e/            Desktop/mobile Playwright + axe workflows
docs/           Setup, evidence, limitations, operating costs and launch gates
```

Raw financial files are not uploaded by the import workflow. Local saves **include original source values** in browser IndexedDB and are not encrypted by the app. Optional cloud history accepts only aggregate totals. Local review history is reproducible application evidence, not a tamper-proof legal audit log.

## Development and deployment

- [Configuration and deployment](docs/DEPLOYMENT.md)
- [Matching contracts and accounting definitions](docs/METHODOLOGY.md)
- [Capacity measurements and operating costs](docs/OPERATIONS.md)
- [Release evidence and remaining work](docs/RELEASE.md)
- [Organic launch plan](docs/LAUNCH.md)

There is no auto-deploy workflow. CI validates changes on pull requests. A production deployment requires owner authorization, configured infrastructure and the release checks in the linked documentation.

## Repeatable workflows and restore

Carrier profiles can be captured in versioned workflow templates. Assign each imported file to a stage and run the batch; every stage is reconciled separately with its saved configuration, and completed runs are saved atomically only after the whole batch succeeds. Pro accounts can explicitly sync configuration-only templates. History restores exported audit JSON after schema, engine, source-row and recalculated-total checks, always as a new copy. See [release evidence](docs/RELEASE.md) for tested behavior and remaining gates.

# Release evidence and launch gates

## Implemented and locally checked

| Area                                                                                          | Evidence                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Financial engine, dates, rounding, duplicates, reversals, ambiguity, currencies, large values | Automated Vitest tests.                                                                                                                                                                             |
| Real CSV/XLSX parsing and export escaping                                                     | Synthetic CSV and actual generated XLSX ZIP fixture tests.                                                                                                                                          |
| Rule-based expected commission derivation and source-based analytics                          | Tests cover explicit rule selection, mapped-amount precedence, currency rejection and cross-period matching.                                                                                        |
| Auth and account isolation                                                                    | Real Better Auth against a SQLite-backed D1 API contract in tests; email transport mocked. Secure session, verification, expiry, authorization, origin, profile concurrency and paid access checks. |
| Billing state                                                                                 | Synthetic signature rejection, idempotency, out-of-order events, configured-price allowlist and paid-through expiry tests. No live purchase.                                                        |
| Persistence and UI                                                                            | Explicit IndexedDB save/reload/delete test, calculator interaction, unavailable checkout test and semantic axe check.                                                                               |
| Builds                                                                                        | TypeScript check, Vite build with 16 prerendered routes, Wrangler Worker dry run.                                                                                                                   |
| Dependencies                                                                                  | npm audit returned zero reported vulnerabilities after test-tool upgrades. This is not an independent security audit.                                                                               |
| Scale                                                                                         | Synthetic Node benchmark in benchmark.json; 25k guarded source-row envelope.                                                                                                                        |
| Browser observation                                                                           | Homepage, actual-engine sample dashboard, import mapping, investigation notes and saved history observed in the browser.                                                                            |

At this checkpoint, **101 automated tests pass**. Desktop/mobile Playwright scenarios and axe checks are included in CI; consult the PR's check run for the executed browser result. JSDOM semantic accessibility tests intentionally exclude color contrast and cannot establish visual, keyboard, screen-reader or WCAG conformance by themselves.

The backend bundle was dry-run built. No Cloudflare database, production worker, real email delivery or live payment was provisioned or verified in this work.

## Required before enabling commercial purchases

- [ ] Owner-approved Cloudflare account/database provisioning, real D1 migrations and production origin.
- [ ] Verified email sender/domain and real delivery: signup, email ownership, password reset, session expiry, logout and account deletion.
- [ ] Paddle merchant approval for the Indian operator, prices, checkout domain, webhook destination and credentials.
- [ ] Real Paddle sandbox lifecycle: purchase, activate, renew, fail payment, cancel, plan change/downgrade, retry, out-of-order notification, invoice and refund behavior.
- [ ] Independent security review and adversarial file import testing, including compressed/sparse workbooks and malicious CSVs.
- [ ] Representative carrier files from intended launch markets, with independently defined expected results. Synthetic correctness is not proof of real carrier compatibility.
- [ ] Target-browser and lower-memory device performance, keyboard and screen-reader verification, complete light/dark contrast audit.
- [ ] Operator identity, support address, jurisdiction-reviewed privacy/terms, retention and consumer cancellation/refund process.
- [ ] D1 backup/restore exercise, cost/CPU monitoring thresholds and production recovery runbook execution.
- [ ] Owner authorization to merge/publish. No automatic deployment is configured.

## Remaining product work, not hidden behind credentials

1. Plus/Pro commercial packaging is not finalized: the release exposes the same local row guardrail and local exports to everyone. Higher paid limits/export quotas require measured browser capacity and an enforceable product design. Client-only JavaScript is not a secure commercial paywall.
2. Pro organization workspaces, shared/team review permissions and reusable workflow templates are not implemented. The pricing page labels them planned and checkout is disabled until configured. Do not sell these as delivered features.
3. Multiple files/carriers can reconcile in one run. Independently queued batches with a different rule/profile per carrier are not implemented.
4. Matching uses user-selected exact composite keys, not a sequential priority ladder or date-window tolerance. Fuzzy matching and automatic ambiguity resolution are deliberately absent.
5. Financial corrections require a changed source or mapping and a rerun. There is no immutable server transaction-review ledger or in-place amount editing.
6. The provider portal is integrated; self-service plan change/downgrade behavior must be verified against the configured Paddle portal. A dedicated plan-update route is not implemented.
7. Local audit JSON export is implemented; importing an arbitrary audit JSON backup through the UI is not yet supported.
8. No PDF/OCR, carrier API ingestion, FX conversion, customer statement cloud storage or regulatory certification is included or advertised as working.

These are concrete release boundaries, not claims that compilation proves a production-ready financial service.

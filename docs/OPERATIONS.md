# Capacity and operating model

## Measured processing

The checked-in [benchmark.json](benchmark.json) contains three reconciliation timings per input size, measured on Node 24/Linux with synthetic records. The 25,000-row engine run took approximately **251–286 ms** after currency-precision caching. CSV parse + normalization took approximately **1.6 seconds**. The largest observed heap-used delta in that engine case was **46.7 MiB**, not a precise peak memory measurement. The exploratory 50,000-row engine case took approximately 463–480 ms; it is not exposed as a supported browser limit.

Release guardrails: **25,000 combined source rows, 10 MiB per file, 40 MiB declared expanded XLSX content, 80 columns, 2,000 characters per cell and 10 files per run.** These are conservative engineering boundaries based on the measured envelope and workbook amplification control, not a validated paid-tier capacity promise. Browser cloning, source strings and XLSX parsing can use more memory than the engine benchmark. A 90-second worker timeout and cancellation prevent indefinite UI occupation. Test complex workbooks and low-memory phones before raising limits.

The current browser implementation parses a workbook to expose sheets and stores its cell arrays. It is not a streaming, constant-memory XLSX engine. Huge sparse worksheets, malformed ZIP metadata and unusually complex workbooks remain targets for adversarial testing. No universal workbook guarantee is made.

## Infrastructure budget

Checked against official Cloudflare and Paddle documentation during implementation on 22 November 2026 (UTC); pricing can change.

| Resource                      | Documented budget / price                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Worker static asset requests  | Free, unlimited in the documented pricing model; deployment/storage limits still apply.                                     |
| Workers Free dynamic requests | 100,000/day, 10 ms CPU per invocation, 128 MiB memory.                                                                      |
| Workers Paid baseline         | $5/month; includes 10 million requests and 30 million CPU ms monthly.                                                       |
| Worker overage                | $0.30/million requests and $0.02/million CPU ms.                                                                            |
| D1 Free                       | 5 million rows read/day; 100,000 rows written/day; 5 GB total storage. Requests fail when daily free budgets are exhausted. |
| D1 Paid included              | 25 billion rows read/month; 50 million rows written/month; first 5 GB storage.                                              |
| D1 paid overage               | $0.001/million reads; $1/million writes; $0.75/GB-month storage.                                                            |

Password hashing is intentionally not weakened to fit a free CPU budget. Secure account operations should be budgeted on Workers Paid. Local reconciliation requires no per-document server compute, AI API, carrier API, OCR subscription or monitoring service.

Profiles are capped at 20,000 serialized characters and 50 per account; summaries at 20,000 characters and 100 per account. These are **storage protection budgets**, not market-validated plan limits. At the maximal ASCII payload envelope, that is about 3 MB/account before indexes, sessions, provider state and Unicode encoding overhead. Use measured database byte size for real capacity planning; do not derive a guaranteed customer limit from character counts. Both Plus and Pro use these storage protections today. Pro workflow templates add a 100,000-character maximum and 20-template budget (up to about 2 MB additional ASCII payload per account); each template contains up to five versioned carrier configurations. These additional payloads must be included in D1 capacity planning.

Example planning model, not a production measurement: 1,000 active users × 20 API requests/day ≈ 600,000 requests/month. At an assumed average 20 ms/request, that is 12 million CPU ms/month, within the paid included budgets. Authentication-heavy traffic, abusive requests and expensive queries can be materially different. At 1 MB retained account data/user, account payloads alone would be ~1 GB; indexes and operational data add overhead.

Paddle's standard advertised starting processing price was 5% + $0.50 per checkout transaction. At $19 this is $1.45; at $39 this is $2.45 before contractual, currency, refund, tax or other adjustments. Reconfirm final merchant terms; do not treat these estimates as guaranteed realized margins. Account email, a domain and any support/security labor are additional. Do not assume a permanent free email quota.

## Monitoring, recovery and upgrade triggers

- Monitor Cloudflare's own request/CPU/error/D1 usage dashboards and budget alerts; no external paid monitor is necessary for the core workflow.
- Worker failures log only route and request correlation metadata, not financial bodies, passwords or payment payloads. Review provider-native request logs and their retention before launch.
- Alert before 70% of the selected database/storage budget and before 70% of request/CPU allowances. These are operational alert thresholds, not hidden product usage limits.
- If browser parse/worker memory or p95 import latency exceeds the release envelope, reduce workbook limits or implement streaming/partitioning before selling larger plans.
- Keep optional cloud summaries pruned and local data retention under user control. Expired operational rows are cleaned daily.
- Back up account configuration before migrations and test restoration. Browser data has no automatic server backup; export audit JSON.
- Revalidate tests and representative carrier datasets after dependency upgrades or engine rule changes.

## Primary sources

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Paddle pricing](https://www.paddle.com/pricing)
- [Paddle supplier-country support](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle)
- [Paddle webhook signature verification](https://developer.paddle.com/webhooks/about/signature-verification/)
- [Paddle customer portal sessions](https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/)

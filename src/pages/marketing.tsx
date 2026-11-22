import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Check,
  ShieldCheck,
  FileSpreadsheet,
  Search,
  Layers,
  Menu,
  LockKeyhole,
  Download,
  SlidersHorizontal,
} from 'lucide-react';
import { Brand } from '../components/ui';
import { calculateCommission, decimalInput, D, money, currencyDigits } from '../core/money';
import { defaultRule } from '../core/types';
import { download, templateCsv } from '../core/export';
export function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="marketing">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="marketing-nav">
        <Brand />
        <button
          className="icon-btn mobile-menu"
          aria-label="Toggle navigation"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <Menu />
        </button>
        <nav className={menu ? 'open' : ''} aria-label="Main navigation">
          <Link to="/features" onClick={() => setMenu(false)}>
            Product
          </Link>
          <Link to="/how-it-works" onClick={() => setMenu(false)}>
            How it works
          </Link>
          <Link to="/pricing" onClick={() => setMenu(false)}>
            Pricing
          </Link>
          <Link to="/guide" onClick={() => setMenu(false)}>
            Resources
          </Link>
        </nav>
        <div className="nav-actions">
          <Link to="/signin" className="signin">
            Sign in
          </Link>
          <Link to="/app/import" className="btn primary small">
            Start reconciling
          </Link>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer>
        <div>
          <Brand />
          <p>Clarity for every commission.</p>
          <span className="subtle">Built for independent insurance businesses.</span>
        </div>
        <div>
          <strong>Product</strong>
          <Link to="/features">Features</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/app?demo=1">Sample workspace</Link>
          <Link to="/calculator">Commission calculator</Link>
        </div>
        <div>
          <strong>Resources</strong>
          <Link to="/guide">Reconciliation guide</Link>
          <Link to="/docs">Documentation</Link>
          <Link to="/templates">CSV templates</Link>
          <Link to="/faq">FAQ</Link>
        </div>
        <div>
          <strong>Company</strong>
          <Link to="/security">Security</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <div className="footer-base">
          © {new Date().getFullYear()} CommiLedger{' '}
          <span>Local processing. Clear evidence. Your control.</span>
        </div>
      </footer>
    </div>
  );
}
export function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> INSURANCE COMMISSION RECONCILIATION
          </p>
          <h1>
            Every commission.
            <br />
            Every difference.
            <br />
            <em>Accounted for.</em>
          </h1>
          <p className="hero-description">
            Turn carrier statements into a clear picture of what you earned, what arrived, and what
            needs a closer look.
          </p>
          <div className="hero-actions">
            <Link to="/app/import" className="btn primary">
              Reconcile your statements
            </Link>
            <Link to="/app?demo=1" className="btn secondary">
              Explore sample workspace
            </Link>
          </div>
          <p className="hero-footnote">
            <ShieldCheck size={16} /> Your files stay on your device. No signup needed.
          </p>
        </div>
        <div className="hero-ledger">
          <div className="mini-top">
            <span className="mini-logo">CL</span>
            <strong>Commission overview</strong>
            <span className="pill">Synthetic example</span>
          </div>
          <div className="mini-summary">
            <div>
              <small>Expected</small>
              <strong>USD 4,850.00</strong>
            </div>
            <div>
              <small>Received</small>
              <strong>USD 4,225.00</strong>
            </div>
          </div>
          <div className="mini-chart" role="img" aria-label="Illustrative example chart">
            <div style={{ height: '48%' }} />
            <div style={{ height: '65%' }} />
            <div style={{ height: '57%' }} />
            <div style={{ height: '78%' }} />
            <div style={{ height: '70%' }} />
            <div style={{ height: '90%' }} />
            <div style={{ height: '82%' }} />
            <div style={{ height: '100%' }} />
          </div>
          <div className="mini-row">
            <span>
              <i className="mini-carrier">H</i> Harbor Mutual<small>POL-1042 · Example</small>
            </span>
            <strong>USD 1,250.00</strong>
            <span className="status matched">Matched</span>
          </div>
          <div className="mini-row">
            <span>
              <i className="mini-carrier">N</i> Northstar Life<small>POL-1086 · Example</small>
            </span>
            <strong>USD 875.00</strong>
            <span className="status underpaid">Underpaid</span>
          </div>
          <div className="floating-note">
            <Search size={20} />
            <div>
              <strong>The difference is in the details.</strong>
              <span>Trace every finding to its source row.</span>
            </div>
          </div>
        </div>
      </section>
      <div className="promise-strip">
        <span>
          <LockKeyhole size={18} /> Local-first by design
        </span>
        <span>
          <FileSpreadsheet size={18} /> CSV & XLSX imports
        </span>
        <span>
          <Layers size={18} /> Currency-aware matching
        </span>
        <span>
          <Check size={18} /> Explainable calculations
        </span>
      </div>
      <section className="marketing-section">
        <div className="section-intro">
          <p className="eyebrow">A CLEARER MONTH-END</p>
          <h2>
            Less spreadsheet detective work.
            <br />
            More confidence in your numbers.
          </h2>
          <p>Keep the flexibility of your existing files. Add a repeatable way to check them.</p>
        </div>
        <div className="feature-grid">
          {[
            {
              icon: FileSpreadsheet,
              title: 'Bring the files you already use',
              text: 'Import expected commissions and carrier payments. Map unfamiliar columns and validate every row before matching.',
            },
            {
              icon: Search,
              title: 'See exactly what needs attention',
              text: 'Find underpayments, missing entries, duplicate candidates and reversals—with the evidence behind each finding.',
            },
            {
              icon: ShieldCheck,
              title: 'Keep sensitive information close',
              text: 'Parsing and reconciliation happen in your browser. Save locally only when you choose, and export a traceable report.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <article className="feature-card" key={title}>
              <span className="feature-icon">
                <Icon />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="dark-cta">
        <div>
          <p className="eyebrow">START WITH CLARITY</p>
          <h2>
            Your next reconciliation
            <br />
            can feel different.
          </h2>
          <p>Try the actual workflow with clearly labeled sample files.</p>
        </div>
        <Link to="/app?demo=1" className="btn mint">
          Open sample workspace
        </Link>
      </section>
    </>
  );
}
const articles: Record<string, { title: string; intro: string; sections: [string, string][] }> = {
  '/features': {
    title: 'A clear path from statements to answers.',
    intro: 'A focused workspace for insurance agents, brokers and operations teams.',
    sections: [
      [
        'Import without a format lock-in',
        'CSV and XLSX import includes worksheet selection, detected headers and editable mappings. Explicit number and date conventions prevent ambiguous financial fields from being silently guessed.',
      ],
      [
        'Reconcile with evidence',
        'Use policy, carrier, commission period, agent, transaction, date or premium as composite keys. Currency is always part of a match. One expected entry can collect multiple payments; repeated expected entries are flagged for review.',
      ],
      [
        'Investigate and report',
        'Search findings, inspect original rows, record review decisions and export a spreadsheet-safe CSV report. Reviewing a result never silently changes financial totals.',
      ],
      [
        'Reuse a workflow',
        'Save versioned carrier profiles and configurations on this device. Explicitly opted-in cloud configuration and aggregate history synchronization are available with server-verified paid entitlements once accounts are configured.',
      ],
    ],
  },
  '/how-it-works': {
    title: 'From two files to a clearer picture.',
    intro: 'No carrier API, document fee or AI upload is needed.',
    sections: [
      [
        'Prepare your expected ledger',
        'Include a policy identifier, carrier, YYYY-MM commission period, currency and expected amount. A due date helps distinguish outstanding amounts from payments that may simply not be due yet.',
      ],
      [
        'Add carrier payments',
        'Choose CSV or XLSX files. Verify worksheet, header row, currency and number conventions. Confirm column mappings in the preview. The two sides must represent compatible periods.',
      ],
      [
        'Run the reconciliation',
        'The browser validates input, quarantines duplicate candidates and applies your exact matching keys. No fuzzy match is silently treated as certain.',
      ],
      [
        'Review the evidence',
        'Start with invalid and ambiguous rows, then investigate differences. Resolve source issues and rerun. Export a report or explicitly save the run on your device.',
      ],
    ],
  },
  '/guide': {
    title: 'How to reconcile insurance commissions.',
    intro:
      'A practical month-end process for finding differences without overstating what they mean.',
    sections: [
      [
        'Define what should have been paid',
        'Build the expected ledger from your agreed commission schedule, policy events, renewals and splits. Decide whether amounts include tax and fees. The expected and received sides must use the same basis. A premium by itself is not evidence of a particular commission rate.',
      ],
      [
        'Establish statement coverage',
        'Record the statement start and end dates, payment due dates and your review date. An entry absent from one statement is a candidate for investigation, not proof of a carrier debt. Payment timing and holdbacks can explain the gap.',
      ],
      [
        'Choose keys that identify a payment obligation',
        'Begin with policy, carrier and commission period. Add agent for split producers or transaction identifiers where both files share a reference. Preserve leading zeros and punctuation in policy numbers. Do not combine currencies or rely on approximate names.',
      ],
      [
        'Handle splits, reversals and duplicates',
        'Sum distinct payment entries against one expected entry. Keep reversals signed. Repeated transaction IDs or indistinguishable payment rows need investigation before allocation. Never simply drop a duplicate and declare the remainder correct.',
      ],
      [
        'Investigate and close with evidence',
        'Record the carrier response, timing explanation or accepted adjustment. Correct the original ledger when needed, rerun with the saved configuration, then retain an export under your retention policy. Compare the same carrier, currency and period when reviewing trends.',
      ],
    ],
  },
  '/docs': {
    title: 'The CommiLedger handbook.',
    intro: 'Formats, matching behavior and the boundaries of this release.',
    sections: [
      [
        'File requirements',
        'CSV: UTF-8 or BOM-marked UTF-16, comma/tab/semicolon delimiters detected by Papa Parse. XLSX: read worksheets and cached cell values; formulas are not executed. Maximum 10 MiB per file, 40 MiB declared expanded workbook data, 80 columns, 10 files and 25,000 combined source rows. These are guarded release limits, not a promise for every browser.',
      ],
      [
        'Dates and currency',
        'Use YYYY-MM for commission periods. Select YMD, DMY or MDY for source dates; ISO dates are always accepted. Choose an explicit default ISO currency or map a currency column. No foreign exchange conversion is performed. Number conventions must match the selected locale.',
      ],
      [
        'Outcomes and totals',
        'Received means all valid imported payment amounts, including duplicate candidates. Eligible received excludes duplicate candidates. Confirmed variance is the signed difference from unambiguous under/overpayments; it is not a legal determination. Potential outstanding includes positive missing amounts past their due date and underpayments, and may require carrier confirmation. Invalid amounts are excluded and counted explicitly.',
      ],
      [
        'Local saving and recovery',
        'Files stay in browser memory until you explicitly save a run to this device. Saved runs include normalized rows, source values, hashes, configuration and review notes in IndexedDB. They are not encrypted by the app. Use a trusted device and export backups; browser data removal deletes this history.',
      ],
      [
        'Corrections and reproducibility',
        'Review notes are append-only within the application. This local audit history is editable by a device owner and is not a tamper-proof record. To correct amounts or mappings, import corrected files and rerun. Each run records engine version, exact keys, tolerance and file hashes.',
      ],
      [
        'Limits of country support',
        'ISO currency and format settings support international files. Carrier-specific formats have not been independently verified. PDF/OCR, exchange-rate conversion, collaborative reviews and automatic carrier retrieval are not included.',
      ],
    ],
  },
  '/security': {
    title: 'Keep financial files under your control.',
    intro: 'Privacy begins with where the work happens.',
    sections: [
      [
        'Processing stays in the browser',
        'CSV and XLSX parsing and deterministic reconciliation run in a dedicated browser worker. Raw files are not uploaded by the reconciliation workflow. No financial information is sent to an AI service.',
      ],
      [
        'Choose what is retained',
        'Explicit local saves contain source values and review notes on this device. Optional cloud synchronization accepts carrier configuration or aggregate summaries only. Billing and identity services receive the data needed for accounts and purchases.',
      ],
      [
        'Account boundaries',
        'The server uses Better Auth, verified email ownership, secure sessions, request-origin checks, rate limits and account-scoped database queries. Payment entitlements are derived from signed Paddle events and expiry dates. Credentials are never embedded in the client.',
      ],
      [
        'A transparent security posture',
        'No security certification or independent penetration test is claimed. Production setup, email delivery, payment-provider validation and an independent security review remain release gates. Report technical issues through the configured contact channel without attaching customer statements.',
      ],
    ],
  },
  '/privacy': {
    title: 'Privacy policy — draft.',
    intro:
      'Draft requiring operator identity and jurisdiction-specific review before commercial launch.',
    sections: [
      [
        'Local financial information',
        'The reconciliation workflow processes files on your device. Saving a local run stores normalized source data and notes in browser IndexedDB until you delete them. The app does not encrypt that local database.',
      ],
      [
        'Accounts and optional cloud data',
        'Configured account services store name, email, password hashes, session metadata, selected carrier settings and expressly saved aggregate summaries. Cloud profiles must not contain customer policy data. The hosting provider may process request metadata.',
      ],
      [
        'Service providers',
        'Cloudflare provides hosting and the account database. Resend delivers account verification and reset messages when configured. Paddle processes payments as merchant of record when enabled. Financial input files are not sent to these providers by local reconciliation.',
      ],
      [
        'Retention and your choices',
        'Local runs remain until you remove them or clear browser data. Account settings and summaries remain until individually deleted or account deletion. Operational webhook identifiers are retained for 90 days. Provider billing records follow the provider’s applicable requirements. Export account data from Settings.',
      ],
      [
        'Before launch',
        'The operator must insert its legal name, address, privacy contact, applicable legal bases, regional rights process, cross-border safeguards and final retention schedule after jurisdiction-specific review. This draft is not a representation of compliance.',
      ],
    ],
  },
  '/terms': {
    title: 'Terms of service — draft.',
    intro: 'Draft requiring legal review and complete operator details before paid launch.',
    sections: [
      [
        'Service scope',
        'CommiLedger compares the records and rules you supply. Results identify differences within that evidence. It does not verify an insurance contract, establish a carrier debt or replace your accounting records.',
      ],
      [
        'Your responsibilities',
        'Use data you are authorized to process. Verify mapped fields, statement coverage, expected rates, currencies and source accuracy. Keep backups and follow applicable confidentiality obligations.',
      ],
      [
        'Subscriptions',
        'Proposed starting prices are USD 19 per month for Plus and USD 39 per month for Pro before any applicable checkout adjustments. Live purchasing is available only after provider approval and operational verification. Final renewal, refund and cancellation terms must appear before payment.',
      ],
      [
        'Before commercial launch',
        'The operator must finalize its identity, contact, governing law, dispute process, acceptable use, liability terms, refund policy and consumer-rights disclosures. No commercial readiness is implied by this draft.',
      ],
    ],
  },
  '/faq': {
    title: 'A few useful answers.',
    intro: 'What the product does, and how it reaches its results.',
    sections: [
      [
        'Do I need to create an account?',
        'No. Local CSV/XLSX reconciliation, the calculator, the sample workspace and CSV reports work without an account. Account services are needed for configured cloud features and subscriptions.',
      ],
      [
        'Can it prove a commission was not paid?',
        'An absent entry can indicate a missing payment, incomplete statement coverage or timing differences. CommiLedger shows dates, coverage and evidence so you can investigate without turning an incomplete statement into a definitive claim.',
      ],
      [
        'How does it handle international files?',
        'Select an ISO currency and the appropriate number and date conventions. Each currency is totaled separately. Carrier-specific format compatibility is not claimed without representative testing.',
      ],
      [
        'Will my files be uploaded?',
        'The local reconciliation workflow does not upload your files. Saving a run stores it on this device. Cloud summary sync is optional and sends only aggregate amounts and run metadata after your explicit action.',
      ],
      [
        'What happens when I review a finding?',
        'Your decision and note are appended to that run. Financial totals do not change. Correct the source file and rerun to change amounts or matching evidence.',
      ],
      [
        'Are Plus and Pro available?',
        'The integration is built to require an approved payment account and server-verified subscription. When billing is not configured, the UI clearly disables checkout. Proposed paid features and pricing still require launch validation.',
      ],
    ],
  },
};
export function ArticlePage() {
  const location = useLocation();
  const article = articles[location.pathname];
  if (!article)
    return (
      <div className="article">
        <h1>Page not found</h1>
        <Link to="/">Return home</Link>
      </div>
    );
  return (
    <article className="article">
      <p className="eyebrow">COMMILEDGER / RESOURCES</p>
      <h1>{article.title}</h1>
      <p className="article-intro">{article.intro}</p>
      {article.sections.map(([title, text]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p>{text}</p>
        </section>
      ))}
      <div className="article-bottom">
        <Link className="btn primary" to="/app/import">
          Open reconciliation workspace
        </Link>
        <Link to="/templates">Download templates</Link>
      </div>
    </article>
  );
}
export function Calculator() {
  const [premium, setPremium] = useState('12500'),
    [rate, setRate] = useState('10'),
    [received, setReceived] = useState('1100'),
    [currency, setCurrency] = useState('USD'),
    [kind, setKind] = useState<'percentage' | 'fixed' | 'tiered'>('percentage'),
    [fixed, setFixed] = useState('500'),
    [split, setSplit] = useState('100'),
    [fee, setFee] = useState('0'),
    [tax, setTax] = useState('0'),
    [adjustment, setAdjustment] = useState('0');
  let result = '',
    variance = '',
    error = '';
  try {
    result = calculateCommission(premium, currency, {
      ...defaultRule(),
      kind,
      rate,
      fixed,
      split,
      fee,
      taxRate: tax,
      adjustment,
    });
    variance = decimalInput(received).minus(result).toFixed(currencyDigits(currency));
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section className="tool-page">
      <p className="eyebrow">FREE COMMISSION TOOL</p>
      <h1>Know what to expect.</h1>
      <p>Calculate a commission and compare it with the amount received.</p>
      <div className="calculator">
        <div className="calculator-inputs">
          <label>
            Commission structure
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'percentage' | 'fixed')}
            >
              <option value="percentage">Percentage of premium</option>
              <option value="fixed">Fixed commission</option>
            </select>
          </label>
          <div className="form-grid">
            <label>
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {['USD', 'GBP', 'INR', 'CAD', 'AUD', 'EUR', 'JPY', 'KWD', 'CHF'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              {kind === 'fixed' ? 'Fixed amount' : 'Premium'}
              <input
                inputMode="decimal"
                value={kind === 'fixed' ? fixed : premium}
                onChange={(e) =>
                  kind === 'fixed' ? setFixed(e.target.value) : setPremium(e.target.value)
                }
              />
            </label>
            {kind === 'percentage' && (
              <label>
                Commission rate (%)
                <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
              </label>
            )}
            <label>
              Your split (%)
              <input inputMode="decimal" value={split} onChange={(e) => setSplit(e.target.value)} />
            </label>
            <label>
              Fee deducted
              <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </label>
            <label>
              Tax added (%)
              <input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
            </label>
            <label>
              Adjustment
              <input
                inputMode="decimal"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
              />
            </label>
            <label>
              Amount received
              <input
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="calculator-output" aria-live="polite">
          <span>EXPECTED COMMISSION</span>
          <strong>{error ? '—' : money(result, currency)}</strong>
          <div className="calc-line">
            <span>Received − expected</span>
            <b>{error ? '—' : money(variance, currency)}</b>
          </div>
          {error ? (
            <p role="alert">{error}</p>
          ) : (
            <p>
              {D(variance).lt(0)
                ? 'Received amount is below the calculated expectation. Check your agreement and payment timing.'
                : D(variance).gt(0)
                  ? 'Received amount exceeds the calculated expectation. Review additional adjustments.'
                  : 'The amounts agree.'}
            </p>
          )}
          <small>
            Formula: ((base − fee) × (1 + tax rate) + adjustment) × split. Rounded once, half-up, to
            currency precision.
          </small>
        </div>
      </div>
      <div className="article-bottom">
        <p>Ready to check a complete statement?</p>
        <Link className="btn primary" to="/app/import">
          Reconcile your files
        </Link>
      </div>
    </section>
  );
}
export function Templates() {
  return (
    <section className="tool-page">
      <p className="eyebrow">A CLEAN START</p>
      <h1>Reconciliation templates.</h1>
      <p>
        Two simple CSV files with matching columns. Replace the synthetic row with your records
        before importing.
      </p>
      <div className="feature-grid two">
        {(['expected', 'received'] as const).map((side) => (
          <article className="feature-card" key={side}>
            <FileSpreadsheet size={32} />
            <h2>{side === 'expected' ? 'Expected commissions' : 'Carrier payments'}</h2>
            <p>
              {side === 'expected'
                ? 'Your ledger of payment obligations, including due dates and expected amounts.'
                : 'The actual signed payment entries from your carrier statement.'}
            </p>
            <button
              className="btn secondary"
              onClick={() => download(templateCsv(side), `commiledger-${side}-template.csv`)}
            >
              <Download size={16} /> Download CSV
            </button>
          </article>
        ))}
      </div>
      <p className="notice">
        Keep policy identifiers as text. Use YYYY-MM periods, ISO currencies and explicit due dates.
        The sample row is illustrative, not a commission recommendation.
      </p>
    </section>
  );
}
export const pageTitles: Record<string, string> = {
  '/': 'Every commission, accounted for.',
  '/features': 'Insurance commission reconciliation software',
  '/how-it-works': 'How it works',
  '/guide': 'How to reconcile insurance commissions',
  '/pricing': 'Pricing',
  '/calculator': 'Insurance commission calculator',
  '/templates': 'Insurance commission reconciliation templates',
  '/security': 'Security',
  '/privacy': 'Privacy policy draft',
  '/terms': 'Terms of service draft',
  '/faq': 'FAQ',
  '/docs': 'Documentation',
  '/contact': 'Contact',
  '/signin': 'Sign in',
  '/signup': 'Create account',
  '/reset-password': 'Reset password',
};

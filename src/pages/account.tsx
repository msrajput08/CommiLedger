import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, ShieldCheck, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
export function Pricing() {
  const { status, account, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const checkout = async (plan: string) => {
    setBusy(true);
    try {
      const r = await api('/account/checkout', { plan });
      location.assign(r.url);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pricing-page">
      <p className="eyebrow">START WITH A CLEARER PICTURE</p>
      <h1>
        Simple plans.
        <br />
        Thoughtful limits.
      </h1>
      <p>Start with local reconciliation. Add account workflows when you need them.</p>
      <div className="pricing-grid">
        {[
          {
            name: 'Free',
            price: '0',
            desc: 'Your first clear reconciliation.',
            items: [
              'CSV and XLSX reconciliation',
              'Discrepancy detection and review',
              'Local dashboard and CSV reports',
              'No account required',
            ],
            plan: 'free',
          },
          {
            name: 'Plus',
            price: '19',
            desc: 'A repeatable monthly workflow.',
            items: [
              'Everything in Free',
              'Cloud carrier configuration sync',
              'Aggregate reconciliation history',
              'Server-verified account access',
            ],
            plan: 'plus',
          },
          {
            name: 'Pro',
            price: '39',
            desc: 'More context for operations.',
            items: [
              'Everything in Plus',
              'Cloud configuration audit export',
              'Cloud workflow template sync',
              'Versioned carrier workflow snapshots',
            ],
            plan: 'pro',
          },
        ].map((p) => (
          <article className={`pricing-card ${p.plan === 'plus' ? 'featured' : ''}`} key={p.name}>
            {p.plan === 'plus' && <span className="pricing-label">FOR REGULAR RECONCILIATION</span>}
            <h2>{p.name}</h2>
            <p>{p.desc}</p>
            <div className="price">
              ${p.price}
              <span>/month</span>
            </div>
            <ul>
              {p.items.map((s) => (
                <li key={s}>
                  <Check size={17} />
                  {s}
                </li>
              ))}
            </ul>
            {p.plan === 'free' ? (
              <Link className="btn primary" to="/app/import">
                Start for free
              </Link>
            ) : !status?.billing ? (
              <button className="btn secondary" disabled>
                Paid launch not enabled
              </button>
            ) : !account ? (
              <Link className="btn primary" to="/signup">
                Create account to subscribe
              </Link>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => checkout(p.plan)}>
                Choose {p.name}
                {status.billingEnvironment === 'sandbox' ? ' · sandbox' : ''}
              </button>
            )}
          </article>
        ))}
      </div>
      <p className="pricing-note">
        Proposed starting prices in USD, subject to launch validation. Paid checkout is unavailable
        until provider setup and verification are complete. Planned features are not included as
        working capabilities.
      </p>
      <div className="panel limits-explainer">
        <ShieldCheck size={24} />
        <div>
          <h3>Limits follow measured capacity.</h3>
          <p>
            This release uses the same technical guardrail for all local workflows: 25,000 combined
            rows, 10 MiB per file and 10 files per run or batch. Local reports, saved profiles,
            workflow templates and comparisons are available without a subscription. Paid plans add
            account sync and cloud exports. Team workspaces are not included in this release.
          </p>
        </div>
      </div>
      {account && (
        <button
          className="btn secondary"
          disabled={!status?.billing || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api('/account/portal', {});
              location.assign(r.url);
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Manage subscription, cancellation & invoices
        </button>
      )}
    </section>
  );
}
export function AuthPage() {
  const { pathname, search } = useLocation();
  const signup = pathname === '/signup',
    reset = pathname === '/reset-password';
  const { status, refreshAccount } = useWorkspace();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const token = new URLSearchParams(search).get('token');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (reset) {
        if (token) {
          await api('/auth/reset-password', { newPassword: password, token });
          setMessage('Password reset. You can sign in with your new password.');
        } else {
          await api('/auth/request-password-reset', {
            email,
            redirectTo: `${location.origin}/reset-password`,
          });
          setMessage('If an account exists for that address, a reset email will arrive.');
        }
      } else if (signup) {
        await api('/auth/sign-up/email', {
          email,
          password,
          name,
          callbackURL: `${location.origin}/signin`,
        });
        setMessage('Check your email to verify ownership, then sign in.');
      } else {
        await api('/auth/sign-in/email', { email, password, rememberMe: true });
        await refreshAccount();
        navigate('/app/settings');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-story">
        <p className="eyebrow">COMMISSIONS, WITH CLARITY</p>
        <h1>
          One less thing
          <br />
          to second-guess.
        </h1>
        <p>
          Your files stay on your device. An account connects the optional workflows around them.
        </p>
        <ShieldCheck size={40} />
      </div>
      <form className="auth-form" onSubmit={submit}>
        <h2>{reset ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back.'}</h2>
        <p>
          {signup
            ? 'Keep a consistent workflow, month after month.'
            : 'A clearer picture is waiting.'}
        </p>
        {status && !status.accounts && (
          <div className="notice">
            Account services are not configured on this installation.{' '}
            <Link to="/app/import">Continue with local reconciliation.</Link>
          </div>
        )}
        {signup && (
          <label>
            Your name
            <input
              required
              autoComplete="name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {(!reset || !token) && (
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {(!reset || token) && (
          <label>
            Password
            <input
              required
              type="password"
              autoComplete={signup || reset ? 'new-password' : 'current-password'}
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>At least 12 characters.</small>
          </label>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice success">
            {message}
          </p>
        )}
        <button className="btn primary" disabled={busy || !status?.accounts}>
          {busy ? 'Please wait…' : reset ? 'Reset password' : signup ? 'Create account' : 'Sign in'}
        </button>
        <div className="auth-links">
          {signup ? (
            <Link to="/signin">Already have an account? Sign in</Link>
          ) : (
            <Link to="/signup">Create an account</Link>
          )}
          {!reset && <Link to="/reset-password">Forgot password?</Link>}
        </div>
        <p className="subtle">
          By creating an account you agree to the <Link to="/terms">terms</Link> and{' '}
          <Link to="/privacy">privacy policy</Link>. Commercial terms remain drafts until launch.
        </p>
      </form>
    </div>
  );
}
export function Contact() {
  const { status } = useWorkspace();
  return (
    <article className="article">
      <p className="eyebrow">GET IN TOUCH</p>
      <h1>Let’s make the numbers clearer.</h1>
      <p className="article-intro">Questions about formats, a finding, or a technical issue?</p>
      <section>
        <h2>Product and technical support</h2>
        <p>
          {status?.supportEmail ? (
            <a href={`mailto:${status.supportEmail}`}>{status.supportEmail}</a>
          ) : (
            <>
              A support email has not been configured for this installation. Technical issues can be
              opened in the{' '}
              <a
                href="https://github.com/msrajput08/CommiLedger/issues"
                target="_blank"
                rel="noreferrer"
              >
                CommiLedger repository
              </a>
              .
            </>
          )}
        </p>
        <p>
          Describe the issue, your browser and the steps to reproduce it. Do not post private
          customer data or original commission statements in public issues.
        </p>
      </section>
      <Link className="btn secondary" to="/docs">
        Read the documentation
      </Link>
    </article>
  );
}

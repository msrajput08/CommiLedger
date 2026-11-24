import { useEffect, useRef, useState } from 'react';
import { Routes, Route, NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Files,
  ScanSearch,
  ChartNoAxesCombined,
  Building2,
  History as HistoryIcon,
  FileBarChart2,
  Settings as SettingsIcon,
  BookOpen,
  Sun,
  Moon,
  Play,
  ChevronDown,
  Menu,
  X,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace, workerTask } from './lib/workspace';
import { Brand, LocalBadge, ErrorBoundary } from './components/ui';
import {
  MarketingLayout,
  Home,
  ArticlePage,
  Calculator,
  Templates,
  pageTitles,
} from './pages/marketing';
import { Pricing, AuthPage, Contact } from './pages/account';
import { ImportPage } from './pages/import';
import { Workflows } from './pages/workflows';
import { Overview, ResultsPage } from './pages/results';
import { Profiles, History, Reports, Settings } from './pages/manage';
import { sampleFiles } from './core/sample';
import { defaultConfig, type Run } from './core/types';
const nav = [
  { path: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/app/import', label: 'Reconcile', icon: Files },
  { path: '/app/investigations', label: 'Investigations', icon: ScanSearch },
  { path: '/app/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { path: '/app/profiles', label: 'Carriers & rules', icon: Building2 },
  { path: '/app/workflows', label: 'Workflows', icon: Files },
  { path: '/app/history', label: 'History', icon: HistoryIcon },
  { path: '/app/reports', label: 'Reports', icon: FileBarChart2 },
];
function WorkspaceShell() {
  const { run, setRun, files, setFiles, config, setConfig, theme, toggleTheme, account, notify } =
    useWorkspace();
  const [menu, setMenu] = useState(false),
    [loading, setLoading] = useState('');
  const location = useLocation(),
    navigate = useNavigate(),
    worker = useRef<Worker | null>(null),
    started = useRef(false);
  const demo = async () => {
    setLoading('Preparing sample workspace…');
    try {
      const sample = sampleFiles(),
        settings = {
          ...defaultConfig(),
          asOf: '2026-11-22',
          coverageStart: '2026-08-01',
          coverageEnd: '2026-11-22',
          completeStatement: true,
        };
      const result = await workerTask<Run>(
        {
          type: 'reconcile',
          files: sample,
          config: settings,
          name: 'Sample agency · Aug–Nov 2026',
          sample: true,
        },
        setLoading,
        worker,
      );
      setFiles(sample);
      setConfig(settings);
      setRun(result);
      navigate('/app', { replace: true });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading('');
    }
  };
  useEffect(() => {
    if (new URLSearchParams(location.search).get('demo') === '1' && !started.current) {
      started.current = true;
      void demo();
    }
  }, [location.search]);
  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);
  const title =
    nav.find((n) => n.path === location.pathname)?.label ||
    (location.pathname.endsWith('results')
      ? 'Results'
      : location.pathname.endsWith('settings')
        ? 'Settings'
        : 'Workspace');
  const reviewCount = run?.rows.filter(
    (r) =>
      r.outcome !== 'matched' &&
      !['Resolved', 'Accepted adjustment'].includes(r.review.at(-1)?.status || ''),
  ).length;
  return (
    <div className="app-shell">
      <a className="skip" href="#workspace-main">
        Skip to workspace
      </a>
      <aside
        id="workspace-sidebar"
        className={`sidebar ${menu ? 'open' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setMenu(false);
        }}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-btn sidebar-close"
            aria-label="Close workspace navigation"
            onClick={() => setMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-name">
          <span className="workspace-avatar">{run?.sample ? 'S' : 'L'}</span>
          <div>
            <strong>{run?.sample ? 'Sample agency' : 'Local workspace'}</strong>
            <small>{run?.sample ? 'Synthetic data' : 'Private on this device'}</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-section">WORKSPACE</span>
        <nav aria-label="Workspace navigation">
          {nav.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              to={path}
              key={path}
              end={end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={18} />
              {label}
              {label === 'Investigations' && !!reviewCount && (
                <span className="nav-count">{reviewCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-privacy">
            <span>
              <ShieldCheck size={17} /> Private by design
            </span>
            <p>Reconciliation happens right here, on your device.</p>
          </div>
          <Link to="/docs">
            <BookOpen size={17} /> Help & documentation
          </Link>
          <NavLink to="/app/settings">
            <SettingsIcon size={17} /> Settings
          </NavLink>
          <div className="sidebar-user">
            <span className="user-avatar">{account?.user.name?.[0] || 'L'}</span>
            <div>
              <strong>{account?.user.name || 'Local workspace'}</strong>
              <small>
                {account?.plan ? `${account.plan.toUpperCase()} plan` : 'No account required'}
              </small>
            </div>
            <button
              className="icon-btn"
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <div>
            <button
              className="icon-btn mobile-menu"
              aria-label="Toggle workspace navigation"
              aria-expanded={menu}
              aria-controls="workspace-sidebar"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Workspace <b>/</b> <strong>{title}</strong>
            </span>
          </div>
          <div>
            <LocalBadge />
            <Link className="topbar-pricing" to="/pricing">
              View plans
            </Link>
            <span className="user-avatar small">{account?.user.name?.[0] || 'L'}</span>
          </div>
        </header>
        {run?.sample ? (
          <div className="sample-banner">
            <span>
              <span className="pill">SAMPLE WORKSPACE</span> You’re exploring synthetic data with
              the actual reconciliation engine.
            </span>
            <Link
              to="/app/import"
              onClick={() => {
                setFiles([]);
                setRun(null);
              }}
            >
              Use your own files
            </Link>
          </div>
        ) : (
          <div className="sample-banner neutral">
            <span>Make your first reconciliation easier with an interactive example.</span>
            <button className="text-btn" disabled={!!loading} onClick={demo}>
              <Play size={13} /> Explore sample data
            </button>
          </div>
        )}
        <main id="workspace-main" className="workspace-main">
          {loading ? (
            <div className="notice progress" role="status">
              <span className="spinner" />
              {loading}
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        <div className="workspace-footnote">
          <span>CommiLedger · local-first reconciliation</span>
          <span>Source-backed findings. No automatic carrier confirmation.</span>
        </div>
      </div>
    </div>
  );
}
function Meta() {
  const location = useLocation();
  useEffect(() => {
    document.title = `${location.pathname.startsWith('/app') ? 'Workspace' : pageTitles[location.pathname] || 'CommiLedger'} | CommiLedger`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  return null;
}
export function App() {
  return (
    <ErrorBoundary>
      <WorkspaceProvider>
        <Meta />
        <Routes>
          <Route
            element={
              <MarketingLayout>
                <Outlet />
              </MarketingLayout>
            }
          >
            <Route index element={<Home />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/calculator" element={<Calculator />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/contact" element={<Contact />} />
            {['signin', 'signup', 'reset-password'].map((path) => (
              <Route key={path} path={`/${path}`} element={<AuthPage />} />
            ))}
            {[
              'features',
              'how-it-works',
              'guide',
              'docs',
              'security',
              'privacy',
              'terms',
              'faq',
            ].map((path) => (
              <Route key={path} path={`/${path}`} element={<ArticlePage />} />
            ))}
          </Route>
          <Route path="/app" element={<WorkspaceShell />}>
            <Route index element={<Overview />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="results" element={<ResultsPage />} />
            <Route path="investigations" element={<ResultsPage issues />} />
            <Route path="analytics" element={<Overview analytics />} />
            <Route path="profiles" element={<Profiles />} />
            <Route path="workflows" element={<Workflows />} />
            <Route path="history" element={<History />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route
            path="*"
            element={
              <MarketingLayout>
                <ArticlePage />
              </MarketingLayout>
            }
          />
        </Routes>
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  defaultConfig,
  type Config,
  type Run,
  type ResultRow,
  type ReviewStatus,
  type ImportFile,
} from '../core/types';
import { storage } from './storage';
import { api } from './api';
type Account = {
  user: { id: string; email: string; name: string };
  plan: 'free' | 'plus' | 'pro';
  cloudProfiles: boolean;
  cloudHistory: boolean;
  workflowTemplates: boolean;
  auditExport: boolean;
};
type Context = {
  run: Run | null;
  setRun: (r: Run | null) => void;
  files: ImportFile[];
  setFiles: React.Dispatch<React.SetStateAction<ImportFile[]>>;
  config: Config;
  setConfig: React.Dispatch<React.SetStateAction<Config>>;
  notice: string;
  notify: (s: string) => void;
  review: (ids: string[], status: ReviewStatus, note: string) => void;
  save: () => Promise<void>;
  status: {
    accounts: boolean;
    billing: boolean;
    billingEnvironment: string;
    supportEmail?: string;
  } | null;
  account: Account | null;
  refreshAccount: () => Promise<void>;
  theme: string;
  toggleTheme: () => void;
};
const Workspace = createContext<Context>(null!);
export const useWorkspace = () => useContext(Workspace);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<Run | null>(null),
    [files, setFiles] = useState<ImportFile[]>([]),
    [config, setConfig] = useState(defaultConfig),
    [notice, setNotice] = useState(''),
    [status, setStatus] = useState<Context['status']>(null),
    [account, setAccount] = useState<Account | null>(null),
    [theme, setTheme] = useState(() =>
      typeof window !== 'undefined'
        ? localStorage.getItem('commiledger-theme') || 'light'
        : 'light',
    );
  const notify = useCallback((s: string) => setNotice(s), []);
  const refreshAccount = async () => {
    try {
      setAccount(await api('/account/me'));
    } catch {
      setAccount(null);
    }
  };
  useEffect(() => {
    api('/status')
      .then((s) => {
        setStatus(s);
        if (s.accounts) void refreshAccount();
      })
      .catch(() =>
        setStatus({ accounts: false, billing: false, billingEnvironment: 'unconfigured' }),
      );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('commiledger-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const review = (ids: string[], status: ReviewStatus, note: string) => {
    if (!note.trim()) throw new Error('Add a note explaining the decision');
    setRun((r) =>
      r
        ? {
            ...r,
            rows: r.rows.map((row) =>
              ids.includes(row.id)
                ? {
                    ...row,
                    review: [
                      ...row.review,
                      {
                        status,
                        note: note.trim().slice(0, 2000),
                        at: new Date().toISOString(),
                        actor: account?.user.email || 'Local reviewer',
                      },
                    ],
                  }
                : row,
            ),
          }
        : r,
    );
    notify('Decision recorded in this run. Save the run to keep it on this device.');
  };
  const save = async () => {
    if (!run) return;
    try {
      await storage.saveRun(run);
      notify('Run saved on this device, including source rows and notes.');
    } catch {
      notify(
        'Could not save: browser storage is unavailable or full. Export an audit JSON backup.',
      );
    }
  };
  return (
    <Workspace.Provider
      value={{
        run,
        setRun,
        files,
        setFiles,
        config,
        setConfig,
        notice,
        notify,
        review,
        save,
        status,
        account,
        refreshAccount,
        theme,
        toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </Workspace.Provider>
  );
}
export function workerTask<T>(
  payload: unknown,
  onProgress: (s: string) => void,
  ref: { current: Worker | null },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../core/worker.ts', import.meta.url), { type: 'module' });
    ref.current = worker;
    const terminate = worker.terminate.bind(worker);
    const finish = () => {
      clearTimeout(timer);
      terminate();
      if (ref.current === worker) ref.current = null;
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Processing exceeded 90 seconds. Split the file and try again.'));
    }, 90000);
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.message);
      else {
        finish();
        data.type === 'error' ? reject(new Error(data.message)) : resolve(data.value);
      }
    };
    worker.onerror = () => {
      finish();
      reject(new Error('File processing failed. Check the format or use a smaller file.'));
    };
    // Cancellation rejects the pending task, not just its worker.
    worker.terminate = () => {
      finish();
      reject(new Error('Processing canceled.'));
    };
    worker.postMessage(payload);
  });
}
export function latestStatus(row: ResultRow) {
  return row.review.at(-1)?.status || 'Needs review';
}

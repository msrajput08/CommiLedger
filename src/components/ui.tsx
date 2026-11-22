import { Component, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X, Check, ShieldCheck } from 'lucide-react';
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="CommiLedger home">
      <span className="brand-icon">
        <i />
        <i />
        <i />
        <Check size={16} />
      </span>
      Commi<span>Ledger</span>
    </Link>
  );
}
export function LocalBadge() {
  return (
    <span className="local-badge">
      <ShieldCheck size={14} /> Processed on your device
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">≋</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    const prior = document.activeElement as HTMLElement;
    el?.showModal();
    return () => {
      el?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={wide ? 'modal wide' : 'modal'}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="standalone">
        <h1>This view could not be loaded.</h1>
        <p>Your explicitly saved local runs remain on this device. Reload to recover.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

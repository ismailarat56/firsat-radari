import * as Dialog from '@radix-ui/react-dialog';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
  initialFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  initialFocus?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={contentRef}
          className={`dialog-content ${className}`}
          onOpenAutoFocus={(event) => {
            returnFocus.current = document.activeElement as HTMLElement;
            if (initialFocus) {
              const target = contentRef.current?.querySelector<HTMLElement>(initialFocus);
              if (target) {
                event.preventDefault();
                target.focus();
              }
            }
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus({ preventScroll: true });
            }
          }}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'dialog-description' : 'sr-only'}>
                {description ?? title}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Pencereyi kapat">
              <Icon name="X" />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function EmptyState({
  icon = 'Inbox',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading({ label = 'Çalışma alanın hazırlanıyor…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <Icon name="LoaderCircle" className="spin" size={24} />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <Icon name="AlertCircle" />
      <div>
        <strong>İşlem tamamlanamadı</strong>
        <p>{error instanceof Error ? error.message : 'Beklenmeyen bir sorun oluştu.'}</p>
      </div>
      {onRetry && (
        <button className="button small secondary" onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

type Toast = { id: number; message: string; kind: 'success' | 'error' };
const ToastContext = createContext<(message: string, kind?: Toast['kind']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = ++counter.current;
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    timers.current.push(
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000),
    );
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div className={`toast ${t.kind}`} key={t.id}>
            <Icon name={t.kind === 'success' ? 'CheckCircle2' : 'AlertCircle'} />
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="icon-button"
              aria-label="Bildirimi kapat"
            >
              <Icon name="X" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'neutral';
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="status-dot" />}
      {children}
    </span>
  );
}

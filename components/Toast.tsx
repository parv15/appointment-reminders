import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '@/lib/client/format';

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

interface ToastApi {
  showError: (message: string) => void;
  attempt: <T>(action: () => Promise<T>) => Promise<Attempt<T>>;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast needs a ToastProvider.');
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showError = useCallback((message: string) => {
    clearTimeout(timer.current);
    setToast((current) => ({ message, id: (current?.id ?? 0) + 1 }));
    timer.current = setTimeout(() => setToast(null), 8000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const attempt = useCallback(
    async <T,>(action: () => Promise<T>): Promise<Attempt<T>> => {
      try {
        return { ok: true, value: await action() };
      } catch (error) {
        showError(errorMessage(error));
        return { ok: false, error };
      }
    },
    [showError],
  );

  const api = useMemo(() => ({ showError, attempt }), [showError, attempt]);

  return (
    <ToastContext.Provider value={api}>
      <Toast message={toast?.message ?? null} id={toast?.id ?? 0} />
      {children}
    </ToastContext.Provider>
  );
}

function Toast({ message, id }: { message: string | null; id: number }) {
  return (
    <div id="toast" role="alert" hidden={message === null} key={id}>
      {message}
    </div>
  );
}

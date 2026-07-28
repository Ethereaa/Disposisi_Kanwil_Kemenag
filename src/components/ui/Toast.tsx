import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

const config: Record<ToastType, { icon: typeof CheckCircle2; classes: string }> = {
  success: { icon: CheckCircle2, classes: 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' },
  error: { icon: XCircle, classes: 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200' },
  info: { icon: Info, classes: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200' },
  warning: { icon: AlertTriangle, classes: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => remove(id), 3500);
  }, [remove]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm">
        {toasts.map((t) => {
          const { icon: Icon, classes } = config[t.type];
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 rounded-xl border-l-4 px-4 py-3 shadow-lg animate-slide-in-right ${classes}`}
              role="status"
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
              <button onClick={() => remove(t.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

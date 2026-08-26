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
      {/* MOBILE PLACEMENT
          Before: `top-4 right-4 w-[calc(100vw-2rem)]`. At 360–430px that put a
          full-bleed toast on top of the sticky header for 3.5s, covering the
          menu button and the header actions — the one control a phone user
          needs while a toast is up. It also sized from `100vw` (which includes
          a scrollbar gutter and can exceed the visual viewport) and ignored
          `safe-area-inset-top`, so on a notched device in standalone PWA mode
          the first toast landed under the status bar.

          Now it is inset-anchored and parked just BELOW the header band
          (h-14 on phones, h-16 from `sm:`) plus the top safe area, so nothing
          it covers is interactive. Desktop keeps its original `top-4` corner
          from `lg:` up. The container is pointer-events-none so the page under
          an empty/narrow toast stack stays tappable.

          Placement and hitboxes only — toast(), the type map, the 3.5s
          auto-dismiss and role="status" are untouched. */}
      <div className="pointer-events-none fixed inset-x-3 top-[calc(3.5rem+0.5rem+env(safe-area-inset-top))] z-[100] flex flex-col gap-2 sm:left-auto sm:right-4 sm:top-[calc(4rem+0.5rem+env(safe-area-inset-top))] sm:w-full sm:max-w-sm lg:top-4">
        {toasts.map((t) => {
          const { icon: Icon, classes } = config[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-control border-l-4 px-4 py-3 shadow-overlay animate-slide-in-right ${classes}`}
              role="status"
            >
              <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{t.message}</p>
              {/* 44px on touch (36 from `sm:`), negative margins so the larger
                  hitbox does not grow the toast. Was a bare 16px icon. */}
              <button
                onClick={() => remove(t.id)}
                aria-label="Tutup notifikasi"
                className="focus-ring -my-1.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-chip opacity-70 transition-opacity duration-fast ease-brand hover:opacity-100 sm:-my-1 sm:-mr-1.5 sm:h-9 sm:w-9"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

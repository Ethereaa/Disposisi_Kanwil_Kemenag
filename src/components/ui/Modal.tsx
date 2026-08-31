import type { ReactNode } from 'react';
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Points `aria-describedby` at the body, so assistive tech reads the
   *  content along with the title when the dialog opens. For short, purely
   *  informational bodies only (a confirmation prompt) — on a form modal it
   *  would announce every field before the user has touched anything. */
  describeBody?: boolean;
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** True when no other open dialog panel sits deeper in document order. A
 *  nested dialog (the attachment preview opened from inside a form modal)
 *  renders inside its parent's panel, so it is always last. */
function isTopmostPanel(panel: HTMLElement | null): boolean {
  if (!panel) return false;
  const panels = document.querySelectorAll<HTMLElement>('[data-modal-panel]');
  return panels.length === 0 || panels[panels.length - 1] === panel;
}

export function Modal({ open, onClose, title, children, footer, size = 'md', describeBody }: ModalProps) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Escape. Kept in its own effect because `onClose` is an inline arrow at
  // most call sites, so this effect re-runs on every parent render — the
  // scroll-lock / focus effect below must NOT.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog closes, otherwise one Escape inside a nested
      // preview also closed the form behind it.
      if (e.key === 'Escape' && isTopmostPanel(panelRef.current)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // Reference-counted so a nested modal (e.g. the attachment preview
    // lightbox opened from inside a detail/form modal) doesn't reset
    // overflow while an outer modal is still open.
    const prevCount = Number(document.body.dataset.modalOpenCount || '0');
    document.body.dataset.modalOpenCount = String(prevCount + 1);
    document.body.style.overflow = 'hidden';

    // Initial focus: an opt-in target first (ConfirmModal points this at
    // Batal so a destructive button is never pre-armed), else the first
    // control in the body, else the panel itself. The header close button is
    // deliberately skipped — landing on "×" is not a useful starting point.
    const panel = panelRef.current;
    const returnTo = document.activeElement as HTMLElement | null;
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ?? focusablesIn(bodyRef.current)[0] ?? panel;
    // preventScroll: the dialog is in a fixed overlay, so letting focus()
    // scroll would move the page underneath it instead.
    target?.focus({ preventScroll: true });

    return () => {
      const nextCount = Math.max(0, Number(document.body.dataset.modalOpenCount || '1') - 1);
      document.body.dataset.modalOpenCount = String(nextCount);
      if (nextCount === 0) document.body.style.overflow = '';
      // Hand focus back to whatever opened the dialog, so keyboard users
      // aren't dumped at the top of the document on close.
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    };
  }, [open]);

  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    // Let the innermost dialog own the trap: this handler also sees Tab
    // bubbling out of a nested modal rendered inside our own panel.
    if ((e.target as HTMLElement).closest('[data-modal-panel]') !== panel) return;

    const items = focusablesIn(panel);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    // Bottom sheet on phones, centred dialog from `sm:` up.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        aria-describedby={describeBody ? bodyId : undefined}
        tabIndex={-1}
        data-modal-panel
        onKeyDown={trapTab}
        className={`glass-card relative flex w-full flex-col overflow-hidden rounded-t-panel rounded-b-none max-h-[92dvh] animate-slide-up focus:outline-none sm:rounded-b-panel sm:max-h-[90vh] sm:animate-scale-in ${sizes[size]}`}
      >
        <div
          className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden dark:bg-slate-600"
          aria-hidden="true"
        />
        {title && (
          <div className="flex items-center justify-between gap-2 border-b border-office-border px-5 py-3 dark:border-slate-700">
            <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold text-slate-800 dark:text-slate-100">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="focus-ring -mr-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 sm:h-9 sm:w-9 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        <div ref={bodyRef} id={bodyId} className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="flex flex-col-reverse items-stretch gap-2 border-t border-office-border bg-white/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>*]:justify-center sm:flex-row sm:items-center sm:justify-end sm:pb-3 sm:[&>*]:justify-start dark:border-slate-700 dark:bg-slate-900/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Hapus',
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      describeBody
      footer={
        <>
          {/* Cancel takes the initial focus; the destructive button always
              needs a deliberate move to reach. */}
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Batal
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>
            {danger && <AlertTriangle size={16} aria-hidden="true" />} {confirmLabel}
          </Button>
        </>
      }
    >
      {danger ? (
        <div className="flex gap-3 rounded-control border border-rose-200 bg-rose-50 p-3.5 dark:border-rose-500/40 dark:bg-rose-500/10">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-rose-800 dark:text-rose-200">{message}</p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
      )}
    </Modal>
  );
}

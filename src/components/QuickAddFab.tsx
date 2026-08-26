import { useEffect, useRef, useState } from 'react';
import { Plus, Inbox, Send, Briefcase, X } from 'lucide-react';
import type { PageKey } from '@/types';

export type QuickAddTarget = Extract<PageKey, 'surat-masuk' | 'surat-keluar' | 'agenda-pimpinan'>;

interface QuickAddFabProps {
  onSelect: (target: QuickAddTarget) => void;
}

const options: { key: QuickAddTarget; label: string; icon: typeof Inbox; color: string }[] = [
  { key: 'surat-masuk', label: 'Surat Masuk', icon: Inbox, color: 'bg-blue-600' },
  { key: 'surat-keluar', label: 'Surat Keluar', icon: Send, color: 'bg-emerald-600' },
  { key: 'agenda-pimpinan', label: 'Agenda Pimpinan', icon: Briefcase, color: 'bg-violet-600' },
];

// Floating action button pinned to every authenticated page. Lets staff
// jump straight into "add" for Surat Masuk / Surat Keluar / Agenda
// Pimpinan without navigating to that page first — the most frequent
// action in the app, so it should never be more than 2 taps away.
export function QuickAddFab({ onSelect }: QuickAddFabProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleSelect(target: QuickAddTarget) {
    setOpen(false);
    onSelect(target);
  }

  return (
    // z-30, not z-40. At z-40 the FAB tied with the drawer PANEL and therefore
    // floated above the drawer's z-[35] scrim: opening the navigation menu on a
    // phone left a live "tambah cepat" button burning a hole in the overlay.
    // It now sits with the bottom nav, under the scrim. Vertically it clears
    // the tab bar (76px vs the nav's 56px) so same-layer paint order is moot.
    <div
      ref={rootRef}
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-5 z-30 flex flex-col items-end gap-3 lg:bottom-7 lg:right-7 lg:z-40"
    >
      {open && (
        <div className="flex flex-col items-end gap-2 animate-slide-up">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              // min-h-11: the row was icon-height only (~40px) — the shortest
              // target in the shell.
              <button
                key={o.key}
                onClick={() => handleSelect(o.key)}
                className="focus-ring group flex min-h-11 items-center gap-3 rounded-full bg-white py-2 pl-4 pr-2 text-body-strong text-slate-700 shadow-overlay transition-transform duration-fast ease-brand hover:scale-[1.03] dark:bg-slate-800 dark:text-slate-100"
              >
                {o.label}
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${o.color} text-white`}>
                  <Icon size={16} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Tutup tambah cepat' : 'Tambah cepat'}
        aria-expanded={open}
        className={`focus-ring flex h-14 w-14 items-center justify-center rounded-full brand-solid text-white shadow-overlay transition-transform duration-normal ease-brand hover:scale-105 active:scale-95 ${open ? 'rotate-45' : ''}`}
      >
        {open ? <X size={24} /> : <Plus size={26} />}
      </button>
    </div>
  );
}

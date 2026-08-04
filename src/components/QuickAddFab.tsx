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
    <div
      ref={rootRef}
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-5 z-40 flex flex-col items-end gap-3 lg:bottom-7 lg:right-7"
    >
      {open && (
        <div className="flex flex-col items-end gap-2 animate-slide-up">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.key}
                onClick={() => handleSelect(o.key)}
                className="group flex items-center gap-3 rounded-full bg-white/95 pl-4 pr-2 py-2 text-sm font-medium text-slate-700 shadow-md backdrop-blur transition-transform hover:scale-[1.03] dark:bg-slate-800/95 dark:text-slate-100"
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
        className={`flex h-14 w-14 items-center justify-center rounded-full brand-solid text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${open ? 'rotate-45' : ''}`}
      >
        {open ? <X size={24} /> : <Plus size={26} />}
      </button>
    </div>
  );
}

import { todayISO } from '@/lib/date';

/**
 * Color-codes the free-text `keterangan` field on Agenda Pimpinan:
 * - "Dihadiri"           -> green   (pimpinan hadir langsung)
 * - "Tentatif"           -> amber   (belum pasti)
 * - "Diwakili oleh ..."  -> blue    (diwakilkan)
 * - anything else        -> slate (netral)
 */
export function AgendaStatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-slate-400 dark:text-slate-500">-</span>;

  const v = value.toLowerCase();
  let classes =
    'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300';
  if (v.startsWith('dihadiri')) {
    classes = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  } else if (v.startsWith('tentatif')) {
    classes = 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
  } else if (v.startsWith('diwakili')) {
    classes = 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
  }

  return (
    <span className={`inline-flex max-w-[200px] items-center truncate rounded-md px-2 py-0.5 text-xs font-medium ${classes}`}>
      {value}
    </span>
  );
}

/** Shows a small "Hari Ini" / "Besok" / "Lusa" chip next to a date, computed from ISO yyyy-mm-dd. */
export function DateProximityBadge({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null;
  const today = todayISO();

  const addDaysISO = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  };

  if (iso === today) {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
        Hari Ini
      </span>
    );
  }
  if (iso === addDaysISO(1)) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
        Besok
      </span>
    );
  }
  if (iso === addDaysISO(2)) {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
        Lusa
      </span>
    );
  }
  return null;
}

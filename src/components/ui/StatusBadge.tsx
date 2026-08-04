import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { todayISO } from '@/lib/date';
import type { StatusDisposisi } from '@/types';
import { STATUS_DISPOSISI_LABEL } from '@/types';

/**
 * Renders the Surat Masuk disposisi workflow status (Baru/Diproses/Selesai)
 * with a consistent color everywhere it appears (table, detail modal,
 * dashboard). When `overdue` is true (status is still "Diproses" past the
 * configured threshold — see getOverdueThresholdDays in lib/db.ts), the
 * badge switches to a red "Terlambat" treatment regardless of the
 * underlying status color, since that's the more urgent signal.
 */
export function DisposisiStatusBadge({
  value,
  overdue = false,
}: {
  value: StatusDisposisi;
  overdue?: boolean;
}) {
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-950/50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
        <AlertTriangle size={12} /> Terlambat
      </span>
    );
  }

  const classes: Record<StatusDisposisi, string> = {
    baru: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300',
    diproses: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    selesai: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${classes[value]}`}>
      {STATUS_DISPOSISI_LABEL[value]}
    </span>
  );
}

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

/**
 * Renders the Surat Keluar tanda tangan status ("Sudah TTD" / "Belum TTD")
 * with a consistent color + icon everywhere it appears (table cell, mobile
 * card, detail modal, dashboard, etc.) instead of ad hoc inline markup.
 *
 * - `variant="pill"` (default)  -> rounded chip with background, used in tables/cards/detail.
 * - `variant="plain"`           -> icon + text only, no background, for tighter inline spots
 *   like the Dashboard's recent-activity list.
 */
export function SuratKeluarStatusBadge({
  value,
  variant = 'pill',
}: {
  value: boolean;
  variant?: 'pill' | 'plain';
}) {
  const Icon = value ? CheckCircle2 : XCircle;
  const label = value ? 'Sudah TTD' : 'Belum TTD';
  const textColor = value
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-amber-700 dark:text-amber-300';

  if (variant === 'plain') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${textColor}`}>
        <Icon size={12} /> {label}
      </span>
    );
  }

  const bg = value
    ? 'bg-emerald-50 dark:bg-emerald-950/50'
    : 'bg-amber-50 dark:bg-amber-950/50';

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${bg} ${textColor}`}>
      <Icon size={13} /> {label}
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

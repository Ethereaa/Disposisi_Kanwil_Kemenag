import { CalendarRange, X } from 'lucide-react';

interface DateRangeFilterProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

/** Pair of native date inputs (values stored as ISO yyyy-mm-dd) used to filter tables by a date range. */
export function DateRangeFilter({ start, end, onChange }: DateRangeFilterProps) {
  const active = !!(start || end);
  return (
    <div className="flex items-center gap-1.5">
      <CalendarRange size={14} className="shrink-0 text-office-subtext dark:text-slate-400" />
      <input
        type="date"
        value={start}
        onChange={(e) => onChange(e.target.value, end)}
        className="input-base w-[135px] text-xs sm:text-sm"
        aria-label="Dari tanggal"
      />
      <span className="text-xs text-office-subtext dark:text-slate-500">s/d</span>
      <input
        type="date"
        value={end}
        onChange={(e) => onChange(start, e.target.value)}
        className="input-base w-[135px] text-xs sm:text-sm"
        aria-label="Sampai tanggal"
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange('', '')}
          title="Hapus filter tanggal"
          className="rounded-md p-1 text-office-subtext hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

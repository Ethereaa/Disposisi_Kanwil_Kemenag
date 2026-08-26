import { CalendarRange, X } from 'lucide-react';
import { IconButton } from './IconButton';

interface DateRangeFilterProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

/** Pair of native date inputs (values stored as ISO yyyy-mm-dd) used to filter tables by a date range. */
export function DateRangeFilter({ start, end, onChange }: DateRangeFilterProps) {
  const active = !!(start || end);
  return (
    // This was an unwrapped flex row with two fixed 135px inputs, a separator
    // and a clear button — about 356px of content inside the 328px a 360px
    // phone actually has, so the filter bar overflowed sideways. Now the pair
    // shares one full-width line below `sm` and each input flexes (min-content
    // for a native dd/mm/yyyy control is ~120px, and 360px leaves ~122px
    // each), returning to the original fixed widths from `sm` up. The
    // onChange contract is untouched.
    <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto">
      <CalendarRange size={14} className="hidden shrink-0 text-office-subtext dark:text-slate-400 sm:block" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <input
          type="date"
          value={start}
          onChange={(e) => onChange(e.target.value, end)}
          className="input-base min-h-11 min-w-0 flex-1 text-xs sm:min-h-10 sm:w-[135px] sm:flex-none sm:text-sm"
          aria-label="Dari tanggal"
        />
        <span className="shrink-0 text-xs text-office-subtext dark:text-slate-500">s/d</span>
        <input
          type="date"
          value={end}
          onChange={(e) => onChange(start, e.target.value)}
          className="input-base min-h-11 min-w-0 flex-1 text-xs sm:min-h-10 sm:w-[135px] sm:flex-none sm:text-sm"
          aria-label="Sampai tanggal"
        />
      </div>
      {active && (
        // Was a hand-written `p-1` box — roughly 22px, half the touch minimum,
        // on the one control in the bar that undoes the person's work.
        <IconButton
          size="row"
          tone="subtle"
          icon={<X size={16} />}
          label="Hapus filter tanggal"
          onClick={() => onChange('', '')}
        />
      )}
    </div>
  );
}

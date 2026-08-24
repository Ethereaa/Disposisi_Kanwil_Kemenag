import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';

type StatTone = 'blue' | 'emerald' | 'amber' | 'violet';

// Icon tile only. The tone never touches the card surface, the value or the
// label — four differently-tinted panels side by side is the "card wall" look
// the Dashboard is moving away from, and a coloured number reads as a status
// when it is really just a count.
const tones: Record<StatTone, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
};

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: StatTone;
  /**
   * Where this metric leads. Omit it and the card renders as a plain `<div>`:
   * no button, no hover response, no arrow.
   *
   * That distinction is the whole reason this component exists. The four stat
   * cards it replaces were all buttons, and two of them navigated to
   * 'dashboard' — the page you were already on. They advertised a destination
   * on hover, took the click, and did nothing. A metric with nowhere to go is
   * now visibly information rather than a control that silently no-ops.
   */
  onClick?: () => void;
}

/**
 * One compact KPI figure: icon, value, label.
 *
 * Deliberately dense. The cards this replaces were `p-5` with an `h-11` tile
 * and a hover-revealed "Lihat semua" row, which at four across left most of
 * each card empty and made the KPI band the loudest thing on the page. Here
 * the value carries the hierarchy and the chrome gets out of the way.
 */
export function StatCard({ label, value, icon: Icon, tone = 'emerald', onClick }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${tones[tone]}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        {onClick && (
          <ArrowRight
            size={15}
            aria-hidden="true"
            className="mt-1 shrink-0 text-office-subtext transition-transform duration-fast ease-brand group-hover:translate-x-0.5 group-hover:text-office-primary dark:text-slate-500 dark:group-hover:text-emerald-400"
          />
        )}
      </div>
      {/* tabular-nums so a column of cards doesn't jitter as counts change. */}
      <p className="mt-3 text-display tabular-nums text-office-text dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-label font-normal tracking-normal text-office-subtext dark:text-slate-400">{label}</p>
    </>
  );

  if (!onClick) {
    return <div className="surface p-4">{body}</div>;
  }

  // No aria-label: the button's accessible name comes from its own content
  // ("128 Surat Masuk"), which says more than any label we could write here.
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring surface-raised group p-4 text-left hover:border-office-primary/40 dark:hover:border-emerald-500/40"
    >
      {body}
    </button>
  );
}

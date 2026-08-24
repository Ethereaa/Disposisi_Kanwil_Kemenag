import { Fragment } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';

export interface WorkflowStage {
  key: string;
  label: string;
  value: number;
  /**
   * A rose sub-figure that belongs *inside* this stage — a subset of it, not a
   * stage of its own.
   *
   * This exists for overdue surat masuk. Overdue is not a fourth status: it is
   * a Diproses record whose clock has run past the configured threshold, so it
   * is already counted in that stage's `value`. Rendering it as
   * BARU → DIPROSES → TERLAMBAT → SELESAI would both misdescribe the data
   * model and double-count the same letters, which is exactly what the flat
   * chip row this component replaces did.
   */
  detail?: { label: string; value: number };
}

interface WorkflowPipelineProps {
  stages: WorkflowStage[];
  /** Denominator for the proportion bars. Zero renders every bar empty. */
  total: number;
}

/**
 * A left-to-right pipeline of workflow stages with counts and proportions.
 *
 * Structure over spectacle: three bordered segments, a hairline chevron
 * between them, one thin proportion bar each. It stacks vertically below
 * `sm` — three columns at 360px would put a two-digit count and a rose
 * sub-label into ~100px each — and the single chevron rotates to keep
 * pointing along the flow, so there is no second icon to keep in sync.
 */
export function WorkflowPipeline({ stages, total }: WorkflowPipelineProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
      {stages.map((stage, i) => {
        const pct = total > 0 ? Math.round((stage.value / total) * 100) : 0;
        return (
          <Fragment key={stage.key}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center justify-center self-center text-office-borderStrong dark:text-slate-600 sm:px-2"
              >
                <ChevronRight size={16} className="rotate-90 sm:rotate-0" />
              </span>
            )}
            <div className="surface-subtle min-w-0 flex-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-micro uppercase text-office-subtext dark:text-slate-400">{stage.label}</p>
                <p className="shrink-0 text-micro font-normal tracking-normal tabular-nums text-office-subtext dark:text-slate-500">
                  {pct}%
                </p>
              </div>
              <p className="mt-1 text-title tabular-nums text-office-text dark:text-slate-100">{stage.value}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60">
                <div
                  className="h-full rounded-full bg-office-primary dark:bg-emerald-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {stage.detail && stage.detail.value > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-micro font-normal tracking-normal text-rose-700 dark:text-rose-300">
                  <AlertTriangle size={12} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">
                    <span className="tabular-nums">{stage.detail.value}</span> {stage.detail.label}
                  </span>
                </p>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

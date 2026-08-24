interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface MiniBarChartProps {
  data: BarDatum[];
  height?: number;
  valueSuffix?: string;
}

/** Simple horizontal bar chart, no chart library required. Good for small dashboards. */
export function MiniBarChart({ data, height = 120 }: MiniBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5" style={{ minHeight: height }}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          {/* Narrower name column below `sm`: at 360px the panel has ~280px of
              content and a fixed w-24 left "Kabid Bimas Islam" truncated to
              barely a word while the bar had room to spare. */}
          <span className="w-20 shrink-0 truncate text-body text-office-subtext dark:text-slate-400 sm:w-28" title={d.label}>
            {d.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60">
            <div
              className={`h-full rounded-full ${d.color ?? 'bg-emerald-500'}`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-body-strong tabular-nums text-office-text dark:text-slate-200">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface DualTrendChartProps {
  labels: string[];
  seriesA: number[];
  seriesB: number[];
  legendA: string;
  legendB: string;
}

/**
 * Grouped vertical bar chart (two series per label) rendered as raw SVG.
 *
 * The plot scales with its container; the labels do not. They used to sit
 * inside the SVG at `fontSize: 9`, which only stayed legible while the viewBox
 * kept most of its 560 user units of width — enforced by `min-w-[420px]`
 * inside an `overflow-x-auto`, so a 360px phone got a sideways-scrolling
 * chart. The labels are HTML now, in a flex row of equal cells beneath the
 * plot: both the plot and that row divide the same width into the same number
 * of equal columns, so a label stays under its own group at any size, the type
 * keeps its real size, and nothing scrolls.
 *
 * `preserveAspectRatio="none"` is what lets the plot stretch to fill the
 * width at a CSS-fixed height. Bar heights are therefore exact pixels (the
 * viewBox height matches the rendered height 1:1) and only the horizontal
 * axis scales — harmless for rectangles, which is all this draws.
 */
export function DualTrendChart({ labels, seriesA, seriesB, legendA, legendB }: DualTrendChartProps) {
  const w = 560;
  const h = 128;
  const padBottom = 8;
  const padTop = 8;
  const max = Math.max(1, ...seriesA, ...seriesB);
  const groupWidth = w / labels.length;
  const barWidth = Math.min(16, groupWidth / 3);
  const barAreaH = h - padTop - padBottom;
  const totalA = seriesA.reduce((sum, v) => sum + v, 0);
  const totalB = seriesB.reduce((sum, v) => sum + v, 0);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Grafik batang perbandingan harian. ${legendA}: ${totalA}. ${legendB}: ${totalB}.`}
        className="h-32 w-full"
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={w}
            y1={padTop + barAreaH * f}
            y2={padTop + barAreaH * f}
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth={1}
          />
        ))}
        {labels.map((label, i) => {
          const cx = i * groupWidth + groupWidth / 2;
          const hA = (seriesA[i] / max) * barAreaH;
          const hB = (seriesB[i] / max) * barAreaH;
          return (
            <g key={`${label}-${i}`}>
              <rect
                x={cx - barWidth - 2}
                y={padTop + barAreaH - hA}
                width={barWidth}
                height={hA}
                rx={2}
                className="fill-blue-500"
              />
              <rect
                x={cx + 2}
                y={padTop + barAreaH - hB}
                width={barWidth}
                height={hB}
                rx={2}
                className="fill-emerald-500"
              />
            </g>
          );
        })}
      </svg>
      {/* aria-hidden: read on their own these are seven day names with no
          values attached, which is noise. The svg's aria-label above carries
          the accessible summary instead. */}
      <div className="mt-1.5 flex" aria-hidden="true">
        {labels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="min-w-0 flex-1 truncate text-center text-micro font-normal tracking-normal text-office-subtext dark:text-slate-400"
          >
            {label}
          </span>
        ))}
      </div>
      {/* Totals live in the legend rather than a separate caption line: one
          place to read what each colour is and how much of it there was. */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-label font-normal tracking-normal text-office-subtext dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-blue-500" /> {legendA}
          <span className="tabular-nums text-office-text dark:text-slate-200">{totalA}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" /> {legendB}
          <span className="tabular-nums text-office-text dark:text-slate-200">{totalB}</span>
        </span>
      </div>
    </div>
  );
}

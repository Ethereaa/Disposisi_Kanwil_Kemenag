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
          <span className="w-24 shrink-0 truncate text-xs text-office-subtext dark:text-slate-400" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/50">
            <div
              className={`h-full rounded-full ${d.color ?? 'bg-emerald-500'}`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-office-text dark:text-slate-200">
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

/** Grouped vertical bar chart (two series per day) rendered as raw SVG. */
export function DualTrendChart({ labels, seriesA, seriesB, legendA, legendB }: DualTrendChartProps) {
  const w = 560;
  const h = 160;
  const padBottom = 24;
  const padTop = 8;
  const max = Math.max(1, ...seriesA, ...seriesB);
  const groupWidth = w / labels.length;
  const barWidth = Math.min(16, groupWidth / 3);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[420px]" style={{ height }}>
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={w}
            y1={padTop + (h - padTop - padBottom) * f}
            y2={padTop + (h - padTop - padBottom) * f}
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth={1}
          />
        ))}
        {labels.map((label, i) => {
          const cx = i * groupWidth + groupWidth / 2;
          const barAreaH = h - padTop - padBottom;
          const hA = (seriesA[i] / max) * barAreaH;
          const hB = (seriesB[i] / max) * barAreaH;
          return (
            <g key={label}>
              <rect
                x={cx - barWidth - 2}
                y={padTop + barAreaH - hA}
                width={barWidth}
                height={hA}
                rx={3}
                className="fill-blue-500"
              />
              <rect
                x={cx + 2}
                y={padTop + barAreaH - hB}
                width={barWidth}
                height={hB}
                rx={3}
                className="fill-emerald-500"
              />
              <text
                x={cx}
                y={h - 6}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400"
                style={{ fontSize: 9 }}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-xs text-office-subtext dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> {legendA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> {legendB}
        </span>
      </div>
    </div>
  );
}

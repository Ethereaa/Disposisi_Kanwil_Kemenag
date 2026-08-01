import { useState, useMemo, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  Inbox,
} from 'lucide-react';
import { useDebounce } from '@/lib/useDebounce';
import { EmptyState } from './EmptyState';
import { SkeletonTable } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  className?: string;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  searchKeys: (keyof T)[];
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  filters?: ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  loading?: boolean;
  emptyIcon?: typeof Inbox;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Column key shown as the card title on mobile. Defaults to the first column. */
  mobileTitleKey?: string;
  /** Column key shown as a small line under the title on mobile (e.g. a status/date). */
  mobileSubtitleKey?: string;
  /** Column key whose rendered content is pulled out into a footer action row on mobile, instead of the label/value grid. Defaults to 'actions'. */
  mobileActionsKey?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  searchKeys,
  searchPlaceholder = 'Cari...',
  pageSize = 10,
  emptyMessage = 'Tidak ada data.',
  filters,
  onRowClick,
  initialSort,
  loading = false,
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  mobileTitleKey,
  mobileSubtitleKey,
  mobileActionsKey = 'actions',
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let out = rows;
    const q = debouncedQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (va < vb) return sort.dir === 'asc' ? -1 : 1;
          if (va > vb) return sort.dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }
    return out;
  }, [rows, debouncedQuery, searchKeys, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  if (loading) {
    return <SkeletonTable cols={columns.length} />;
  }

  const titleCol = columns.find((c) => c.key === (mobileTitleKey ?? columns[0]?.key)) ?? columns[0];
  const actionsCol = columns.find((c) => c.key === mobileActionsKey);
  const subtitleCol = mobileSubtitleKey ? columns.find((c) => c.key === mobileSubtitleKey) : undefined;
  const bodyCols = columns.filter(
    (c) => c.key !== titleCol?.key && c.key !== actionsCol?.key && c.key !== subtitleCol?.key,
  );

  const emptyStateEl = (
    <EmptyState
      icon={emptyIcon}
      title={query.trim() ? 'Tidak ada hasil yang cocok' : emptyMessage}
      description={query.trim() ? `Coba kata kunci lain selain "${query.trim()}".` : undefined}
      actionLabel={!query.trim() ? emptyActionLabel : undefined}
      onAction={!query.trim() ? onEmptyAction : undefined}
      compact
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder}
            className="input-base pl-9"
          />
        </div>
        {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
      </div>

      <div className="soft-panel hidden overflow-x-auto sm:block">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 brand-solid text-white">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`px-4 py-3 text-left font-semibold whitespace-nowrap ${c.sortable ? 'cursor-pointer select-none hover:bg-white/10' : ''} ${c.className || ''}`}
                    onClick={() => c.sortable && toggleSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {c.header}
                      {c.sortable && (
                        <span className="opacity-90">
                          {sort?.key === c.key ? (
                            sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                          ) : (
                            <ArrowUpDown size={13} className="opacity-70" />
                          )}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-4">
                    {emptyStateEl}
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-emerald-100/70 transition-colors dark:border-slate-700/60 ${onRowClick ? 'cursor-pointer hover:bg-emerald-50/70 dark:hover:bg-slate-700/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'} ${i % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-800/30' : ''}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 text-slate-700 align-top dark:text-slate-200 ${c.className || ''}`}>
                        {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list — avoids sideways-scrolling a wide table on small screens */}
      <div className="flex flex-col gap-2 sm:hidden">
        {pageRows.length === 0 ? (
          <div className="soft-panel">
            {emptyStateEl}
          </div>
        ) : (
          pageRows.map((row) => (
            <div
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={`rounded-2xl border border-emerald-100/80 bg-white dark:border-slate-700 dark:bg-slate-800/90 p-4 shadow-sm ${onRowClick ? 'cursor-pointer active:bg-emerald-50/70 dark:active:bg-slate-700/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {titleCol && (
                    <div className="truncate font-semibold text-office-text dark:text-slate-100">
                      {titleCol.render ? titleCol.render(row) : (row as Record<string, ReactNode>)[titleCol.key]}
                    </div>
                  )}
                  {subtitleCol && (
                    <div className="mt-0.5 truncate text-xs text-office-subtext dark:text-slate-400">
                      {subtitleCol.render ? subtitleCol.render(row) : (row as Record<string, ReactNode>)[subtitleCol.key]}
                    </div>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {bodyCols.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-office-subtext/80 dark:text-slate-500">{c.header}</dt>
                    <dd className="truncate text-sm text-slate-700 dark:text-slate-200">
                      {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                    </dd>
                  </div>
                ))}
              </dl>

              {actionsCol && (
                <div
                  className="mt-3 flex justify-end border-t border-emerald-100/70 pt-2 dark:border-slate-700/60"
                  onClick={(e) => e.stopPropagation()}
                >
                  {actionsCol.render ? actionsCol.render(row) : (row as Record<string, ReactNode>)[actionsCol.key]}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <p>
            Menampilkan {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} dari {filtered.length} data
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="rounded-xl p-1.5 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed dark:hover:bg-slate-700"><ChevronsLeft size={16} /></button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="rounded-xl p-1.5 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed dark:hover:bg-slate-700"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 font-medium text-slate-700 dark:text-slate-200">{safePage} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="rounded-xl p-1.5 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed dark:hover:bg-slate-700"><ChevronRight size={16} /></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="rounded-xl p-1.5 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed dark:hover:bg-slate-700"><ChevronsRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

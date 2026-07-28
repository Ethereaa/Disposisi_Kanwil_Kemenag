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
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
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
  }, [rows, query, searchKeys, sort, columns]);

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder}
            className="input-base pl-9"
          />
        </div>
        {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-office-border dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/80 backdrop-blur">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`px-4 py-3 text-left font-semibold text-office-text dark:text-slate-200 border-b border-office-border dark:border-slate-700 whitespace-nowrap ${c.sortable ? 'cursor-pointer select-none hover:bg-slate-200/60 dark:hover:bg-slate-800/60' : ''} ${c.className || ''}`}
                    onClick={() => c.sortable && toggleSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {c.header}
                      {c.sortable && (
                        <span className="text-office-subtext dark:text-slate-400">
                          {sort?.key === c.key ? (
                            sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                          ) : (
                            <ArrowUpDown size={13} className="opacity-40" />
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
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-office-subtext dark:text-slate-500">
                    <Inbox size={32} className="mx-auto mb-2 opacity-40" />
                    <p>{emptyMessage}</p>
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-office-border dark:border-slate-700/60 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-700/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'} ${i % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-800/30' : ''}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 text-office-text dark:text-slate-200 align-top ${c.className || ''}`}>
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

      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between text-sm text-office-subtext dark:text-slate-400">
          <p>
            Menampilkan {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} dari {filtered.length} data
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronsLeft size={16} /></button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 font-medium text-office-text dark:text-slate-200">{safePage} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronsRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

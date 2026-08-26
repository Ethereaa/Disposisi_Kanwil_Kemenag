import { useState, useMemo, useRef, type ReactNode } from 'react';
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
import { IconButton } from './IconButton';
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
  /**
   * SECONDARY card fields, in display order: the two or three columns that
   * answer "when?" and "how much?" at a glance. Rendered as one wrapped
   * label-and-value strip directly under the title, ahead of everything else.
   */
  mobileMetaKeys?: string[];
  /**
   * The column holding this row's status control or badge. Pulled out of the
   * body into the card's footer band, next to the actions, so status is always
   * in the same place and always reachable with a thumb.
   */
  mobileStatusKey?: string;
  /** Column key whose rendered content is pulled out into a footer action row on mobile, instead of the label/value grid. Defaults to 'actions'. */
  mobileActionsKey?: string;
  /** Extra classes appended to each row (desktop <tr> and mobile card), e.g. to highlight overdue items. */
  rowClassName?: (row: T) => string;
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
  mobileMetaKeys,
  mobileStatusKey,
  mobileActionsKey = 'actions',
  rowClassName,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  // Callers (SuratMasukPage etc.) pass `columns` and `searchKeys` as fresh
  // array/object literals on every render — they're never memoized there,
  // and rightly so, since `columns` closes over per-render handlers. If
  // those literals sat directly in the dependency array below, filtering
  // and sorting would recompute on every parent re-render (e.g. opening an
  // unrelated modal), not just when the query/sort/rows the person is
  // actually looking at changed. `columnsRef` sidesteps that: it's kept
  // current on every render, but doesn't drive recomputation itself. For
  // `searchKeys` — already just a handful of string keys — comparing by
  // content instead of array identity gets the same effect cheaply.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const searchKeysDep = searchKeys.join('|');

  const filtered = useMemo(() => {
    let out = rows;
    const q = debouncedQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)),
      );
    }
    if (sort) {
      const col = columnsRef.current.find((c) => c.key === sort.key);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchKeysDep stands in for searchKeys (content, not identity); columnsRef.current stands in for columns
  }, [rows, debouncedQuery, searchKeysDep, sort]);

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

  // One place that decides how a cell's content is produced, used by the
  // desktop <td> and by all four card slots. It used to be the same ternary
  // written out five times, which is how a slot ends up quietly disagreeing
  // with the table about what a column renders.
  const cell = (c: Column<T>, row: T): ReactNode =>
    c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key];

  // Mobile information hierarchy. The card used to be title + subtitle + every
  // remaining column in a two-up grid at identical weight — eight truncated
  // fragments that answered no question quickly. Now each column lands in
  // exactly one tier: PRIMARY (title/subtitle), SECONDARY (`mobileMetaKeys`),
  // status and actions (footer band), and whatever is left becomes SUPPORTING.
  // Unannotated tables still get the old behaviour: everything falls through
  // to SUPPORTING.
  const titleCol = columns.find((c) => c.key === (mobileTitleKey ?? columns[0]?.key)) ?? columns[0];
  const actionsCol = columns.find((c) => c.key === mobileActionsKey);
  const subtitleCol = mobileSubtitleKey ? columns.find((c) => c.key === mobileSubtitleKey) : undefined;
  const statusCol = mobileStatusKey ? columns.find((c) => c.key === mobileStatusKey) : undefined;
  const metaCols = (mobileMetaKeys ?? [])
    .map((k) => columns.find((c) => c.key === k))
    .filter((c): c is Column<T> => !!c);
  const claimedKeys = new Set<string | undefined>([
    titleCol?.key,
    actionsCol?.key,
    subtitleCol?.key,
    statusCol?.key,
    ...metaCols.map((c) => c.key),
  ]);
  const bodyCols = columns.filter((c) => !claimedKeys.has(c.key));

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
      {/* Search and filters stack full-width below `sm` so a 360px phone never
          has to scroll sideways to reach a control. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder}
            className="input-base min-h-11 pl-9 sm:min-h-10"
          />
        </div>
        {filters && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{filters}</div>}
      </div>

      {/* Desktop table, from `lg` up only.
          It used to appear at `sm` (640px), which handed a tablet in portrait
          the full eight-to-ten column grid squeezed into ~700px. Every consumer
          of this component is one of the three wide record tables, so raising
          the switch to `lg` costs nothing and gives 768px the card list it
          should have had. `min-w-[60rem]` then keeps the columns legible rather
          than crushing ten of them into whatever is left after the sidebar:
          the panel scrolls inside its own border at 1024 and needs no scroll at
          all by ~1440. This is the one place horizontal scrolling is allowed,
          and it is deliberately not the mobile strategy. */}
      <div className="surface hidden overflow-hidden lg:block">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[60rem] text-body">
            {/* The header was `brand-solid text-white` at 14px — white on
                #059669 is 3.77:1, which fails AA for text this size. A tonal
                step carries a table header perfectly well without asking the
                brand colour to do contrast work it can't: slate-600 on
                slate-100 is ~6.8:1. */}
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={
                      c.sortable
                        ? sort?.key === c.key
                          ? sort.dir === 'asc' ? 'ascending' : 'descending'
                          : 'none'
                        : undefined
                    }
                    className={`bg-slate-100 px-4 py-2.5 text-left text-micro uppercase whitespace-nowrap text-slate-600 dark:bg-slate-800 dark:text-slate-300 ${c.sortable ? 'cursor-pointer select-none hover:bg-slate-200/80 dark:hover:bg-slate-700' : ''} ${c.className || ''}`}
                    onClick={() => c.sortable && toggleSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {c.header}
                      {c.sortable && (
                        <span className={sort?.key === c.key ? 'text-office-primary dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}>
                          {sort?.key === c.key ? (
                            sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                          ) : (
                            <ArrowUpDown size={13} />
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
                pageRows.map((row) => (
                  // Zebra striping is gone. Rows carried a tint, a hover tint
                  // and (on Surat Masuk) an overdue left border all at once,
                  // and the striping was the one of the three that meant
                  // nothing. Hairlines separate rows; the tint is now free to
                  // mean "you are pointing at this".
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-office-border transition-colors duration-fast dark:border-slate-700/60 ${onRowClick ? 'cursor-pointer' : ''} hover:bg-office-bg dark:hover:bg-slate-700/40 ${rowClassName?.(row) ?? ''}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 align-middle text-office-text dark:text-slate-200 ${c.className || ''}`}>
                        {cell(c, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile/tablet record cards, up to `lg`. A real <ul>/<li> list, and the
          tappable region is a real <button> rather than a card-shaped <div>
          with an onClick — so it is keyboard-reachable and announces itself.
          The row actions sit outside that button as siblings, which is what
          keeps a button out of a button. */}
      <ul className="flex flex-col gap-2.5 lg:hidden">
        {pageRows.length === 0 ? (
          <li className="surface">{emptyStateEl}</li>
        ) : (
          pageRows.map((row) => {
            const cardBody = (
              <>
                {titleCol && (
                  <div className="line-clamp-2 text-body-strong text-office-text dark:text-slate-100">
                    {cell(titleCol, row)}
                  </div>
                )}
                {subtitleCol && (
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-label font-normal tracking-normal text-office-subtext dark:text-slate-400">
                    <span className="text-micro uppercase text-office-subtext/70 dark:text-slate-500">
                      {subtitleCol.header}
                    </span>
                    {/* div, not span: a column's render may legitimately return
                        a block element (a chip stacked over a sub-line, an
                        attachment cell), and phrasing content can't hold that. */}
                    <div className="min-w-0">{cell(subtitleCol, row)}</div>
                  </div>
                )}
                {metaCols.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {metaCols.map((c) => (
                      <div key={c.key} className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 text-micro uppercase text-office-subtext/70 dark:text-slate-500">
                          {c.header}
                        </span>
                        <div className="min-w-0 truncate text-label font-normal tracking-normal text-office-text dark:text-slate-200">
                          {cell(c, row)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {bodyCols.length > 0 && (
                  <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-office-border/70 pt-2 dark:border-slate-700/60">
                    {bodyCols.map((c) => (
                      <div key={c.key} className="flex min-w-0 items-center gap-1.5">
                        <dt className="shrink-0 text-micro uppercase text-office-subtext/70 dark:text-slate-500">
                          {c.header}
                        </dt>
                        <dd className="min-w-0 truncate text-label font-normal tracking-normal text-office-text dark:text-slate-300">
                          {cell(c, row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            );

            return (
              <li key={row.id} className={`surface overflow-hidden ${rowClassName?.(row) ?? ''}`}>
                {onRowClick ? (
                  <button
                    type="button"
                    onClick={() => onRowClick(row)}
                    className="focus-ring block w-full p-3.5 text-left active:bg-office-bg dark:active:bg-slate-700/40"
                  >
                    {cardBody}
                  </button>
                ) : (
                  <div className="p-3.5">{cardBody}</div>
                )}

                {/* Footer band: status on the left, actions on the right, and
                    `flex-wrap` so they take a line each at 360px instead of
                    overflowing. */}
                {(statusCol || actionsCol) && (
                  <div
                    className={`flex flex-wrap items-center gap-2 border-t border-office-border bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/30 ${statusCol ? 'justify-between' : 'justify-end'}`}
                  >
                    {statusCol && <div className="min-w-0">{cell(statusCol, row)}</div>}
                    {actionsCol && <div className="flex items-center gap-0.5">{cell(actionsCol, row)}</div>}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>

      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <p>
            Menampilkan {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} dari {filtered.length} data
          </p>
          {/* Reference consumer for <IconButton>: these four were
              hand-written `rounded-xl p-1.5` (~28px, under every touch
              guideline) with their own hover-colour strings. `size="row"`
              gives 44px on touch and the compact 36px back from `lg:` —
              they defaulted to `sm` (36px everywhere), which is the one
              remaining sub-44px target on a phone data page. Handlers are
              unchanged — only the hitbox, focus ring and tone now come
              from the primitive. */}
          <div className="flex items-center gap-1">
            <IconButton
              icon={<ChevronsLeft size={16} />}
              label="Halaman pertama"
              size="row"
              onClick={() => setPage(1)}
              disabled={safePage === 1}
            />
            <IconButton
              icon={<ChevronLeft size={16} />}
              label="Halaman sebelumnya"
              size="row"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
            />
            <span className="px-3 py-1 font-medium text-slate-700 tabular-nums dark:text-slate-200">{safePage} / {totalPages}</span>
            <IconButton
              icon={<ChevronRight size={16} />}
              label="Halaman berikutnya"
              size="row"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
            />
            <IconButton
              icon={<ChevronsRight size={16} />}
              label="Halaman terakhir"
              size="row"
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
            />
          </div>
        </div>
      )}
    </div>
  );
}

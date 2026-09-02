import { useEffect, useState } from 'react';
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { getFurthestAgendaDate, runAgendaPreviewQuery } from '@/lib/db';
import type { AgendaPimpinanPublic } from '@/types';
import {
  formatIndonesianDateRange,
  isoToDisplayWithDay,
  witaDateISO,
  witaDateTimeLabel,
  witaTodayISO,
} from '@/lib/date';
import { loadPreviewAgendas, selectPreviewAgendas } from '@/lib/agendaPreview';
import { AgendaStatusBadge, DateProximityBadge } from '@/components/ui/StatusBadge';

// Public, no-login page. Everything below is presentation over the existing
// preview contract: loadPreviewAgendas() + selectPreviewAgendas() still decide
// WHICH agendas exist here (max 15, WITA day boundaries, chronological,
// nomor_urut tiebreak) — this file only frames them and, with the quick day
// filters, narrows what is shown client-side.
//
// Glass is used for the chrome (header, filter bar, footer) where it sits over
// the canvas and reads as official letterhead. The agenda cards themselves stay
// near-opaque with a real border: they carry the information, and a translucent
// card over a gradient loses contrast in exactly the conditions this page is
// read in — a phone screen, outdoors.
const GLASS =
  'rounded-3xl border border-white/70 bg-white/75 shadow-[0_10px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/65';

type FilterKey = 'semua' | 'hari-ini' | 'besok' | 'lusa';

/**
 * The quick day filters. `offset` is the WITA day offset the chip pins to, or
 * null for "no filter" — the same 0/1/2 offsets the selection algorithm already
 * protects, so a chip can never point at a day the list cannot contain.
 */
const FILTERS: { key: FilterKey; label: string; offset: number | null }[] = [
  { key: 'semua', label: 'Semua', offset: null },
  { key: 'hari-ini', label: 'Hari Ini', offset: 0 },
  { key: 'besok', label: 'Besok', offset: 1 },
  { key: 'lusa', label: 'Lusa', offset: 2 },
];

export function AgendaPreviewHome() {
  const [rows, setRows] = useState<AgendaPimpinanPublic[]>([]);
  const [furthestISO, setFurthestISO] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The instant the fetch actually succeeded, pinned so the footer reports when
  // this page's data was read rather than when it happened to re-render.
  const [loadedAtMs, setLoadedAtMs] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>('semua');
  // Pinned once per mount so the fetch, the selection and the badges all
  // classify days against the same instant. Recomputing witaTodayISO() at
  // render time could straddle WITA midnight and label a row differently
  // from how it was selected.
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    (async () => {
      // allSettled, not all: the header's date range is decoration over the
      // list, so a failure there must not empty a list that loaded fine — and
      // vice versa.
      const [agendas, furthest] = await Promise.allSettled([
        // Several small bounded queries, one per protected WITA day plus one
        // filler — see lib/agendaPreview.ts for why a single windowed query
        // cannot guarantee Besok/Lusa are reachable.
        loadPreviewAgendas(runAgendaPreviewQuery, nowMs),
        getFurthestAgendaDate(witaTodayISO(nowMs)),
      ]);
      if (!mounted) return;
      if (agendas.status === 'fulfilled') {
        setRows(agendas.value);
        setLoadedAtMs(Date.now());
      } else {
        setRows([]);
      }
      setFurthestISO(furthest.status === 'fulfilled' ? furthest.value : null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [nowMs]);

  // Applies the display rule to the fetched rows: guarantee Hari ini / Besok /
  // Lusa each keep a slot, then fill the rest chronologically up to a hard
  // maximum of 15. Unchanged.
  const sortedRows = selectPreviewAgendas(rows, nowMs);

  // The same WITA day the selection used, so a chip can never disagree with
  // it on a device that is not set to WITA.
  const todayWITA = witaTodayISO(nowMs);

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  // Purely client-side over the already-selected rows: no refetch, and the
  // selection above is untouched, so clearing the filter restores the same list.
  const filterISO = active.offset === null ? null : witaDateISO(active.offset, nowMs);
  const visibleRows = filterISO
    ? sortedRows.filter((item) => item.tanggalKegiatan === filterISO)
    : sortedRows;

  // Range starts at the office's today and ends at the furthest agenda actually
  // stored — not at the last rendered row, which the 15-item cap may have cut.
  const rangeLabel = formatIndonesianDateRange(todayWITA, furthestISO);

  const emptyMessage =
    active.offset === null
      ? 'Belum ada agenda pimpinan yang tersimpan.'
      : `Tidak ada agenda untuk ${active.label}.`;

  return (
    <div className="app-canvas relative min-h-dvh overflow-hidden text-slate-800 dark:text-slate-100">
      {/* Ambient wash, so the glass above has something to blur. Decorative and
          inert; contained by the overflow-hidden above so it cannot widen the
          page at 360px. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl dark:bg-teal-500/10" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <header className={`${GLASS} p-5 sm:p-6`}>
          <div className="flex items-center gap-3.5">
            {/* The fixed official mark, referenced straight from /public. The
                <Logo /> component now resolves to this exact same file — the
                settings-configurable logo subsystem it used to read is gone — so
                the two are equivalent; this page keeps the direct <img> because
                nothing about a public official notice should depend on an app
                component it does not otherwise use.
                Decorative here — the heading beside it already names the office,
                and the footer carries the labelled copy. */}
            <img
              src="/kemenag-seeklogo.svg"
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
              className="h-11 w-11 shrink-0 sm:h-12 sm:w-12"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Agenda Pimpinan</h1>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                Kanwil Kemenag Provinsi Gorontalo
              </p>
            </div>
          </div>

          <div className="accent-rule-gold mt-4 h-px w-full" aria-hidden="true" />

          <div className="mt-3.5 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CalendarDays size={16} className="shrink-0" aria-hidden="true" />
            {loading ? (
              <span
                className="inline-block h-4 w-44 animate-pulse rounded bg-emerald-600/15 dark:bg-emerald-400/20"
                aria-hidden="true"
              />
            ) : (
              <span>{rangeLabel}</span>
            )}
          </div>
        </header>

        <div role="group" aria-label="Filter hari agenda" className={`${GLASS} grid grid-cols-4 gap-1.5 p-1.5`}>
          {FILTERS.map((f) => {
            const isActive = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(f.key)}
                className={`focus-ring flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-2xl px-2 text-[13px] font-semibold transition-colors sm:px-3 sm:text-sm ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/60'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div
            role="status"
            className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-400"
          >
            Memuat agenda...
          </div>
        ) : visibleRows.length === 0 ? (
          <div
            role="status"
            className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-400"
          >
            {emptyMessage}
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleRows.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-slate-200/80 border-l-[3px] border-l-emerald-500 bg-white/95 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:border-l-emerald-500 dark:bg-slate-800/95"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                    {isoToDisplayWithDay(item.tanggalKegiatan) || '-'}
                  </p>
                  <DateProximityBadge iso={item.tanggalKegiatan} referenceISO={todayWITA} />
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Clock size={13} aria-hidden="true" />
                    {item.waktuKegiatan ? `${item.waktuKegiatan} WITA` : '--:--'}
                  </span>
                </div>

                <h2 className="mt-1.5 text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">
                  {item.namaKegiatan || 'Agenda'}
                </h2>

                <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex items-start gap-2">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span className="min-w-0">{item.tempatKegiatan || '-'}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Users size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <AgendaStatusBadge value={item.keterangan} />
                    </div>
                    {item.disposisiPegawai && (
                      <div className="ml-[23px] mt-0.5 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="text-emerald-500" aria-hidden="true">›</span>
                        <span className="min-w-0">{item.disposisiPegawai}</span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className={`${GLASS} mt-auto flex flex-col items-center gap-3 p-4 text-center`}>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Terakhir diperbarui:{' '}
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {loadedAtMs === null ? '-' : witaDateTimeLabel(loadedAtMs)}
            </span>
          </p>
          <div className="flex items-center gap-2.5">
            <img
              src="/kemenag-seeklogo.svg"
              alt="Logo Kementerian Agama"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0"
            />
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Kementerian Agama</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Provinsi Gorontalo</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

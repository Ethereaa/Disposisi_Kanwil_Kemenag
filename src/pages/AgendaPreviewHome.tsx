import { useEffect, useState } from 'react';
import { MapPin, Users, Sparkles } from 'lucide-react';
import { runAgendaPreviewQuery } from '@/lib/db';
import type { AgendaPimpinan } from '@/types';
import { isoToDisplayWithDay, witaTodayISO } from '@/lib/date';
import { loadPreviewAgendas, selectPreviewAgendas } from '@/lib/agendaPreview';
import { AgendaStatusBadge, DateProximityBadge } from '@/components/ui/StatusBadge';

export function AgendaPreviewHome() {
  const [rows, setRows] = useState<AgendaPimpinan[]>([]);
  const [loading, setLoading] = useState(true);
  // Pinned once per mount so the fetch, the selection and the badges all
  // classify days against the same instant. Recomputing witaTodayISO() at
  // render time could straddle WITA midnight and label a row differently
  // from how it was selected.
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Several small bounded queries, one per protected WITA day plus one
        // filler — see lib/agendaPreview.ts for why a single windowed query
        // cannot guarantee Besok/Lusa are reachable.
        const data = await loadPreviewAgendas(runAgendaPreviewQuery, nowMs);
        if (mounted) setRows(data);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [nowMs]);

  // Applies the display rule to the fetched rows: drop today's agendas whose
  // time has passed, guarantee Hari ini / Besok / Lusa each keep a slot, then
  // fill the rest chronologically up to a hard maximum of 15.
  const sortedRows = selectPreviewAgendas(rows, nowMs);

  // The same WITA day the selection used, so a chip can never disagree with
  // it on a device that is not set to WITA.
  const todayWITA = witaTodayISO(nowMs);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_35%),linear-gradient(135deg,#f7fcf8,#eef6f2)] p-4 text-slate-800 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_35%),linear-gradient(135deg,#020617,#0f172a)] dark:text-slate-100 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">Agenda Pimpinan Kanwil</p>
              <h1 className="text-xl font-semibold">Daftar Preview Agenda</h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Real Time List Update.</p>
        </div>

        {loading ? (
          <div className="soft-panel p-6 text-center text-sm text-slate-500 dark:text-slate-400">Memuat agenda...</div>
        ) : sortedRows.length === 0 ? (
          <div className="soft-panel p-6 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada agenda pimpinan yang tersimpan.</div>
        ) : (
          <div className="space-y-3">
            {sortedRows.map((item) => (
              <div key={item.id} className="soft-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">{isoToDisplayWithDay(item.tanggalKegiatan) || '-'}</p>
                      <DateProximityBadge iso={item.tanggalKegiatan} referenceISO={todayWITA} />
                    </div>
                    <h2 className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{item.namaKegiatan || 'Agenda'}</h2>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{item.waktuKegiatan ? `${item.waktuKegiatan} WITA` : '--:--'}</div>
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2"><MapPin size={15} className="text-emerald-600" /> {item.tempatKegiatan || '-'}</div>
                  <div>
                    <div className="flex items-center gap-2"><Users size={15} className="text-emerald-600" /> <AgendaStatusBadge value={item.keterangan} /></div>
                    {item.disposisiPegawai && (
                      <div className="ml-[23px] mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="text-emerald-500">›</span> {item.disposisiPegawai}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

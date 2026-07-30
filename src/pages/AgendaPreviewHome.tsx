import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, MapPin, Users, Sparkles } from 'lucide-react';
import { getAllAgendaPimpinan } from '@/lib/db';
import type { AgendaPimpinan } from '@/types';
import { isoToDisplayWithDay } from '@/lib/date';

export function AgendaPreviewHome() {
  const [rows, setRows] = useState<AgendaPimpinan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getAllAgendaPimpinan();
        if (mounted) setRows(data);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const sortedRows = useMemo(
    () =>
      [...rows]
        .sort((a, b) => {
          // Newest tanggalKegiatan first (ISO yyyy-mm-dd sorts correctly as a string).
          const dateA = a.tanggalKegiatan || '0000-00-00';
          const dateB = b.tanggalKegiatan || '0000-00-00';
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          // Same date: most recently added first.
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        })
        .slice(0, 10),
    [rows],
  );

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_35%),linear-gradient(135deg,#f7fcf8,#eef6f2)] p-4 text-slate-800 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_35%),linear-gradient(135deg,#020617,#0f172a)] dark:text-slate-100 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="rounded-[32px] border border-emerald-100/80 bg-white/85 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-800/85">
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
          <div className="rounded-[24px] border border-emerald-100/70 bg-white/70 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/70">Memuat agenda...</div>
        ) : sortedRows.length === 0 ? (
          <div className="rounded-[24px] border border-emerald-100/70 bg-white/70 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/70">Belum ada agenda pimpinan yang tersimpan.</div>
        ) : (
          <div className="space-y-3">
            {sortedRows.map((item) => (
              <a key={item.id} href={`/#/agenda-preview/${item.id}`} className="block rounded-[24px] border border-emerald-100/70 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-800/80">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">{isoToDisplayWithDay(item.tanggalKegiatan) || '-'}</p>
                    <h2 className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{item.namaKegiatan || 'Agenda'}</h2>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{item.waktuKegiatan || '--:--'}</div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                  <div className="flex items-center gap-2"><MapPin size={15} className="text-emerald-600" /> {item.tempatKegiatan || '-'}</div>
                  <div className="flex items-center gap-2"><Users size={15} className="text-emerald-600" /> {item.disposisiPegawai || '-'}</div>
                  <div className="flex items-center gap-2 sm:col-span-2"><Clock3 size={15} className="text-emerald-600" /> {item.keterangan || '-'}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

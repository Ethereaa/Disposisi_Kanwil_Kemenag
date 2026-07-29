import { useMemo } from 'react';
import { Inbox, Send, CalendarCheck, Database, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import type { SuratMasuk, SuratKeluar, PageKey } from '@/types';
import { isoToDisplay, isToday } from '@/lib/date';
import { Button } from '@/components/ui/Button';

interface DashboardProps {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  onNavigate: (p: PageKey) => void;
}

export function Dashboard({ suratMasuk, suratKeluar, onNavigate }: DashboardProps) {
  const stats = useMemo(() => {
    const masukToday = suratMasuk.filter((s) => isToday(s.tanggalDiterima)).length;
    const keluarToday = suratKeluar.filter((s) => isToday(s.tanggalSurat)).length;
    const unsigned = suratKeluar.filter((s) => !s.ditandatangani).length;
    return {
      masuk: suratMasuk.length,
      keluar: suratKeluar.length,
      today: masukToday + keluarToday,
      total: suratMasuk.length + suratKeluar.length,
      unsigned,
    };
  }, [suratMasuk, suratKeluar]);

  const recentMasuk = useMemo(
    () => [...suratMasuk].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [suratMasuk],
  );
  const recentKeluar = useMemo(
    () => [...suratKeluar].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [suratKeluar],
  );

  const cards = [
    { label: 'Surat Masuk', value: stats.masuk, icon: Inbox, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', page: 'surat-masuk' as PageKey },
    { label: 'Surat Keluar', value: stats.keluar, icon: Send, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', page: 'surat-keluar' as PageKey },
    { label: 'Surat Hari Ini', value: stats.today, icon: CalendarCheck, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', page: 'dashboard' as PageKey },
    { label: 'Total Data', value: stats.total, icon: Database, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/40', page: 'dashboard' as PageKey },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-emerald-100/80 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 p-5 text-white shadow-[0_20px_45px_rgba(16,185,129,0.18)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-100">Ringkasan kerja</p>
            <h2 className="mt-1 text-2xl font-semibold">Daftar Disposisi Surat</h2>
            <p className="mt-2 max-w-2xl text-sm text-emerald-50/90">Ringkasan Surat Masuk & Surat Keluar.</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm backdrop-blur">
            Total data: <span className="font-semibold">{stats.total}</span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={() => onNavigate(c.page)}
              className="group bg-white dark:bg-slate-800 rounded-2xl p-5 border border-office-border dark:border-slate-700 shadow-sm hover:shadow-md hover:border-office-primary/30 transition-all text-left animate-slide-up"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`h-11 w-11 rounded-xl ${c.bg} flex items-center justify-center`}>
                  <Icon size={22} className={c.color} />
                </div>
                <TrendingUp size={16} className="text-office-subtext/40 dark:text-slate-600 group-hover:text-office-primary/50 transition-colors" />
              </div>
              <p className="text-3xl font-bold text-office-text dark:text-slate-100 tabular-nums">{c.value}</p>
              <p className="text-sm text-office-subtext dark:text-slate-400 mt-0.5">{c.label}</p>
            </button>
          );
        })}
      </div>

      {/* Quick info */}
      {stats.unsigned > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-3">
          <Clock size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
            Ada <strong>{stats.unsigned}</strong> surat keluar yang belum ditandatangani.
          </p>
          <Button size="sm" variant="outline" onClick={() => onNavigate('surat-keluar')}>Lihat</Button>
        </div>
      )}

      {/* Recent activity */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-office-border dark:border-slate-700">
            <h3 className="font-semibold text-office-text dark:text-slate-100 flex items-center gap-2">
              <Inbox size={18} className="text-blue-600 dark:text-blue-400" /> Surat Masuk Terbaru
            </h3>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('surat-masuk')}>Lihat semua</Button>
          </div>
          <div className="divide-y divide-office-border dark:divide-slate-700/60">
            {recentMasuk.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-office-subtext dark:text-slate-500">Belum ada surat masuk.</p>
            ) : (
              recentMasuk.map((s) => (
                <div key={s.id} className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-office-subtext dark:text-slate-400">No. {s.nomorUrut}</span>
                    <span className="text-xs text-office-subtext dark:text-slate-500">{isoToDisplay(s.tanggalDiterima)}</span>
                  </div>
                  <p className="text-sm font-medium text-office-text dark:text-slate-200 truncate">{s.perihal || '(tanpa perihal)'}</p>
                  <p className="text-xs text-office-subtext dark:text-slate-400 truncate">dari {s.pengirim || '-'} → {s.tujuanDisposisi}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-office-border dark:border-slate-700">
            <h3 className="font-semibold text-office-text dark:text-slate-100 flex items-center gap-2">
              <Send size={18} className="text-emerald-600 dark:text-emerald-400" /> Surat Keluar Terbaru
            </h3>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('surat-keluar')}>Lihat semua</Button>
          </div>
          <div className="divide-y divide-office-border dark:divide-slate-700/60">
            {recentKeluar.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-office-subtext dark:text-slate-500">Belum ada surat keluar.</p>
            ) : (
              recentKeluar.map((s) => (
                <div key={s.id} className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-office-subtext dark:text-slate-400">No. {s.nomorUrut}</span>
                    <span className={`inline-flex items-center gap-1 text-xs ${s.ditandatangani ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      <CheckCircle2 size={12} /> {s.ditandatangani ? 'Sudah TTD' : 'Belum TTD'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-office-text dark:text-slate-200 truncate">{s.perihal || '(tanpa perihal)'}</p>
                  <p className="text-xs text-office-subtext dark:text-slate-400 truncate">dari {s.pengirim || '-'} · {isoToDisplay(s.tanggalSurat)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

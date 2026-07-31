import { useMemo } from 'react';
import { Inbox, Send, CalendarCheck, Database, TrendingUp, Clock, CheckCircle2, BarChart3, PieChart, Paperclip } from 'lucide-react';
import type { SuratMasuk, SuratKeluar, AgendaPimpinan, PageKey } from '@/types';
import { isoToDisplay, isToday, isThisMonth, todayISO } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MiniBarChart, DualTrendChart } from '@/components/ui/MiniBarChart';

interface DashboardProps {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan?: AgendaPimpinan[];
  onNavigate: (p: PageKey) => void;
}

const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

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

  // Last 7 days trend (surat masuk vs surat keluar), oldest first.
  const trend = useMemo(() => {
    const days: { iso: string; label: string }[] = [];
    const today = todayISO();
    const [ty, tm, td] = today.split('-').map(Number);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(ty, tm - 1, td - i, 12);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ iso, label: HARI_SINGKAT[d.getDay()] });
    }
    const seriesA = days.map((d) => suratMasuk.filter((s) => s.tanggalDiterima === d.iso).length);
    const seriesB = days.map((d) => suratKeluar.filter((s) => s.tanggalSurat === d.iso).length);
    return { labels: days.map((d) => d.label), seriesA, seriesB, hasData: seriesA.some((v) => v > 0) || seriesB.some((v) => v > 0) };
  }, [suratMasuk, suratKeluar]);

  // Breakdown of surat masuk per bidang (tujuan disposisi) — who receives the most.
  const perBidang = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of suratMasuk) {
      counts.set(s.tujuanDisposisi, (counts.get(s.tujuanDisposisi) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [suratMasuk]);

  // % of this month's letters (masuk + keluar) that already have a scanned
  // lampiran attached, vs. still missing one — a compliance signal so an
  // admin can see at a glance whether staff are actually scanning surat in,
  // not just recording them.
  const attachmentCompliance = useMemo(() => {
    const masukBulan = suratMasuk.filter((s) => isThisMonth(s.tanggalDiterima));
    const keluarBulan = suratKeluar.filter((s) => isThisMonth(s.tanggalSurat));
    const total = masukBulan.length + keluarBulan.length;
    const withScan =
      masukBulan.filter((s) => s.lampiran?.length > 0).length +
      keluarBulan.filter((s) => s.lampiran?.length > 0).length;
    const without = total - withScan;
    const pct = total > 0 ? Math.round((withScan / total) * 100) : 0;
    return { total, withScan, without, pct };
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

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm p-5">
          <h3 className="font-semibold text-office-text dark:text-slate-100 flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-office-primary dark:text-emerald-400" /> Tren Surat 7 Hari Terakhir
          </h3>
          {trend.hasData ? (
            <DualTrendChart
              labels={trend.labels}
              seriesA={trend.seriesA}
              seriesB={trend.seriesB}
              legendA="Surat Masuk"
              legendB="Surat Keluar"
            />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Belum ada data minggu ini"
              description="Grafik akan muncul setelah ada surat masuk/keluar dalam 7 hari terakhir."
              compact
            />
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm p-5">
          <h3 className="font-semibold text-office-text dark:text-slate-100 flex items-center gap-2 mb-4">
            <PieChart size={18} className="text-office-primary dark:text-emerald-400" /> Surat Masuk per Bidang
          </h3>
          {perBidang.length > 0 ? (
            <MiniBarChart data={perBidang} />
          ) : (
            <EmptyState
              icon={PieChart}
              title="Belum ada surat masuk"
              description="Statistik per bidang akan muncul setelah surat masuk dicatat."
              compact
            />
          )}
        </div>
      </div>

      {/* Attachment compliance */}
      {attachmentCompliance.total > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-office-text dark:text-slate-100 flex items-center gap-2">
                <Paperclip size={18} className="text-office-primary dark:text-emerald-400" /> Kepatuhan Lampiran Bulan Ini
              </h3>
              <p className="text-sm text-office-subtext dark:text-slate-400 mt-0.5">
                {attachmentCompliance.withScan} dari {attachmentCompliance.total} surat bulan ini sudah ada scan lampiran.
              </p>
            </div>
            <div
              className={`shrink-0 text-3xl font-bold tabular-nums ${
                attachmentCompliance.pct >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : attachmentCompliance.pct >= 50
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {attachmentCompliance.pct}%
            </div>
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/50">
            <div
              className={`h-full rounded-full transition-all ${
                attachmentCompliance.pct >= 80
                  ? 'bg-emerald-500'
                  : attachmentCompliance.pct >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${attachmentCompliance.pct}%` }}
            />
          </div>
          {attachmentCompliance.without > 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {attachmentCompliance.without} surat bulan ini belum ada scan lampiran.
            </p>
          )}
        </div>
      )}

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
              <EmptyState
                icon={Inbox}
                title="Belum ada surat masuk"
                description="Tambah sekarang untuk mulai mencatat disposisi surat masuk."
                actionLabel="Tambah Surat Masuk"
                onAction={() => onNavigate('surat-masuk')}
                compact
              />
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
              <EmptyState
                icon={Send}
                title="Belum ada surat keluar"
                description="Tambah sekarang untuk mulai mencatat disposisi surat keluar."
                actionLabel="Tambah Surat Keluar"
                onAction={() => onNavigate('surat-keluar')}
                compact
              />
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

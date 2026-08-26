import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Inbox,
  Send,
  CalendarCheck,
  Database,
  Clock,
  BarChart3,
  PieChart,
  Paperclip,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  MapPin,
  Workflow,
} from 'lucide-react';
import type { SuratMasuk, SuratKeluar, AgendaPimpinan, PageKey } from '@/types';
import {
  isoToDisplay,
  isoToDisplayWithDay,
  isToday,
  isThisMonth,
  todayISO,
  businessDaysSince,
  witaTodayISO,
} from '@/lib/date';
import { getOverdueThresholdDays } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Surface } from '@/components/ui/Surface';
import { StatCard } from '@/components/ui/StatCard';
import { WorkflowPipeline } from '@/components/ui/WorkflowPipeline';
import { MiniBarChart, DualTrendChart } from '@/components/ui/MiniBarChart';
import { SuratKeluarStatusBadge, DateProximityBadge } from '@/components/ui/StatusBadge';

interface DashboardProps {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan?: AgendaPimpinan[];
  onNavigate: (p: PageKey) => void;
}

const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** How many upcoming agendas the "Agenda Terdekat" panel lists. */
const AGENDA_PREVIEW_COUNT = 4;

/**
 * Minutes since midnight for a `waktu_kegiatan` string, for ordering only.
 *
 * `waktu_kegiatan` is `text NOT NULL DEFAULT '00:00'`, so it can be '', a
 * well-formed 'HH:MM', or whatever a hand-edited row left behind. Anything
 * unparseable sorts as minute 0, alongside genuine all-day agendas.
 *
 * lib/agendaPreview.ts has the same helper, unexported. It stays that way:
 * this is Dashboard ordering, and reaching into the public preview's internals
 * would tie a presentation detail here to that module's locked business rules.
 */
function agendaMinutes(waktu: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(waktu.trim());
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return 0;
  return h * 60 + min;
}

export function Dashboard({ suratMasuk, suratKeluar, agendaPimpinan, onNavigate }: DashboardProps) {
  const [overdueThreshold, setOverdueThreshold] = useState(3);

  useEffect(() => {
    getOverdueThresholdDays().then(setOverdueThreshold).catch(() => {
      // Non-critical — falls back to the component's default of 3.
    });
  }, []);

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

  // Disposisi workflow breakdown (Baru/Diproses/Selesai) for Surat Masuk,
  // plus how many "Diproses" records have sat past the overdue threshold —
  // mirrors the isOverdue() logic in SuratMasukPage so the two screens
  // never disagree about what counts as overdue.
  const statusStats = useMemo(() => {
    const baru = suratMasuk.filter((s) => s.statusDisposisi === 'baru').length;
    const diproses = suratMasuk.filter((s) => s.statusDisposisi === 'diproses').length;
    const selesai = suratMasuk.filter((s) => s.statusDisposisi === 'selesai').length;
    const overdue = suratMasuk.filter(
      (s) => s.statusDisposisi === 'diproses' && businessDaysSince(s.statusUpdatedAt) >= overdueThreshold,
    ).length;
    return { baru, diproses, selesai, overdue };
  }, [suratMasuk, overdueThreshold]);

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

  // The reference day for "upcoming", captured per render like todayISO() is
  // in `trend` above — this page does not re-render on a midnight timer.
  const witaToday = witaTodayISO();

  // Upcoming agenda, from the agendaPimpinan prop App.tsx has always passed
  // and this page has always ignored. No query, no RPC: the same array the
  // Agenda Pimpinan page and the exporter already receive.
  //
  // "Upcoming" is a plain date comparison against the WITA day, so an agenda
  // dated today stays listed for the whole working day even after its
  // scheduled time — the same reading of the day the rest of the app uses.
  // It is written out here rather than imported from lib/agendaPreview.ts so
  // that a future change to the public preview's rules cannot silently
  // reshape the Dashboard, and so this panel is not mistaken for part of
  // that module's locked rule surface.
  const agendaTerdekat = useMemo(() => {
    const rows = agendaPimpinan ?? [];
    return rows
      .filter((a) => !!a.tanggalKegiatan && a.tanggalKegiatan >= witaToday)
      .sort((a, b) => {
        const byDate = (a.tanggalKegiatan ?? '').localeCompare(b.tanggalKegiatan ?? '');
        if (byDate !== 0) return byDate;
        const byTime = agendaMinutes(a.waktuKegiatan) - agendaMinutes(b.waktuKegiatan);
        if (byTime !== 0) return byTime;
        return a.nomorUrut - b.nomorUrut;
      })
      .slice(0, AGENDA_PREVIEW_COUNT);
  }, [agendaPimpinan, witaToday]);

  const attentionCount = (statusStats.overdue > 0 ? 1 : 0) + (stats.unsigned > 0 ? 1 : 0);

  const compliancePct = attachmentCompliance.pct;
  const complianceTone =
    compliancePct >= 80
      ? { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' }
      : compliancePct >= 50
        ? { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' }
        : { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── A. PAGE CONTEXT ────────────────────────────────────────────────
          One intro band, and the page's only <h1>. Deliberately not the
          emerald gradient hero it replaces: that put 12px copy on a surface
          where white text lands at 3.8:1, and a second full-bleed gradient
          system is what the foundation phase set out to stop. The one
          decorative flourish is the sanctioned gold hairline — a trim, not a
          theme. */}
      <section aria-labelledby="dashboard-title" className="surface overflow-hidden">
        <span aria-hidden="true" className="accent-rule-gold block h-0.5 w-full" />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-micro uppercase text-office-subtext dark:text-slate-500">
              Kanwil Kemenag Provinsi Gorontalo
            </p>
            <h1 id="dashboard-title" className="mt-1 text-display text-office-text dark:text-slate-50">
              Dashboard
            </h1>
            <p className="mt-1.5 max-w-xl text-body text-office-subtext dark:text-slate-400">
              Ringkasan operasional surat masuk, surat keluar dan agenda pimpinan.
            </p>
          </div>
          <dl className="flex shrink-0 flex-wrap gap-2">
            <div className="surface-subtle px-3 py-2">
              <dt className="text-micro uppercase text-office-subtext dark:text-slate-500">Hari ini</dt>
              <dd className="mt-0.5 text-body-strong text-office-text dark:text-slate-100">
                {isoToDisplayWithDay(todayISO())}
              </dd>
            </div>
            <div className="surface-subtle px-3 py-2">
              <dt className="text-micro uppercase text-office-subtext dark:text-slate-500">Total data</dt>
              <dd className="mt-0.5 text-body-strong tabular-nums text-office-text dark:text-slate-100">
                {stats.total}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── B. ATTENTION ───────────────────────────────────────────────────
          First, because "what needs attention?" is the first question this
          page exists to answer. These two alerts used to sit at the very
          bottom, below the hero, the stats, the charts and the compliance
          panel. Nothing is invented: same two counts, same two destinations,
          moved to the top and given the weight they were always due. */}
      <section aria-label="Perlu perhatian">
        {attentionCount === 0 ? (
          // No empty warning cards. One line is the whole message.
          <p className="flex items-center gap-2 text-body text-office-subtext dark:text-slate-400">
            <CheckCircle2 size={16} aria-hidden="true" className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            Tidak ada surat terlambat atau menunggu tanda tangan.
          </p>
        ) : (
          <div className={`grid gap-3 ${attentionCount > 1 ? 'sm:grid-cols-2' : ''}`}>
            {statusStats.overdue > 0 && (
              <AttentionCard
                tone="rose"
                icon={AlertTriangle}
                value={statusStats.overdue}
                title="Surat masuk terlambat diproses"
                description={`Masih berstatus Diproses melewati batas ${overdueThreshold} hari kerja.`}
                actionLabel="Buka Surat Masuk"
                onAction={() => onNavigate('surat-masuk')}
              />
            )}
            {stats.unsigned > 0 && (
              <AttentionCard
                tone="amber"
                icon={Clock}
                value={stats.unsigned}
                title="Surat keluar belum ditandatangani"
                description="Menunggu tanda tangan sebelum dapat dikirim."
                actionLabel="Buka Surat Keluar"
                onAction={() => onNavigate('surat-keluar')}
              />
            )}
          </div>
        )}
      </section>

      {/* ── C. KPI ─────────────────────────────────────────────────────────
          Two of these lead somewhere and are buttons. Two do not and are
          plain text — see StatCard: "Surat Hari Ini" and "Total Data" were
          buttons wired to onNavigate('dashboard'), i.e. to this very page.

          `md:grid-cols-4` (768px) rather than waiting for `lg`. At 768 there
          is no sidebar yet, so the column is ~720px wide — four 2×2-stacked
          tiles left half the band as whitespace and read like a phone layout
          stretched. Four across at ~170px each is the intentional tablet
          density; 360–430 keeps 2×2. */}
      <section aria-label="Ringkasan angka" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Surat Masuk"
          value={stats.masuk}
          icon={Inbox}
          tone="blue"
          onClick={() => onNavigate('surat-masuk')}
        />
        <StatCard
          label="Surat Keluar"
          value={stats.keluar}
          icon={Send}
          tone="emerald"
          onClick={() => onNavigate('surat-keluar')}
        />
        <StatCard label="Surat Hari Ini" value={stats.today} icon={CalendarCheck} tone="amber" />
        <StatCard label="Total Data" value={stats.total} icon={Database} tone="violet" />
      </section>

      {/* ── D. WORKFLOW ────────────────────────────────────────────────────
          Where incoming letters stand. One action for the whole panel rather
          than a clickable stage each: SuratMasukPage keeps statusFilter in
          its own state, so a per-stage link would have to invent cross-page
          filtering, and a stage that looked clickable but landed on an
          unfiltered list would be the dead click all over again. */}
      <Surface as="section" aria-labelledby="workflow-heading" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h2
              id="workflow-heading"
              className="flex items-center gap-2 text-heading text-office-text dark:text-slate-100"
            >
              <Workflow size={18} aria-hidden="true" className="shrink-0 text-office-primary dark:text-emerald-400" />
              Alur Surat Masuk
            </h2>
            <p className="mt-0.5 text-label font-normal tracking-normal text-office-subtext dark:text-slate-400">
              Posisi {stats.masuk} surat masuk dalam alur disposisi.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onNavigate('surat-masuk')}>
            Lihat semua
          </Button>
        </div>
        {stats.masuk > 0 ? (
          <div className="mt-4">
            <WorkflowPipeline
              total={stats.masuk}
              stages={[
                { key: 'baru', label: 'Baru', value: statusStats.baru },
                {
                  key: 'diproses',
                  label: 'Diproses',
                  value: statusStats.diproses,
                  // Subset of this stage, not a stage after it.
                  detail: { label: 'terlambat', value: statusStats.overdue },
                },
                { key: 'selesai', label: 'Selesai', value: statusStats.selesai },
              ]}
            />
          </div>
        ) : (
          <EmptyState
            icon={Inbox}
            title="Belum ada surat masuk"
            description="Alur disposisi akan muncul setelah surat masuk dicatat."
            compact
          />
        )}
      </Surface>

      {/* ── E. AGENDA ──────────────────────────────────────────────────────
          Presentation only: no create/edit here, and no change to how agenda
          data is loaded or to the public preview's rules. */}
      <Surface as="section" aria-labelledby="agenda-heading" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="agenda-heading" className="flex items-center gap-2 text-heading text-office-text dark:text-slate-100">
            <CalendarClock size={18} aria-hidden="true" className="shrink-0 text-office-primary dark:text-emerald-400" />
            Agenda Terdekat
          </h2>
          <Button size="sm" variant="ghost" onClick={() => onNavigate('agenda-pimpinan')}>
            Lihat semua
          </Button>
        </div>
        {agendaTerdekat.length > 0 ? (
          <ul className="mt-2 divide-y divide-office-border dark:divide-slate-700/60">
            {agendaTerdekat.map((a) => (
              <li key={a.id} className="py-3 first:pt-2 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-label text-office-text dark:text-slate-200">
                    {isoToDisplay(a.tanggalKegiatan)}
                  </span>
                  {/* WITA reference, matching the day the list above selects on. */}
                  <DateProximityBadge iso={a.tanggalKegiatan} referenceISO={witaToday} />
                  <span className="text-label font-normal tracking-normal tabular-nums text-office-subtext dark:text-slate-400">
                    {a.waktuKegiatan ? `${a.waktuKegiatan} WITA` : '-'}
                  </span>
                </div>
                <p className="mt-1 truncate text-body-strong text-office-text dark:text-slate-100">
                  {a.namaKegiatan || '(tanpa nama kegiatan)'}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-label font-normal tracking-normal text-office-subtext dark:text-slate-400">
                  <MapPin size={12} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{a.tempatKegiatan || '-'}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="Belum ada agenda terdekat"
            description="Agenda hari ini dan seterusnya akan muncul di sini."
            compact
          />
        )}
      </Surface>

      {/* ── F. ANALYSIS ────────────────────────────────────────────────────
          Secondary. Grouped under one quiet section label, with panel titles
          a step down from the zones above, so the charts stop competing with
          the alerts and the KPI band for first read. */}
      <section aria-labelledby="analysis-heading" className="space-y-3">
        <h2 id="analysis-heading" className="text-micro uppercase text-office-subtext dark:text-slate-500">
          Analisis
        </h2>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Surface className="p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-body-strong text-office-text dark:text-slate-100">
              <BarChart3 size={16} aria-hidden="true" className="shrink-0 text-office-subtext dark:text-slate-400" />
              Tren Surat 7 Hari Terakhir
            </h3>
            {trend.hasData ? (
              <div className="mt-4">
                <DualTrendChart
                  labels={trend.labels}
                  seriesA={trend.seriesA}
                  seriesB={trend.seriesB}
                  legendA="Surat Masuk"
                  legendB="Surat Keluar"
                />
              </div>
            ) : (
              <EmptyState
                icon={BarChart3}
                title="Belum ada data minggu ini"
                description="Grafik akan muncul setelah ada surat masuk/keluar dalam 7 hari terakhir."
                compact
              />
            )}
          </Surface>

          <Surface className="p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-body-strong text-office-text dark:text-slate-100">
              <PieChart size={16} aria-hidden="true" className="shrink-0 text-office-subtext dark:text-slate-400" />
              Surat Masuk per Bidang
            </h3>
            {perBidang.length > 0 ? (
              <div className="mt-4">
                <MiniBarChart data={perBidang} />
              </div>
            ) : (
              <EmptyState
                icon={PieChart}
                title="Belum ada surat masuk"
                description="Statistik per bidang akan muncul setelah surat masuk dicatat."
                compact
              />
            )}
          </Surface>
        </div>

        {/* Attachment compliance, demoted from a full panel with a 30px
            percentage to one supporting row. Same metric, same thresholds
            (80 / 50), same attachment logic — it simply no longer shouts as
            loudly as an overdue surat. */}
        {attachmentCompliance.total > 0 && (
          <div className="surface-subtle flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <Paperclip size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-office-subtext dark:text-slate-400" />
              <div className="min-w-0">
                <p className="text-body-strong text-office-text dark:text-slate-100">Kepatuhan Lampiran Bulan Ini</p>
                <p className="mt-0.5 text-label font-normal tracking-normal text-office-subtext dark:text-slate-400">
                  {attachmentCompliance.withScan} dari {attachmentCompliance.total} surat sudah ada scan lampiran
                  {attachmentCompliance.without > 0 ? ` · ${attachmentCompliance.without} belum` : ''}.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:w-52">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60">
                <div className={`h-full rounded-full ${complianceTone.bar}`} style={{ width: `${compliancePct}%` }} />
              </div>
              <span className={`shrink-0 text-body-strong tabular-nums ${complianceTone.text}`}>{compliancePct}%</span>
            </div>
          </div>
        )}
      </section>

      {/* ── G. RECENT ACTIVITY ─────────────────────────────────────────────
          items-start, so an empty panel beside a full one sizes to its own
          content instead of stretching to match. Rows are <li>, not the
          hover-highlighted <div>s they were: there is no per-record route to
          open, so nothing here should look clickable. */}
      <section aria-label="Aktivitas terbaru" className="grid items-start gap-4 lg:grid-cols-2">
        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-office-border px-4 py-3 dark:border-slate-700 sm:px-5">
            <h2 className="flex items-center gap-2 text-body-strong text-office-text dark:text-slate-100">
              <Inbox size={16} aria-hidden="true" className="shrink-0 text-blue-600 dark:text-blue-400" />
              Surat Masuk Terbaru
            </h2>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('surat-masuk')}>
              Lihat semua
            </Button>
          </div>
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
            <ul className="divide-y divide-office-border dark:divide-slate-700/60">
              {recentMasuk.map((s) => (
                <ActivityRow
                  key={s.id}
                  nomorUrut={s.nomorUrut}
                  meta={isoToDisplay(s.tanggalDiterima)}
                  title={s.perihal || '(tanpa perihal)'}
                  subtitle={`dari ${s.pengirim || '-'} → ${s.tujuanDisposisi}`}
                />
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-office-border px-4 py-3 dark:border-slate-700 sm:px-5">
            <h2 className="flex items-center gap-2 text-body-strong text-office-text dark:text-slate-100">
              <Send size={16} aria-hidden="true" className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              Surat Keluar Terbaru
            </h2>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('surat-keluar')}>
              Lihat semua
            </Button>
          </div>
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
            <ul className="divide-y divide-office-border dark:divide-slate-700/60">
              {recentKeluar.map((s) => (
                <ActivityRow
                  key={s.id}
                  nomorUrut={s.nomorUrut}
                  meta={<SuratKeluarStatusBadge value={s.ditandatangani} variant="plain" />}
                  title={s.perihal || '(tanpa perihal)'}
                  subtitle={`dari ${s.pengirim || '-'} · ${isoToDisplay(s.tanggalSurat)}`}
                />
              ))}
            </ul>
          )}
        </Surface>
      </section>
    </div>
  );
}

interface AttentionCardProps {
  tone: 'rose' | 'amber';
  icon: LucideIcon;
  value: number;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

// Local to the Dashboard: two uses, one shape, and no other page has an
// attention zone to share it with. It moves into ui/ the day a second page
// needs one, not before.
function AttentionCard({ tone, icon: Icon, value, title, description, actionLabel, onAction }: AttentionCardProps) {
  const styles =
    tone === 'rose'
      ? {
          panel: 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30',
          tile: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
          value: 'text-rose-700 dark:text-rose-300',
          title: 'text-rose-900 dark:text-rose-100',
          description: 'text-rose-800/80 dark:text-rose-200/70',
        }
      : {
          panel: 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
          tile: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
          value: 'text-amber-700 dark:text-amber-300',
          title: 'text-amber-900 dark:text-amber-100',
          description: 'text-amber-800/80 dark:text-amber-200/70',
        };

  return (
    <div className={`rounded-panel border p-4 ${styles.panel}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${styles.tile}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {/* The count and the label are one sentence to a screen reader
              because they are one sentence: "7 Surat masuk terlambat …". */}
          <p className={`text-title tabular-nums ${styles.value}`}>{value}</p>
          <p className={`mt-0.5 text-body-strong ${styles.title}`}>{title}</p>
          <p className={`mt-0.5 text-label font-normal tracking-normal ${styles.description}`}>{description}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onAction} className="mt-3">
        {actionLabel}
      </Button>
    </div>
  );
}

interface ActivityRowProps {
  nomorUrut: number;
  /** Right-aligned trailing marker: a date string, or a status badge. */
  meta: ReactNode;
  title: string;
  subtitle: string;
}

/** One recent-activity row. Shared chrome for the two lists below the charts. */
function ActivityRow({ nomorUrut, meta, title, subtitle }: ActivityRowProps) {
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-office-subtext dark:text-slate-400">No. {nomorUrut}</span>
        <span className="shrink-0 text-label font-normal tracking-normal text-office-subtext dark:text-slate-500">
          {meta}
        </span>
      </div>
      <p className="mt-1 truncate text-body-strong text-office-text dark:text-slate-100">{title}</p>
      <p className="mt-0.5 truncate text-label font-normal tracking-normal text-office-subtext dark:text-slate-400">
        {subtitle}
      </p>
    </li>
  );
}

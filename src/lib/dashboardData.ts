import { businessDaysSince, todayISO, witaTodayISO } from '@/lib/date';
import { getOverdueThresholdDays } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const DASHBOARD_PAGE_SIZE = 1000;
const DASHBOARD_ROW_CAP = 20000;
const AGENDA_PREVIEW_COUNT = 4;

// Mirrors the fallback Dashboard.tsx used to carry inline (`useState(3)` plus a
// swallowed catch): the office threshold lives in app_settings, and a failed
// read of it must not take the whole summary down with it. The overdue figure
// is one card on the page, not the page.
const OVERDUE_THRESHOLD_FALLBACK = 3;

const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

interface MasukProjectionRow {
  id: string;
  nomor_urut: number;
  tanggal_diterima: string | null;
  tujuan_disposisi: string;
  status_disposisi: string;
  status_updated_at: string;
}

interface KeluarProjectionRow {
  id: string;
  nomor_urut: number;
  tanggal_surat: string | null;
  ditandatangani: boolean;
}

interface AgendaProjectionRow {
  id: string;
  nomor_urut: number;
  tanggal_kegiatan: string | null;
  waktu_kegiatan: string | null;
  nama_kegiatan: string;
  tempat_kegiatan: string;
}

interface RecentMasukRow {
  id: string;
  nomor_urut: number;
  tanggal_diterima: string | null;
  perihal: string;
  pengirim: string;
  tujuan_disposisi: string;
}

interface RecentKeluarRow {
  id: string;
  nomor_urut: number;
  tanggal_surat: string | null;
  perihal: string;
  pengirim: string;
  ditandatangani: boolean;
}

export interface DashboardRecentMasuk {
  id: string;
  nomorUrut: number;
  tanggalDiterima: string | null;
  perihal: string;
  pengirim: string;
  tujuanDisposisi: string;
}

export interface DashboardRecentKeluar {
  id: string;
  nomorUrut: number;
  tanggalSurat: string | null;
  perihal: string;
  pengirim: string;
  ditandatangani: boolean;
}

export interface DashboardAgendaItem {
  id: string;
  nomorUrut: number;
  tanggalKegiatan: string | null;
  waktuKegiatan: string;
  namaKegiatan: string;
  tempatKegiatan: string;
}

export interface DashboardSnapshot {
  stats: {
    masuk: number;
    keluar: number;
    today: number;
    total: number;
    unsigned: number;
  };
  statusStats: {
    baru: number;
    diproses: number;
    selesai: number;
    overdue: number;
  };
  trend: {
    labels: string[];
    seriesA: number[];
    seriesB: number[];
    hasData: boolean;
  };
  perBidang: Array<{
    label: string;
    value: number;
  }>;
  recentMasuk: DashboardRecentMasuk[];
  recentKeluar: DashboardRecentKeluar[];
  agendaTerdekat: DashboardAgendaItem[];
  overdueThreshold: number;
}

function assertWithinDashboardCap(table: string, rowCount: number): void {
  if (rowCount >= DASHBOARD_ROW_CAP) {
    throw new Error(
      `Data ${table} mencapai batas ${DASHBOARD_ROW_CAP.toLocaleString('id-ID')} baris untuk ringkasan Dashboard. ` +
      'Gunakan agregasi server sebelum melanjutkan agar statistik tidak ditampilkan sebagian.',
    );
  }
}

async function fetchMasukProjection(): Promise<MasukProjectionRow[]> {
  const rows: MasukProjectionRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + DASHBOARD_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('surat_masuk')
      .select(
        'id, nomor_urut, tanggal_diterima, tujuan_disposisi, status_disposisi, status_updated_at',
      )
      .order('nomor_urut', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const batch = (data ?? []) as MasukProjectionRow[];
    rows.push(...batch);

    if (batch.length < DASHBOARD_PAGE_SIZE) {
      return rows;
    }

    assertWithinDashboardCap('Surat Masuk', rows.length);
    from += DASHBOARD_PAGE_SIZE;
  }
}

async function fetchKeluarProjection(): Promise<KeluarProjectionRow[]> {
  const rows: KeluarProjectionRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + DASHBOARD_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('surat_keluar')
      .select('id, nomor_urut, tanggal_surat, ditandatangani')
      .order('nomor_urut', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const batch = (data ?? []) as KeluarProjectionRow[];
    rows.push(...batch);

    if (batch.length < DASHBOARD_PAGE_SIZE) {
      return rows;
    }

    assertWithinDashboardCap('Surat Keluar', rows.length);
    from += DASHBOARD_PAGE_SIZE;
  }
}

async function fetchUpcomingAgenda(): Promise<AgendaProjectionRow[]> {
  const rows: AgendaProjectionRow[] = [];
  const fromISO = witaTodayISO();
  let from = 0;

  for (;;) {
    const to = from + DASHBOARD_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('agenda_pimpinan')
      .select(
        'id, nomor_urut, tanggal_kegiatan, waktu_kegiatan, nama_kegiatan, tempat_kegiatan',
      )
      .not('tanggal_kegiatan', 'is', null)
      .gte('tanggal_kegiatan', fromISO)
      .order('nomor_urut', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const batch = (data ?? []) as AgendaProjectionRow[];
    rows.push(...batch);

    if (batch.length < DASHBOARD_PAGE_SIZE) {
      return rows;
    }

    assertWithinDashboardCap('Agenda Pimpinan mendatang', rows.length);
    from += DASHBOARD_PAGE_SIZE;
  }
}

async function fetchRecentMasuk(): Promise<DashboardRecentMasuk[]> {
  const { data, error } = await supabase
    .from('surat_masuk')
    .select('id, nomor_urut, tanggal_diterima, perihal, pengirim, tujuan_disposisi')
    .order('created_at', { ascending: false })
    .order('nomor_urut', { ascending: true })
    .limit(5);

  if (error) throw error;

  return ((data ?? []) as RecentMasukRow[]).map((row) => ({
    id: row.id,
    nomorUrut: row.nomor_urut,
    tanggalDiterima: row.tanggal_diterima,
    perihal: row.perihal ?? '',
    pengirim: row.pengirim ?? '',
    tujuanDisposisi: row.tujuan_disposisi ?? '',
  }));
}

async function fetchRecentKeluar(): Promise<DashboardRecentKeluar[]> {
  const { data, error } = await supabase
    .from('surat_keluar')
    .select('id, nomor_urut, tanggal_surat, perihal, pengirim, ditandatangani')
    .order('created_at', { ascending: false })
    .order('nomor_urut', { ascending: true })
    .limit(5);

  if (error) throw error;

  return ((data ?? []) as RecentKeluarRow[]).map((row) => ({
    id: row.id,
    nomorUrut: row.nomor_urut,
    tanggalSurat: row.tanggal_surat,
    perihal: row.perihal ?? '',
    pengirim: row.pengirim ?? '',
    ditandatangani: row.ditandatangani,
  }));
}

/**
 * Minutes since midnight for a `waktu_kegiatan` string, for ordering only.
 *
 * `waktu_kegiatan` is `text NOT NULL DEFAULT '00:00'`, so it can be '', a
 * well-formed 'HH:MM', or whatever a hand-edited row left behind. Anything
 * unparseable sorts as minute 0, alongside genuine all-day agendas. That is
 * also why the upcoming-agenda ordering stays client-side: an
 * `.order('waktu_kegiatan')` in Postgres is a text sort, which does not agree
 * with this on blanks or on ties.
 *
 * lib/agendaPreview.ts has the same helper, unexported, and it stays that way:
 * this is Dashboard ordering, and reaching into the public preview's internals
 * would tie it to that module's locked business rules.
 */
function agendaMinutes(waktu: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(waktu.trim());
  if (!match) return 0;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return 0;

  return hour * 60 + minute;
}

function buildTrend(
  masukRows: MasukProjectionRow[],
  keluarRows: KeluarProjectionRow[],
): DashboardSnapshot['trend'] {
  const days: Array<{ iso: string; label: string }> = [];
  const today = todayISO();
  const [year, month, day] = today.split('-').map(Number);

  for (let i = 6; i >= 0; i--) {
    const date = new Date(year, month - 1, day - i, 12);
    const iso =
      `${date.getFullYear()}-` +
      `${String(date.getMonth() + 1).padStart(2, '0')}-` +
      `${String(date.getDate()).padStart(2, '0')}`;

    days.push({
      iso,
      label: HARI_SINGKAT[date.getDay()],
    });
  }

  const masukByDate = new Map<string, number>();
  const keluarByDate = new Map<string, number>();

  for (const row of masukRows) {
    if (row.tanggal_diterima) {
      masukByDate.set(
        row.tanggal_diterima,
        (masukByDate.get(row.tanggal_diterima) ?? 0) + 1,
      );
    }
  }

  for (const row of keluarRows) {
    if (row.tanggal_surat) {
      keluarByDate.set(
        row.tanggal_surat,
        (keluarByDate.get(row.tanggal_surat) ?? 0) + 1,
      );
    }
  }

  const seriesA = days.map((entry) => masukByDate.get(entry.iso) ?? 0);
  const seriesB = days.map((entry) => keluarByDate.get(entry.iso) ?? 0);

  return {
    labels: days.map((entry) => entry.label),
    seriesA,
    seriesB,
    hasData: seriesA.some((value) => value > 0) || seriesB.some((value) => value > 0),
  };
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [
    masukRows,
    keluarRows,
    upcomingAgenda,
    recentMasuk,
    recentKeluar,
    overdueThreshold,
  ] = await Promise.all([
    fetchMasukProjection(),
    fetchKeluarProjection(),
    fetchUpcomingAgenda(),
    fetchRecentMasuk(),
    fetchRecentKeluar(),
    getOverdueThresholdDays().catch(() => OVERDUE_THRESHOLD_FALLBACK),
  ]);

  const today = todayISO();

  const masukToday = masukRows.filter(
    (row) => row.tanggal_diterima === today,
  ).length;

  const keluarToday = keluarRows.filter(
    (row) => row.tanggal_surat === today,
  ).length;

  const unsigned = keluarRows.filter(
    (row) => !row.ditandatangani,
  ).length;

  const baru = masukRows.filter(
    (row) => row.status_disposisi === 'baru',
  ).length;

  const diprosesRows = masukRows.filter(
    (row) => row.status_disposisi === 'diproses',
  );

  const selesai = masukRows.filter(
    (row) => row.status_disposisi === 'selesai',
  ).length;

  const overdue = diprosesRows.filter(
    (row) => businessDaysSince(row.status_updated_at) >= overdueThreshold,
  ).length;

  const bidangCounts = new Map<string, number>();

  for (const row of masukRows) {
    bidangCounts.set(
      row.tujuan_disposisi,
      (bidangCounts.get(row.tujuan_disposisi) ?? 0) + 1,
    );
  }

  const perBidang = [...bidangCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const agendaTerdekat: DashboardAgendaItem[] = upcomingAgenda
    .map((row) => ({
      id: row.id,
      nomorUrut: row.nomor_urut,
      tanggalKegiatan: row.tanggal_kegiatan,
      waktuKegiatan: row.waktu_kegiatan ?? '',
      namaKegiatan: row.nama_kegiatan ?? '',
      tempatKegiatan: row.tempat_kegiatan ?? '',
    }))
    .sort((a, b) => {
      const byDate = (a.tanggalKegiatan ?? '').localeCompare(
        b.tanggalKegiatan ?? '',
      );
      if (byDate !== 0) return byDate;

      const byTime =
        agendaMinutes(a.waktuKegiatan) - agendaMinutes(b.waktuKegiatan);
      if (byTime !== 0) return byTime;

      return a.nomorUrut - b.nomorUrut;
    })
    .slice(0, AGENDA_PREVIEW_COUNT);

  return {
    stats: {
      masuk: masukRows.length,
      keluar: keluarRows.length,
      today: masukToday + keluarToday,
      total: masukRows.length + keluarRows.length,
      unsigned,
    },
    statusStats: {
      baru,
      diproses: diprosesRows.length,
      selesai,
      overdue,
    },
    trend: buildTrend(masukRows, keluarRows),
    perBidang,
    recentMasuk,
    recentKeluar,
    agendaTerdekat,
    overdueThreshold,
  };
}

// --- Global work counts -------------------------------------------------
//
// The two numbers the Sidebar badge and work card (and the BottomNav badge)
// show on EVERY route: unsigned Surat Keluar, and today's Agenda Pimpinan.
// App.tsx used to filter both out of the full arrays, which only worked while
// every route loaded every table. These are count-only reads instead —
// `head: true` transfers no rows at all, PostgREST answers from the
// Content-Range header — so the badges stay live on routes that deliberately
// never load the dataset being counted.

export interface GlobalWorkCounts {
  unsignedKeluar: number;
  agendaToday: number;
}

/**
 * Both filters reproduce the expressions App.tsx ran over the full arrays,
 * exactly:
 *
 *   unsigned  `suratKeluar.filter((s) => !s.ditandatangani)` — `ditandatangani`
 *            is `boolean NOT NULL DEFAULT false`, so `.eq(false)` and
 *            `!s.ditandatangani` cannot disagree on any row that can exist.
 *
 *   today    `agendaPimpinan.filter((a) => isToday(a.tanggalKegiatan))` —
 *            isToday() compares against todayISO(), the calendar day in the
 *            BROWSER's timezone, NOT witaTodayISO(). Kept deliberately: moving
 *            this count to the WITA day boundary would change what the sidebar
 *            reports for anyone on a device not set to WITA, which is a rules
 *            decision, not a performance one. (The public agenda preview is
 *            WITA-based and stays that way — a separate, locked surface.)
 */
export async function getGlobalWorkCounts(): Promise<GlobalWorkCounts> {
  const [unsigned, today] = await Promise.all([
    supabase
      .from('surat_keluar')
      .select('id', { count: 'exact', head: true })
      .eq('ditandatangani', false),
    supabase
      .from('agenda_pimpinan')
      .select('id', { count: 'exact', head: true })
      .eq('tanggal_kegiatan', todayISO()),
  ]);

  if (unsigned.error) throw unsigned.error;
  if (today.error) throw today.error;

  return {
    unsignedKeluar: unsigned.count ?? 0,
    agendaToday: today.count ?? 0,
  };
}
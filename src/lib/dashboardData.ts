import { businessDaysSince, todayISO, witaTodayISO } from '@/lib/date';
import { getOverdueThresholdDays } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const DASHBOARD_PAGE_SIZE = 1000;
const DASHBOARD_ROW_CAP = 20000;
const AGENDA_PREVIEW_COUNT = 4;

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
  agendaTodayCount: number;
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
    getOverdueThresholdDays(),
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
    agendaTodayCount: upcomingAgenda.filter(
      (row) => row.tanggal_kegiatan === witaTodayISO(),
    ).length,
  };
}
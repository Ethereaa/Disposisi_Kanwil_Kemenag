import { supabase } from './supabase';
import type { AgendaPimpinan, AgendaPimpinanPublic, SuratMasuk, SuratKeluar } from '@/types';
import type { PreviewQuery } from './agendaPreview';

export type SuratTable = 'surat_masuk' | 'surat_keluar';
export type AgendaTable = 'agenda_pimpinan';

interface DBRow {
  id: string;
  nomor_urut: number;
  nomor_surat: string;
  tanggal_surat: string | null;
  pengirim: string;
  perihal: string;
  keterangan: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

interface MasukRow extends DBRow {
  nomor_agenda: string;
  tanggal_diterima: string | null;
  tujuan_disposisi: string;
  sub_disposisi: string | null;
  isi_disposisi: string;
  status_disposisi: string;
  status_updated_at: string;
}

interface KeluarRow extends DBRow {
  ditandatangani: boolean;
}

interface AgendaRow {
  id: string;
  nomor_urut: number;
  tanggal_kegiatan: string | null;
  waktu_kegiatan: string | null;
  nama_kegiatan: string;
  tempat_kegiatan: string;
  keterangan: string;
  disposisi_pegawai: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

// Rows from public.agenda_pimpinan_public, the restricted view the two
// no-login routes read. Deliberately NOT AgendaRow: the view exposes 8 of
// agenda_pimpinan's columns, so `data as AgendaRow` would type
// created_by_email, created_at and updated_at as present when they are
// `undefined` at runtime — the compiler would then wave through
// `row.created_at.slice(...)` and it would throw in the browser.
interface PublicAgendaRow {
  id: string;
  nomor_urut: number;
  tanggal_kegiatan: string | null;
  waktu_kegiatan: string | null;
  nama_kegiatan: string;
  tempat_kegiatan: string;
  keterangan: string;
  disposisi_pegawai: string;
}

// The exact projection the view exposes, and the only columns the public
// helpers may request. One constant so the two anonymous readers cannot drift
// apart, and so this stays checkable against the view definition in
// supabase/migrations/20260818000000_create_agenda_pimpinan_public_view.sql.
// Never `select('*')` on a public path: it would silently start shipping any
// column a future migration adds to the view.
const PUBLIC_AGENDA_COLUMNS =
  'id, nomor_urut, tanggal_kegiatan, waktu_kegiatan, nama_kegiatan, tempat_kegiatan, keterangan, disposisi_pegawai';

function mapMasuk(r: MasukRow): SuratMasuk {
  return {
    id: r.id,
    nomorUrut: r.nomor_urut,
    nomorSurat: r.nomor_surat ?? '',
    nomorAgenda: r.nomor_agenda ?? '',
    tanggalSurat: r.tanggal_surat,
    pengirim: r.pengirim ?? '',
    tanggalDiterima: r.tanggal_diterima,
    perihal: r.perihal ?? '',
    tujuanDisposisi: r.tujuan_disposisi as SuratMasuk['tujuanDisposisi'],
    subDisposisi: r.sub_disposisi as SuratMasuk['subDisposisi'] ?? null,
    isiDisposisi: r.isi_disposisi ?? '',
    keterangan: r.keterangan ?? '',
    statusDisposisi: (r.status_disposisi as SuratMasuk['statusDisposisi']) || 'baru',
    statusUpdatedAt: r.status_updated_at ?? r.updated_at,
    createdByEmail: r.created_by_email || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapKeluar(r: KeluarRow): SuratKeluar {
  return {
    id: r.id,
    nomorUrut: r.nomor_urut,
    nomorSurat: r.nomor_surat ?? '',
    tanggalSurat: r.tanggal_surat,
    pengirim: r.pengirim ?? '',
    perihal: r.perihal ?? '',
    ditandatangani: r.ditandatangani ?? false,
    keterangan: r.keterangan ?? '',
    createdByEmail: r.created_by_email || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAgenda(r: AgendaRow): AgendaPimpinan {
  return {
    id: r.id,
    nomorUrut: r.nomor_urut,
    tanggalKegiatan: r.tanggal_kegiatan,
    waktuKegiatan: r.waktu_kegiatan ?? '',
    namaKegiatan: r.nama_kegiatan ?? '',
    tempatKegiatan: r.tempat_kegiatan ?? '',
    keterangan: r.keterangan ?? '',
    disposisiPegawai: r.disposisi_pegawai ?? '',
    createdByEmail: r.created_by_email || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Public counterpart of mapAgenda(), for view rows. Separate on purpose:
// mapAgenda() reads three columns the view does not expose, so reusing it on a
// public row would hand the UI `undefined` values typed as `string`. The
// null-coalescing mirrors mapAgenda() because the view passes the base
// columns through unchanged.
function mapAgendaPublic(r: PublicAgendaRow): AgendaPimpinanPublic {
  return {
    id: r.id,
    nomorUrut: r.nomor_urut,
    tanggalKegiatan: r.tanggal_kegiatan,
    waktuKegiatan: r.waktu_kegiatan ?? '',
    namaKegiatan: r.nama_kegiatan ?? '',
    tempatKegiatan: r.tempat_kegiatan ?? '',
    keterangan: r.keterangan ?? '',
    disposisiPegawai: r.disposisi_pegawai ?? '',
  };
}

// --- Bounded "fetch everything" helper -------------------------------
//
// getAllMasuk/getAllKeluar/getAllAgendaPimpinan used to do a single
// `.select('*')` with no `.range()`. That relies on Supabase/PostgREST's
// default per-request row cap (commonly 1000 rows on hosted projects) —
// past that many rows, the old code would silently come back with a
// truncated table and no error, no warning, nothing. That's a real
// correctness bug independent of scale: any table already past the
// default cap would have been under-reporting today.
//
// fetchAllRows() below fixes that by paging through the table in
// FETCH_PAGE_SIZE batches via `.range()` until it has everything, so the
// result is always complete for tables under FETCH_ROW_CAP rows. That cap
// is a deliberate safety valve, not a design target: past it we stop
// rather than risk pulling an unbounded number of rows into a mobile
// browser's memory, and we tell the caller so it can surface a warning
// instead of quietly handing back a partial dataset. See
// docs/improvement-log-performance.md for the plan to replace this with
// real server-side pagination once any table gets close to the cap.
const FETCH_PAGE_SIZE = 1000;
export const FETCH_ROW_CAP = 20000;

interface FetchAllResult<T> {
  rows: T[];
  truncated: boolean;
}

async function fetchAllRows<T>(table: string, orderColumn: string): Promise<FetchAllResult<T>> {
  const rows: T[] = [];
  let from = 0;
  let truncated = false;
  for (;;) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: true })
      .range(from, to);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < FETCH_PAGE_SIZE) break;
    if (rows.length >= FETCH_ROW_CAP) {
      truncated = true;
      break;
    }
    from += FETCH_PAGE_SIZE;
  }
  return { rows, truncated };
}

// Tracks, per table, whether the most recent getAllX() call above hit
// FETCH_ROW_CAP and had to stop early. App.tsx reads this right after
// refresh() (via consumeTruncationWarnings()) so the person recording
// surat sees an explicit warning instead of the app silently working
// from an incomplete list.
const truncationState = { surat_masuk: false, surat_keluar: false, agenda_pimpinan: false };
const truncationLabels: Record<keyof typeof truncationState, string> = {
  surat_masuk: 'Surat Masuk',
  surat_keluar: 'Surat Keluar',
  agenda_pimpinan: 'Agenda Pimpinan',
};

function markTruncation(table: keyof typeof truncationState, truncated: boolean) {
  truncationState[table] = truncated;
  if (truncated) {
    console.warn(
      `[db] ${table} has more than ${FETCH_ROW_CAP} rows — stopped loading after the cap. ` +
      `See docs/improvement-log-performance.md for the server-side pagination migration path.`,
    );
  }
}

// Call once after loading data (e.g. right after Promise.all([getAllMasuk(),
// ...])) to get a human-readable list of which tables, if any, came back
// incomplete because they hit FETCH_ROW_CAP. Reading this clears the flags,
// so each refresh() only warns about that refresh's result.
export function consumeTruncationWarnings(): string[] {
  const warnings: string[] = [];
  for (const key of Object.keys(truncationState) as (keyof typeof truncationState)[]) {
    if (truncationState[key]) {
      warnings.push(truncationLabels[key]);
      truncationState[key] = false;
    }
  }
  return warnings;
}

export async function getAllMasuk(): Promise<SuratMasuk[]> {
  const { rows, truncated } = await fetchAllRows<MasukRow>('surat_masuk', 'nomor_urut');
  markTruncation('surat_masuk', truncated);
  return rows.map(mapMasuk);
}

export async function getAllKeluar(): Promise<SuratKeluar[]> {
  const { rows, truncated } = await fetchAllRows<KeluarRow>('surat_keluar', 'nomor_urut');
  markTruncation('surat_keluar', truncated);
  return rows.map(mapKeluar);
}

export async function getAllAgendaPimpinan(): Promise<AgendaPimpinan[]> {
  // nomor_urut is the single source of truth for ordering — it's kept
  // correct by resequence_agenda_pimpinan_by_date() on every insert,
  // update, and delete (newest tanggal_kegiatan first, ties broken by
  // entry_seq — a collision-proof insertion counter, not created_at).
  const { rows, truncated } = await fetchAllRows<AgendaRow>('agenda_pimpinan', 'nomor_urut');
  markTruncation('agenda_pimpinan', truncated);
  return rows.map(mapAgenda);
}

// Used by the standalone, unauthenticated Preview Agenda Pimpinan *list*
// screen (AgendaPreviewHome). It used to call getAllAgendaPimpinan() and
// slice(0, 10) client-side — fetching the entire table on every visit of a
// public, unauthenticated route just to show 10 rows.
//
// It deliberately does NOT order by nomor_urut. That column is assigned by
// resequence_agenda_pimpinan_by_date() as `tanggal_kegiatan DESC NULLS
// LAST, entry_seq DESC`, so nomor_urut = 1 is the agenda furthest in the
// future and `nomor_urut ASC LIMIT n` returns the n most DISTANT agendas —
// which silently excluded Hari ini / Besok / Lusa from the preview as soon
// as the table held more than n rows.
//
// This runs ONE query of the plan built by buildPreviewQueries(): either an
// exact WITA calendar day (optionally restricted to before/from a clock
// time) or everything strictly after Lusa. Each is independently bounded by
// `query.limit`, which is what makes the near days impossible to crowd out —
// a day with thousands of rows cannot consume another day's budget, because
// the filter pins the date. See lib/agendaPreview.ts for the full argument.
//
// The caller supplies the dates and times, already resolved in WITA, so the
// day boundary follows the office rather than the visitor's device.
//
// Reads the restricted agenda_pimpinan_public view, not the base table: this
// runs for anonymous visitors, and the base table holds internal metadata
// (staff emails, bookkeeping timestamps) that has no business leaving the
// building. Filters and ordering are unchanged — the view passes all 8 columns
// through untouched, so tanggal_kegiatan/waktu_kegiatan behave exactly as
// before.
export async function runAgendaPreviewQuery(query: PreviewQuery): Promise<AgendaPimpinanPublic[]> {
  let q = supabase
    .from('agenda_pimpinan_public')
    .select(PUBLIC_AGENDA_COLUMNS)
    .not('tanggal_kegiatan', 'is', null);

  if (query.kind === 'day') {
    q = q.eq('tanggal_kegiatan', query.date);
    // waktu_kegiatan is text 'HH:MM', so lexicographic compares match clock
    // order. Half-open on purpose: `timeFrom` is inclusive and `timeBefore`
    // exclusive, so the two halves of today partition it with no overlap and
    // no gap at the current minute.
    if (query.timeFrom !== undefined) q = q.gte('waktu_kegiatan', query.timeFrom);
    if (query.timeBefore !== undefined) q = q.lt('waktu_kegiatan', query.timeBefore);
  } else {
    q = q.gt('tanggal_kegiatan', query.date);
  }

  const { data, error } = await q
    .order('tanggal_kegiatan', { ascending: true })
    .order('waktu_kegiatan', { ascending: true })
    .range(0, query.limit - 1);
  if (error) throw error;
  return (data as PublicAgendaRow[]).map(mapAgendaPublic);
}

// Furthest current-or-future agenda date, for the date range in the public
// preview's header. Returns null when nothing is scheduled from `fromISO`
// onward.
//
// Separate from the preview fetch on purpose: the preview renders at most
// PREVIEW_TARGET rows and the selection algorithm trims the later-future tail
// first, so the last row on screen is NOT necessarily the last agenda stored.
// Deriving the header's end date from the rendered rows would understate the
// range exactly when the office has the most scheduled.
//
// Same restricted view as the other two anonymous readers, and narrower still:
// one column, one row. `fromISO` is a WITA calendar day resolved by the caller,
// so the window follows the office rather than the visitor's device.
export async function getFurthestAgendaDate(fromISO: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('agenda_pimpinan_public')
    .select('tanggal_kegiatan')
    .not('tanggal_kegiatan', 'is', null)
    .gte('tanggal_kegiatan', fromISO)
    .order('tanggal_kegiatan', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Pick<PublicAgendaRow, 'tanggal_kegiatan'> | null)?.tanggal_kegiatan ?? null;
}

// Creation time of the newest agenda currently stored. This intentionally
// comes from a separate one-value public metadata view rather than widening
// agenda_pimpinan_public with bookkeeping timestamps on every public row.
export async function getAgendaPreviewLastCreatedAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from('agenda_pimpinan_public_meta')
    .select('last_created_at')
    .maybeSingle();
  if (error) throw error;
  return (data as { last_created_at: string | null } | null)?.last_created_at ?? null;
}

// Used by the standalone Preview Agenda Pimpinan screen (public route,
// works without login) to fetch a single agenda by id, instead of
// depending on the authenticated app's already-loaded list.
//
// Same restricted view as runAgendaPreviewQuery(), for the same reason: this is
// a shareable link / QR target that anyone can open.
export async function getAgendaPimpinanById(id: string): Promise<AgendaPimpinanPublic | null> {
  const { data, error } = await supabase
    .from('agenda_pimpinan_public')
    .select(PUBLIC_AGENDA_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAgendaPublic(data as PublicAgendaRow) : null;
}

export async function getNextNomorUrut(table: SuratTable | AgendaTable): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .select('nomor_urut')
    .order('nomor_urut', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return 1;
  return (data as { nomor_urut: number }).nomor_urut + 1;
}

export async function insertMasuk(record: Omit<SuratMasuk, 'id' | 'createdAt' | 'updatedAt' | 'statusDisposisi' | 'statusUpdatedAt'>): Promise<SuratMasuk> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const { data, error } = await supabase
    .from('surat_masuk')
    .insert({
      nomor_urut: record.nomorUrut,
      nomor_surat: record.nomorSurat,
      nomor_agenda: record.nomorAgenda,
      tanggal_surat: record.tanggalSurat,
      tanggal_diterima: record.tanggalDiterima,
      pengirim: record.pengirim,
      perihal: record.perihal,
      tujuan_disposisi: record.tujuanDisposisi,
      sub_disposisi: record.subDisposisi ?? null,
      isi_disposisi: record.isiDisposisi,
      keterangan: record.keterangan,
      created_by_email: email,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapMasuk(data as MasukRow);
}

// Inserts a new surat masuk and then re-numbers every row by Nomor Agenda
// (highest nomor_agenda = nomor_urut 1), atomically, via the
// insert_surat_masuk_sorted() database function. Use this instead of
// insertMasuk() so numbering always reflects Nomor Agenda rather than the
// order things were typed in.
export async function insertMasukSorted(
  record: Omit<SuratMasuk, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut' | 'statusDisposisi' | 'statusUpdatedAt'>,
): Promise<SuratMasuk> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const { data, error } = await supabase.rpc('insert_surat_masuk_sorted', {
    p_nomor_surat: record.nomorSurat,
    p_nomor_agenda: record.nomorAgenda,
    p_tanggal_surat: record.tanggalSurat,
    p_tanggal_diterima: record.tanggalDiterima,
    p_pengirim: record.pengirim,
    p_perihal: record.perihal,
    p_tujuan_disposisi: record.tujuanDisposisi,
    p_sub_disposisi: record.subDisposisi ?? null,
    p_isi_disposisi: record.isiDisposisi,
    p_keterangan: record.keterangan,
    p_created_by_email: email,
  });
  if (error) throw error;
  return mapMasuk(data as MasukRow);
}

export async function updateMasuk(id: string, record: Omit<SuratMasuk, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut' | 'statusDisposisi' | 'statusUpdatedAt'>): Promise<void> {
  const { error } = await supabase
    .from('surat_masuk')
    .update({
      nomor_surat: record.nomorSurat,
      nomor_agenda: record.nomorAgenda,
      tanggal_surat: record.tanggalSurat,
      tanggal_diterima: record.tanggalDiterima,
      pengirim: record.pengirim,
      perihal: record.perihal,
      tujuan_disposisi: record.tujuanDisposisi,
      sub_disposisi: record.subDisposisi ?? null,
      isi_disposisi: record.isiDisposisi,
      keterangan: record.keterangan,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  // Nomor Agenda may have changed, so re-rank every row by it.
  await resequenceSuratMasukByNomorAgenda();
}

// Changes only the disposisi workflow status (Baru/Diproses/Selesai) for a
// Surat Masuk, independent of the full edit form. `status_updated_at` is
// stamped automatically by a DB trigger whenever status_disposisi actually
// changes (see migration 20260803000000), so it isn't set here — that
// keeps every code path that touches status (this, bulk import, direct SQL)
// consistent instead of relying on each caller to remember it.
export async function updateStatusDisposisi(
  id: string,
  status: SuratMasuk['statusDisposisi'],
): Promise<void> {
  const { error } = await supabase
    .from('surat_masuk')
    .update({ status_disposisi: status })
    .eq('id', id);
  if (error) throw error;
}

export async function insertKeluar(record: Omit<SuratKeluar, 'id' | 'createdAt' | 'updatedAt'>): Promise<SuratKeluar> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const { data, error } = await supabase
    .from('surat_keluar')
    .insert({
      nomor_urut: record.nomorUrut,
      nomor_surat: record.nomorSurat,
      tanggal_surat: record.tanggalSurat,
      pengirim: record.pengirim,
      perihal: record.perihal,
      ditandatangani: record.ditandatangani,
      keterangan: record.keterangan,
      created_by_email: email,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapKeluar(data as KeluarRow);
}

// Inserts a new surat keluar and then re-numbers every row by Tanggal
// Surat (latest date = nomor_urut 1), atomically, via the
// insert_surat_keluar_sorted() database function. Use this instead of
// insertKeluar() so numbering always reflects Tanggal Surat rather than
// the order things were typed in.
export async function insertKeluarSorted(
  record: Omit<SuratKeluar, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut'>,
): Promise<SuratKeluar> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const { data, error } = await supabase.rpc('insert_surat_keluar_sorted', {
    p_nomor_surat: record.nomorSurat,
    p_tanggal_surat: record.tanggalSurat,
    p_pengirim: record.pengirim,
    p_perihal: record.perihal,
    p_ditandatangani: record.ditandatangani,
    p_keterangan: record.keterangan,
    p_created_by_email: email,
  });
  if (error) throw error;
  return mapKeluar(data as KeluarRow);
}

export async function updateKeluar(id: string, record: Omit<SuratKeluar, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut'>): Promise<void> {
  const { error } = await supabase
    .from('surat_keluar')
    .update({
      nomor_surat: record.nomorSurat,
      tanggal_surat: record.tanggalSurat,
      pengirim: record.pengirim,
      perihal: record.perihal,
      ditandatangani: record.ditandatangani,
      keterangan: record.keterangan,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  // Tanggal Surat may have changed, so re-rank every row by it.
  await resequenceSuratKeluarByTanggal();
}

export async function insertAgendaPimpinan(record: Omit<AgendaPimpinan, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgendaPimpinan> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const { data, error } = await supabase
    .from('agenda_pimpinan')
    .insert({
      nomor_urut: record.nomorUrut,
      tanggal_kegiatan: record.tanggalKegiatan,
      waktu_kegiatan: record.waktuKegiatan,
      nama_kegiatan: record.namaKegiatan,
      tempat_kegiatan: record.tempatKegiatan,
      keterangan: record.keterangan,
      disposisi_pegawai: record.disposisiPegawai,
      created_by_email: email,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapAgenda(data as AgendaRow);
}

// Inserts a new agenda and then re-numbers every row by event date
// (newest tanggal_kegiatan = nomor_urut 1), atomically, via the
// insert_agenda_pimpinan_sorted() database function. Use this instead of
// insertAgendaPimpinan() so numbering always reflects the event date
// rather than the order things were typed in.
export async function insertAgendaPimpinanSorted(
  record: Omit<AgendaPimpinan, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut'>,
): Promise<AgendaPimpinan> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const { data, error } = await supabase.rpc('insert_agenda_pimpinan_sorted', {
    p_tanggal_kegiatan: record.tanggalKegiatan,
    p_waktu_kegiatan: record.waktuKegiatan,
    p_nama_kegiatan: record.namaKegiatan,
    p_tempat_kegiatan: record.tempatKegiatan,
    p_keterangan: record.keterangan,
    p_disposisi_pegawai: record.disposisiPegawai,
    p_created_by_email: email,
  });
  if (error) throw error;
  return mapAgenda(data as AgendaRow);
}

export async function updateAgendaPimpinan(id: string, record: Omit<AgendaPimpinan, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut'>): Promise<void> {
  const { error } = await supabase
    .from('agenda_pimpinan')
    .update({
      tanggal_kegiatan: record.tanggalKegiatan,
      waktu_kegiatan: record.waktuKegiatan,
      nama_kegiatan: record.namaKegiatan,
      tempat_kegiatan: record.tempatKegiatan,
      keterangan: record.keterangan,
      disposisi_pegawai: record.disposisiPegawai,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  // The date may have changed, so re-rank every row by event date.
  await resequenceAgendaPimpinan();
}

export async function deleteRow(table: SuratTable, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAgendaPimpinan(id: string): Promise<void> {
  const { error } = await supabase.from('agenda_pimpinan').delete().eq('id', id);
  if (error) throw error;
}

export async function resequenceNomorUrut(table: SuratTable): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('id, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data as { id: string; created_at: string }[];
  await Promise.all(
    rows.map((r, i) =>
      supabase.from(table).update({ nomor_urut: i + 1 }).eq('id', r.id),
    ),
  );
}

export async function resequenceSuratMasukByNomorAgenda(): Promise<void> {
  // Re-ranks nomor_urut for every surat_masuk row by nomor_agenda (highest
  // first), via the DB function — keeps numbering tied to Nomor Agenda
  // rather than whatever order the rows happened to be entered in.
  const { error } = await supabase.rpc('resequence_surat_masuk_by_nomor_agenda');
  if (error) throw error;
}

export async function resequenceSuratKeluarByTanggal(): Promise<void> {
  // Re-ranks nomor_urut for every surat_keluar row by tanggal_surat
  // (latest date first), via the DB function — keeps numbering tied to
  // Tanggal Surat rather than whatever order the rows happened to be
  // entered in.
  const { error } = await supabase.rpc('resequence_surat_keluar_by_tanggal');
  if (error) throw error;
}

export async function resequenceAgendaPimpinan(): Promise<void> {
  // Re-ranks nomor_urut for every row by tanggal_kegiatan (newest first),
  // via the DB function — keeps numbering tied to the event date rather
  // than whatever order the rows happened to be in already.
  const { error } = await supabase.rpc('resequence_agenda_pimpinan_by_date');
  if (error) throw error;
}

export async function clearTable(table: SuratTable | AgendaTable): Promise<void> {
  const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

export async function bulkInsertMasuk(items: SuratMasuk[]): Promise<void> {
  if (items.length === 0) return;
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const rows = items.map((r) => ({
    nomor_urut: r.nomorUrut,
    nomor_surat: r.nomorSurat,
    nomor_agenda: r.nomorAgenda,
    tanggal_surat: r.tanggalSurat,
    tanggal_diterima: r.tanggalDiterima,
    pengirim: r.pengirim,
    perihal: r.perihal,
    tujuan_disposisi: r.tujuanDisposisi,
    sub_disposisi: r.subDisposisi ?? null,
    isi_disposisi: r.isiDisposisi,
    keterangan: r.keterangan,
    // Older backups made before this field existed won't have it — default
    // to 'baru' rather than leaving it undefined, so the insert never trips
    // the NOT NULL constraint on status_disposisi.
    status_disposisi: r.statusDisposisi ?? 'baru',
    created_by_email: email,
  }));
  const { error } = await supabase.from('surat_masuk').insert(rows);
  if (error) throw error;
}

export async function bulkInsertAgendaPimpinan(items: AgendaPimpinan[]): Promise<void> {
  if (items.length === 0) return;
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const rows = items.map((r) => ({
    nomor_urut: r.nomorUrut,
    tanggal_kegiatan: r.tanggalKegiatan,
    waktu_kegiatan: r.waktuKegiatan,
    nama_kegiatan: r.namaKegiatan,
    tempat_kegiatan: r.tempatKegiatan,
    keterangan: r.keterangan,
    disposisi_pegawai: r.disposisiPegawai,
    created_by_email: email,
  }));
  const { error } = await supabase.from('agenda_pimpinan').insert(rows);
  if (error) throw error;
}

export async function bulkInsertKeluar(items: SuratKeluar[]): Promise<void> {
  if (items.length === 0) return;
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const rows = items.map((r) => ({
    nomor_urut: r.nomorUrut,
    nomor_surat: r.nomorSurat,
    tanggal_surat: r.tanggalSurat,
    pengirim: r.pengirim,
    perihal: r.perihal,
    ditandatangani: r.ditandatangani,
    keterangan: r.keterangan,
    created_by_email: email,
  }));
  const { error } = await supabase.from('surat_keluar').insert(rows);
  if (error) throw error;
}

export const suratMasukStore: SuratTable = 'surat_masuk';
export const suratKeluarStore: SuratTable = 'surat_keluar';

// --- Shared app settings (app_settings key/value table) ----------------
//
// Office-wide settings that every user sees the same value for (matching
// this app's "everyone shares one dataset" model — see the RLS notes in
// migration 20260728114553). Currently just the overdue-disposisi
// threshold, but the table is a plain key/value store so more settings
// can be added later without another migration.

const OVERDUE_THRESHOLD_KEY = 'surat_overdue_threshold_days';
const OVERDUE_THRESHOLD_DEFAULT = 3;

/** Business days a Surat Masuk can sit in "Diproses" before it's flagged
 *  overdue (in the UI and in the overdue-reminder push notification). */
export async function getOverdueThresholdDays(): Promise<number> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', OVERDUE_THRESHOLD_KEY)
    .maybeSingle();
  if (error) throw error;
  const parsed = data ? Number.parseInt((data as { value: string }).value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : OVERDUE_THRESHOLD_DEFAULT;
}

export async function setOverdueThresholdDays(days: number): Promise<void> {
  const safe = Math.max(1, Math.round(days));
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: OVERDUE_THRESHOLD_KEY, value: String(safe), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export interface DuplicateMatch {
  id: string;
  nomorUrut: number;
}

// Light pre-submit check: does another row in `table` already use this
// nomor_surat? Blank values are never flagged (nomor surat is optional).
// Pass `excludeId` when editing so a row doesn't collide with itself.
export async function checkNomorSuratDuplicate(
  table: SuratTable,
  nomorSurat: string,
  excludeId?: string,
): Promise<DuplicateMatch | null> {
  const value = nomorSurat.trim();
  if (!value) return null;
  let query = supabase
    .from(table)
    .select('id, nomor_urut')
    .eq('nomor_surat', value)
    .limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { id: string; nomor_urut: number };
  return { id: row.id, nomorUrut: row.nomor_urut };
}

// Same idea for nomor_agenda on surat_masuk (the only table that has it).
export async function checkNomorAgendaDuplicate(
  nomorAgenda: string,
  excludeId?: string,
): Promise<DuplicateMatch | null> {
  const value = nomorAgenda.trim();
  if (!value) return null;
  let query = supabase
    .from('surat_masuk')
    .select('id, nomor_urut')
    .eq('nomor_agenda', value)
    .limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { id: string; nomor_urut: number };
  return { id: row.id, nomorUrut: row.nomor_urut };
}

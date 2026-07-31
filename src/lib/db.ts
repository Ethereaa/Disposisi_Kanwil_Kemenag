import { supabase } from './supabase';
import type { AgendaPimpinan, SuratMasuk, SuratKeluar, Attachment } from '@/types';
import { normalizeLampiran } from './attachments';

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
  lampiran: unknown;
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
  lampiran: unknown;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

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
    lampiran: normalizeLampiran(r.lampiran),
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
    lampiran: normalizeLampiran(r.lampiran),
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
    lampiran: normalizeLampiran(r.lampiran),
    createdByEmail: r.created_by_email || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getAllMasuk(): Promise<SuratMasuk[]> {
  const { data, error } = await supabase
    .from('surat_masuk')
    .select('*')
    .order('nomor_urut', { ascending: true });
  if (error) throw error;
  return (data as MasukRow[]).map(mapMasuk);
}

export async function getAllKeluar(): Promise<SuratKeluar[]> {
  const { data, error } = await supabase
    .from('surat_keluar')
    .select('*')
    .order('nomor_urut', { ascending: true });
  if (error) throw error;
  return (data as KeluarRow[]).map(mapKeluar);
}

export async function getAllAgendaPimpinan(): Promise<AgendaPimpinan[]> {
  // nomor_urut is the single source of truth for ordering — it's kept
  // correct by resequence_agenda_pimpinan_by_date() on every insert,
  // update, and delete (newest tanggal_kegiatan first, ties broken by
  // entry_seq — a collision-proof insertion counter, not created_at).
  const { data, error } = await supabase
    .from('agenda_pimpinan')
    .select('*')
    .order('nomor_urut', { ascending: true });
  if (error) throw error;
  return (data as AgendaRow[]).map(mapAgenda);
}

// Used by the standalone Preview Agenda Pimpinan screen (public route,
// works without login) to fetch a single agenda by id, instead of
// depending on the authenticated app's already-loaded list.
export async function getAgendaPimpinanById(id: string): Promise<AgendaPimpinan | null> {
  const { data, error } = await supabase
    .from('agenda_pimpinan')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAgenda(data as AgendaRow) : null;
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

export async function insertMasuk(record: Omit<SuratMasuk, 'id' | 'createdAt' | 'updatedAt'>): Promise<SuratMasuk> {
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
      lampiran: record.lampiran ?? [],
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
  record: Omit<SuratMasuk, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut'>,
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

export async function updateMasuk(id: string, record: Omit<SuratMasuk, 'id' | 'createdAt' | 'updatedAt' | 'nomorUrut'>): Promise<void> {
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
      lampiran: record.lampiran ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  // Nomor Agenda may have changed, so re-rank every row by it.
  await resequenceSuratMasukByNomorAgenda();
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
      lampiran: record.lampiran ?? [],
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
      lampiran: record.lampiran ?? [],
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
      lampiran: record.lampiran ?? [],
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
      lampiran: record.lampiran ?? [],
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

// insertMasukSorted / insertKeluarSorted / insertAgendaPimpinanSorted go
// through a DB function (RPC) that doesn't know about `lampiran`, so any
// attachments picked in the form before the row existed are saved with
// this follow-up call right after the sorted insert succeeds.
export async function updateLampiran(table: SuratTable | AgendaTable, id: string, lampiran: Attachment[]): Promise<void> {
  const { error } = await supabase.from(table).update({ lampiran }).eq('id', id);
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

export async function clearTable(table: SuratTable): Promise<void> {
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
    lampiran: r.lampiran ?? [],
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
    lampiran: r.lampiran ?? [],
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
    lampiran: r.lampiran ?? [],
    created_by_email: email,
  }));
  const { error } = await supabase.from('surat_keluar').insert(rows);
  if (error) throw error;
}

export const suratMasukStore: SuratTable = 'surat_masuk';
export const suratKeluarStore: SuratTable = 'surat_keluar';

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

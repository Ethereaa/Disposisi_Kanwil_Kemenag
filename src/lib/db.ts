import { supabase } from './supabase';
import type { AgendaPimpinan, SuratMasuk, SuratKeluar } from '@/types';

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
  const { data, error } = await supabase
    .from('agenda_pimpinan')
    .select('*')
    .order('nomor_urut', { ascending: true });
  if (error) throw error;
  return (data as AgendaRow[]).map(mapAgenda);
}

export async function getNextNomorUrut(table: SuratTable): Promise<number> {
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
      created_by_email: email,
    })
    .select('*')
    .single();
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
      updated_at: new Date().toISOString(),
    })
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

export async function resequenceAgendaPimpinan(): Promise<void> {
  const { data, error } = await supabase
    .from('agenda_pimpinan')
    .select('id, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data as { id: string; created_at: string }[];
  await Promise.all(
    rows.map((r, i) =>
      supabase.from('agenda_pimpinan').update({ nomor_urut: i + 1 }).eq('id', r.id),
    ),
  );
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

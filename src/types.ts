// DEPRECATED — the attachment feature is being removed. No active record type
// references this any more; it is kept only so the files still importing it
// (components/ui/AttachmentField.tsx, components/ui/LampiranCell.tsx,
// lib/attachments.ts) keep type-checking until they are deleted in 3F.3.
//
// Metadata for one scanned/uploaded file attached to a record. The file
// itself lives in the `lampiran-surat` Supabase Storage bucket; only the
// path + display info is kept here.
export interface Attachment {
  path: string;
  name: string;
  type: string;
  size: number;
  /** Small base64 data-URL preview (first page), generated at upload time
   *  for photo-derived documents. Stored inline in the `lampiran` jsonb
   *  column — no extra Storage object or signed URL needed just to show a
   *  thumbnail in a list/table. Absent for files picked directly as PDF. */
  thumbnail?: string;
}

export interface SuratMasuk {
  id: string;
  nomorUrut: number;
  nomorSurat: string;
  nomorAgenda: string;
  tanggalSurat: string | null; // ISO yyyy-mm-dd
  pengirim: string;
  tanggalDiterima: string | null; // ISO yyyy-mm-dd
  perihal: string;
  tujuanDisposisi: TujuanDisposisi;
  subDisposisi?: SubDisposisi | null;
  isiDisposisi: string;
  keterangan: string;
  statusDisposisi: StatusDisposisi;
  statusUpdatedAt: string; // ISO timestamp — when statusDisposisi last changed
  createdByEmail?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface SuratKeluar {
  id: string;
  nomorUrut: number;
  nomorSurat: string;
  tanggalSurat: string | null; // ISO yyyy-mm-dd
  pengirim: string;
  perihal: string;
  ditandatangani: boolean;
  keterangan: string;
  createdByEmail?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export type TujuanDisposisi =
  | 'Kabag TU'
  | 'Kabid Pendmad'
  | 'Kabid PAKIS'
  | 'Kabid Bimas Islam'
  | 'Pembimas Kristen'
  | 'Pembimas Katolik';

export type SubDisposisi =
  | 'Perencanaan'
  | 'Keuangan'
  | 'Kepegawaian'
  | 'Ortala & KUB'
  | 'Umum/Humas/PTSP';

/** Workflow status of a Surat Masuk's disposisi, tracked per record from
 *  the moment it's disposed to a bidang until it's marked done. */
export type StatusDisposisi = 'baru' | 'diproses' | 'selesai';

export const STATUS_DISPOSISI: StatusDisposisi[] = ['baru', 'diproses', 'selesai'];

export const STATUS_DISPOSISI_LABEL: Record<StatusDisposisi, string> = {
  baru: 'Baru',
  diproses: 'Diproses',
  selesai: 'Selesai',
};

export type AppRole = 'admin' | 'staf';

export interface AppUser {
  id: string;
  email: string;
  username: string;
  role: AppRole;
}

export interface AgendaPimpinan {
  id: string;
  nomorUrut: number;
  tanggalKegiatan: string | null; // ISO yyyy-mm-dd
  waktuKegiatan: string; // HH:MM 24 jam
  namaKegiatan: string;
  tempatKegiatan: string;
  keterangan: string;
  disposisiPegawai: string;
  createdByEmail?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// What the public, no-login Agenda Pimpinan routes are allowed to see: the 8
// columns exposed by the public.agenda_pimpinan_public view. Deliberately a
// standalone type rather than Pick<AgendaPimpinan, ...> — adding a field to
// AgendaPimpinan must NOT silently widen the anonymous read surface, and this
// type is really the contract with the view, not with the app model. Keep it in
// step with supabase/migrations/20260818000000_create_agenda_pimpinan_public_view.sql.
export interface AgendaPimpinanPublic {
  id: string;
  nomorUrut: number;
  tanggalKegiatan: string | null; // ISO yyyy-mm-dd
  waktuKegiatan: string; // HH:MM 24 jam
  namaKegiatan: string;
  tempatKegiatan: string;
  keterangan: string;
  disposisiPegawai: string;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan: AgendaPimpinan[];
}

export type Theme = 'light' | 'dark';
export type InputMode = 'solo' | 'banyak';

export type PageKey =
  | 'dashboard'
  | 'surat-masuk'
  | 'surat-keluar'
  | 'agenda-pimpinan'
  | 'export'
  | 'backup'
  | 'settings';

export const TUJUAN_DISPOSISI: TujuanDisposisi[] = [
  'Kabag TU',
  'Kabid Pendmad',
  'Kabid PAKIS',
  'Kabid Bimas Islam',
  'Pembimas Kristen',
  'Pembimas Katolik',
];

export const SUB_DISPOSISI: SubDisposisi[] = [
  'Perencanaan',
  'Keuangan',
  'Kepegawaian',
  'Ortala & KUB',
  'Umum/Humas/PTSP',
];

export const AGENDA_KETERANGAN_OPTIONS = [
  'Dihadiri',
  'Tentatif',
  'Diwakili oleh Kabag TU',
  'Diwakili oleh Kabid Penmad',
  'Diwakili oleh Kabid Papkis',
  'Diwakili oleh Kabid Bimas Islam',
  'Diwakili oleh Pembimas Kristen',
  'Diwakili oleh Pembimas Katolik',
  'Diwakili oleh Kakankemenag Kota Gorontalo',
  'Diwakili oleh Kakankemenag Kabupaten Gorontalo',
  'Diwakili oleh Kakankemenag Kabupaten Boalemo',
  'Diwakili oleh Kakankemenag Kabupaten Pohuwato',
  'Diwakili oleh Kakankemenag Bone Bolango',
  'Diwakili oleh Kakankemenag Gorontalo Utara',
] as const;

export const APP_TITLE = 'Disposisi Surat Masuk dan Keluar Kanwil Kementerian Agama Provinsi Gorontalo';
export const APP_SHORT = 'Disposisi Surat Kanwil Kemenag Gorontalo';

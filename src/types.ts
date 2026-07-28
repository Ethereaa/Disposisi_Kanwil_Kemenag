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

export interface AppUser {
  id: string;
  email: string;
  username: string;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
}

export type Theme = 'light' | 'dark';
export type InputMode = 'solo' | 'banyak';

export type PageKey =
  | 'dashboard'
  | 'surat-masuk'
  | 'surat-keluar'
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

export const APP_TITLE = 'Disposisi Surat Masuk dan Keluar Kanwil Kementerian Agama Provinsi Gorontalo';
export const APP_SHORT = 'Disposisi Surat Kanwil Kemenag Gorontalo';

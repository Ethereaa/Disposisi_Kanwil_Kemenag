import { saveAs } from 'file-saver';
import type { BackupData } from '@/types';

function backupStamp(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}_${pad(local.getHours())}${pad(local.getMinutes())}`;
}

export function exportBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  saveAs(blob, `Backup_Disposisi_${backupStamp()}.json`);
}

export function parseBackup(text: string): BackupData {
  const data = JSON.parse(text) as BackupData;
  if (!data || typeof data !== 'object') {
    throw new Error('File backup tidak valid.');
  }
  if (!Array.isArray(data.suratMasuk) || !Array.isArray(data.suratKeluar)) {
    throw new Error('Format backup tidak valid: data surat tidak ditemukan.');
  }
  if (!Array.isArray(data.agendaPimpinan)) {
    data.agendaPimpinan = [];
  }
  return data;
}
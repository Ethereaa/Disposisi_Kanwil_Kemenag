import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { isoToDisplay, isWithinRange } from './date';
import type { SuratMasuk, SuratKeluar, BackupData } from '@/types';

type ExportScope = 'all' | 'masuk' | 'keluar' | 'range';
type ExportFormat = 'xlsx' | 'docx';

interface ExportParams {
  scope: ExportScope;
  format: ExportFormat;
  startDate?: string;
  endDate?: string;
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
}

function filterByRange<T extends { tanggalSurat: string | null }>(items: T[], start?: string, end?: string): T[] {
  if (!start && !end) return items;
  return items.filter((i) => isWithinRange(i.tanggalSurat, start || '', end || ''));
}

function masukRows(items: SuratMasuk[]) {
  return items
    .slice()
    .sort((a, b) => a.nomorUrut - b.nomorUrut)
    .map((s) => ({
      'No. Urut': s.nomorUrut,
      'Nomor Surat': s.nomorSurat,
      'Nomor Agenda': s.nomorAgenda,
      'Tanggal Surat': isoToDisplay(s.tanggalSurat),
      'Pengirim Surat': s.pengirim,
      'Tanggal Diterima': isoToDisplay(s.tanggalDiterima),
      'Perihal Surat': s.perihal,
      'Tujuan Disposisi': s.tujuanDisposisi,
      'Sub Disposisi': s.subDisposisi || '-',
      'Isi Disposisi': s.isiDisposisi,
      'Keterangan': s.keterangan,
    }));
}

function keluarRows(items: SuratKeluar[]) {
  return items
    .slice()
    .sort((a, b) => a.nomorUrut - b.nomorUrut)
    .map((s) => ({
      'No. Urut': s.nomorUrut,
      'Nomor Surat': s.nomorSurat || '-',
      'Tanggal Surat': isoToDisplay(s.tanggalSurat),
      'Pengirim Surat': s.pengirim,
      'Perihal Surat': s.perihal,
      'Status TTD': s.ditandatangani ? 'Sudah Ditandatangani' : 'Belum Ditandatangani',
      'Keterangan': s.keterangan,
    }));
}

function stamp(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}_${pad(local.getHours())}${pad(local.getMinutes())}`;
}

export async function exportData(params: ExportParams): Promise<void> {
  const { scope, format } = params;
  let masuk = params.suratMasuk;
  let keluar = params.suratKeluar;
  if (scope === 'range') {
    masuk = filterByRange(masuk, params.startDate, params.endDate);
    keluar = filterByRange(keluar, params.startDate, params.endDate);
  }
  if (scope === 'masuk') keluar = [];
  if (scope === 'keluar') masuk = [];

  const stampStr = stamp();

  if (format === 'xlsx') {
    await exportXlsx(masuk, keluar, scope, stampStr);
  } else {
    await exportDocx(masuk, keluar, scope, stampStr);
  }
}

async function exportXlsx(masuk: SuratMasuk[], keluar: SuratKeluar[], scope: ExportScope, stampStr: string) {
  const wb = XLSX.utils.book_new();
  if (masuk.length > 0 || scope === 'all' || scope === 'masuk') {
    const ws = XLSX.utils.json_to_sheet(masukRows(masuk));
    XLSX.utils.book_append_sheet(wb, ws, 'Surat Masuk');
  }
  if (keluar.length > 0 || scope === 'all' || scope === 'keluar') {
    const ws = XLSX.utils.json_to_sheet(keluarRows(keluar));
    XLSX.utils.book_append_sheet(wb, ws, 'Surat Keluar');
  }
  const scopeLabel = scope === 'all' ? 'Semua' : scope === 'masuk' ? 'SuratMasuk' : scope === 'keluar' ? 'SuratKeluar' : 'Rentang';
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Disposisi_${scopeLabel}_${stampStr}.xlsx`);
}

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tableHtml(headers: string[], rows: (string | number)[][]): string {
  const head = headers.map((h) => `<th style="border:1px solid #999;padding:6px 8px;background:#1E293B;color:#fff;text-align:left;font-family:Arial;">${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td style="border:1px solid #999;padding:6px 8px;font-family:Arial;">${escapeHtml(String(c))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table style="border-collapse:collapse;width:100%;">${head}${body}</table>`;
}

async function exportDocx(masuk: SuratMasuk[], keluar: SuratKeluar[], scope: ExportScope, stampStr: string) {
  const title = 'Disposisi Surat - Kanwil Kementerian Agama Provinsi Gorontalo';
  const parts: string[] = [];
  parts.push(`<h1 style="font-family:Arial;text-align:center;">${escapeHtml(title)}</h1>`);
  parts.push(`<p style="font-family:Arial;text-align:center;color:#666;">Diekspor: ${new Date().toLocaleString('id-ID')}</p><br/>`);

  if (scope === 'all' || scope === 'masuk') {
    const rows = masukRows(masuk);
    parts.push(`<h2 style="font-family:Arial;">Surat Masuk</h2>`);
    if (rows.length === 0) {
      parts.push(`<p style="font-family:Arial;color:#999;">Tidak ada data.</p>`);
    } else {
      parts.push(tableHtml(Object.keys(rows[0]), rows.map((r) => Object.values(r))));
    }
    parts.push('<br/>');
  }
  if (scope === 'all' || scope === 'keluar') {
    const rows = keluarRows(keluar);
    parts.push(`<h2 style="font-family:Arial;">Surat Keluar</h2>`);
    if (rows.length === 0) {
      parts.push(`<p style="font-family:Arial;color:#999;">Tidak ada data.</p>`);
    } else {
      parts.push(tableHtml(Object.keys(rows[0]), rows.map((r) => Object.values(r))));
    }
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${parts.join('')}</body></html>`;
  const blob = new Blob([html], { type: 'application/msword' });
  const scopeLabel = scope === 'all' ? 'Semua' : scope === 'masuk' ? 'SuratMasuk' : scope === 'keluar' ? 'SuratKeluar' : 'Rentang';
  saveAs(blob, `Disposisi_${scopeLabel}_${stampStr}.docx`);
}

// --- Backup / Restore ---
export function exportBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  saveAs(blob, `Backup_Disposisi_${stamp()}.json`);
}

export function parseBackup(text: string): BackupData {
  const data = JSON.parse(text) as BackupData;
  if (!data || typeof data !== 'object') throw new Error('File backup tidak valid.');
  if (!Array.isArray(data.suratMasuk) || !Array.isArray(data.suratKeluar)) {
    throw new Error('Format backup tidak valid: data surat tidak ditemukan.');
  }
  return data;
}

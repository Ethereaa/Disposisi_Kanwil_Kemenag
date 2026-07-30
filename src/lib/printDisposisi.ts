import type { SuratMasuk, SuratKeluar } from '@/types';
import { isoToDisplay } from './date';
import { APP_TITLE } from '@/types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function openPrintWindow(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px; }
  .header { text-align: center; border-bottom: 3px double #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 15px; margin: 0 0 2px; text-transform: uppercase; }
  .header p { font-size: 12px; margin: 0; color: #475569; }
  h2 { text-align: center; font-size: 14px; text-decoration: underline; margin: 18px 0 20px; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 4px; vertical-align: top; }
  td.label { width: 190px; color: #334155; }
  td.colon { width: 14px; }
  td.value { font-weight: 600; }
  .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-top: 4px; min-height: 40px; font-size: 13px; white-space: pre-wrap; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #334155; margin: 18px 0 4px; }
  .sign-row { display: flex; justify-content: flex-end; margin-top: 56px; }
  .sign-box { width: 220px; text-align: center; font-size: 13px; }
  .sign-box .line { margin-top: 64px; border-top: 1px solid #1e293b; padding-top: 4px; }
  @media print {
    body { padding: 0 24px; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(APP_TITLE)}</h1>
    <p>Lembar Disposisi</p>
  </div>
  ${bodyHtml}
  <div class="sign-row">
    <div class="sign-box">
      <p>Petugas / Kabag TU</p>
      <div class="line">Tanda Tangan &amp; Nama</div>
    </div>
  </div>
  <script>
    window.onload = function () { window.print(); };
  </script>
</body>
</html>`);
  win.document.close();
}

function row(label: string, value: string): string {
  return `<tr><td class="label">${escapeHtml(label)}</td><td class="colon">:</td><td class="value">${escapeHtml(value || '-')}</td></tr>`;
}

export function printSuratMasuk(s: SuratMasuk) {
  const body = `
    <h2>Lembar Disposisi Surat Masuk</h2>
    <table>
      ${row('Nomor Urut', String(s.nomorUrut))}
      ${row('Nomor Surat', s.nomorSurat)}
      ${row('Nomor Agenda', s.nomorAgenda)}
      ${row('Tanggal Surat', isoToDisplay(s.tanggalSurat))}
      ${row('Tanggal Diterima', isoToDisplay(s.tanggalDiterima))}
      ${row('Pengirim', s.pengirim)}
      ${row('Perihal', s.perihal)}
      ${row('Tujuan Disposisi', s.subDisposisi ? `${s.tujuanDisposisi} - ${s.subDisposisi}` : s.tujuanDisposisi)}
    </table>
    <p class="section-title">Isi Disposisi</p>
    <div class="box">${escapeHtml(s.isiDisposisi || '-')}</div>
    <p class="section-title">Keterangan</p>
    <div class="box">${escapeHtml(s.keterangan || '-')}</div>
  `;
  openPrintWindow(`Disposisi - ${s.perihal || s.nomorSurat}`, body);
}

export function printSuratKeluar(s: SuratKeluar) {
  const body = `
    <h2>Lembar Disposisi Surat Keluar</h2>
    <table>
      ${row('Nomor Urut', String(s.nomorUrut))}
      ${row('Nomor Surat', s.nomorSurat)}
      ${row('Tanggal Surat', isoToDisplay(s.tanggalSurat))}
      ${row('Pengirim', s.pengirim)}
      ${row('Perihal', s.perihal)}
      ${row('Status Tanda Tangan', s.ditandatangani ? 'Sudah Ditandatangani' : 'Belum Ditandatangani')}
    </table>
    <p class="section-title">Keterangan</p>
    <div class="box">${escapeHtml(s.keterangan || '-')}</div>
  `;
  openPrintWindow(`Disposisi - ${s.perihal || s.nomorSurat}`, body);
}

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Packer, Document, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel } from 'docx';
import { isoToDisplay, isWithinRange } from './date';
import type { AgendaPimpinan, SuratMasuk, SuratKeluar } from '@/types';

type ExportScope = 'all' | 'masuk' | 'keluar' | 'agenda' | 'range';
type ExportFormat = 'xlsx' | 'docx';

interface ExportParams {
  scope: ExportScope;
  format: ExportFormat;
  startDate?: string;
  endDate?: string;
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan: AgendaPimpinan[];
}

function filterByRange<T extends { tanggalSurat: string | null }>(items: T[], start?: string, end?: string): T[] {
  if (!start && !end) return items;
  return items.filter((i) => isWithinRange(i.tanggalSurat, start || '', end || ''));
}

function filterAgendaByRange(items: AgendaPimpinan[], start?: string, end?: string): AgendaPimpinan[] {
  if (!start && !end) return items;
  return items.filter((i) => isWithinRange(i.tanggalKegiatan, start || '', end || ''));
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

function agendaRows(items: AgendaPimpinan[]) {
  return items
    .slice()
    .sort((a, b) => a.nomorUrut - b.nomorUrut)
    .map((item) => ({
      'No. Urut': item.nomorUrut,
      'Tanggal Kegiatan': isoToDisplay(item.tanggalKegiatan),
      'Waktu Kegiatan': item.waktuKegiatan ? `${item.waktuKegiatan} WITA` : '-',
      'Nama Kegiatan': item.namaKegiatan,
      'Tempat Kegiatan': item.tempatKegiatan,
      'Keterangan': item.keterangan,
      'Disposisi Pegawai': item.disposisiPegawai,
    }));
}

function stamp(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}_${pad(local.getHours())}${pad(local.getMinutes())}`;
}

function createExcelCellStyle(fillColor: string, fontColor = '000000', bold = false) {
  return {
    fill: { fgColor: { rgb: fillColor }, type: 'pattern', patternType: 'solid' },
    font: { bold, color: { rgb: fontColor }, sz: 11 },
    alignment: { vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'DCEFE0' } },
      bottom: { style: 'thin', color: { rgb: 'DCEFE0' } },
      left: { style: 'thin', color: { rgb: 'DCEFE0' } },
      right: { style: 'thin', color: { rgb: 'DCEFE0' } },
    },
  };
}

function styleExcelSheet(ws: XLSX.WorkSheet, headers: string[], rows: (string | number)[][]) {
  const dataRows = rows.length;
  const range = XLSX.utils.decode_range(ws['!ref'] ?? `A1:${XLSX.utils.encode_cell({ r: dataRows, c: headers.length - 1 })}`);

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (!cell) continue;

      if (r === 0) {
        cell.s = createExcelCellStyle('2F855A', 'FFFFFF', true);
        cell.alignment = { ...cell.alignment, horizontal: 'center' };
      } else if (r % 2 === 1) {
        cell.s = createExcelCellStyle('F6FFF6', '111827', false);
      } else {
        cell.s = createExcelCellStyle('FFFFFF', '111827', false);
      }
    }
  }

  ws['!cols'] = headers.map((header, index) => {
    const widths = [header.length, ...rows.map((row) => String(row[index] ?? '').length)];
    return { width: Math.max(16, ...widths.map((value) => value + 2)) };
  });

  ws['!autofilter'] = { ref: ws['!ref'] ?? `A1:${XLSX.utils.encode_cell({ r: dataRows, c: headers.length - 1 })}` };
  ws['!freeze'] = { ySplit: 1 };
}

export async function exportData(params: ExportParams): Promise<void> {
  const { scope, format } = params;
  let masuk = params.suratMasuk;
  let keluar = params.suratKeluar;
  let agenda = params.agendaPimpinan ?? [];
  if (scope === 'range') {
    masuk = filterByRange(masuk, params.startDate, params.endDate);
    keluar = filterByRange(keluar, params.startDate, params.endDate);
    agenda = filterAgendaByRange(agenda, params.startDate, params.endDate);
  }
  if (scope === 'masuk') {
    keluar = [];
    agenda = [];
  }
  if (scope === 'keluar') {
    masuk = [];
    agenda = [];
  }
  if (scope === 'agenda') {
    masuk = [];
    keluar = [];
  }

  const stampStr = stamp();

  if (format === 'xlsx') {
    await exportXlsx(masuk, keluar, agenda, scope, stampStr);
  } else {
    await exportDocx(masuk, keluar, agenda, scope, stampStr);
  }
}

async function exportXlsx(masuk: SuratMasuk[], keluar: SuratKeluar[], agenda: AgendaPimpinan[], scope: ExportScope, stampStr: string) {
  const wb = XLSX.utils.book_new();

  const addSheet = (name: string, rows: Record<string, string | number>[]) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const data = rows.map((row) => headers.map((header) => row[header] ?? '-'));
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    styleExcelSheet(sheet, headers, data);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  };

  if (masuk.length > 0 || scope === 'all' || scope === 'masuk') {
    addSheet('Surat Masuk', masukRows(masuk));
  }
  if (keluar.length > 0 || scope === 'all' || scope === 'keluar') {
    addSheet('Surat Keluar', keluarRows(keluar));
  }
  if (agenda.length > 0 || scope === 'all' || scope === 'agenda') {
    addSheet('Agenda Pimpinan', agendaRows(agenda));
  }

  const scopeLabel = scope === 'all' ? 'Semua' : scope === 'masuk' ? 'SuratMasuk' : scope === 'keluar' ? 'SuratKeluar' : scope === 'agenda' ? 'AgendaPimpinan' : 'Rentang';
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Disposisi_${scopeLabel}_${stampStr}.xlsx`);
}

function createTable(headers: string[], rows: (string | number)[][]): Table {
  const headerCells = headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 22 })], spacing: { after: 80 } })], shading: { type: 'solid', color: '2F855A' }, margins: { top: 100, bottom: 100, left: 100, right: 100 } }));

  const rowCells = rows.map((r, rowIndex) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 20, color: '1F2937' })], spacing: { after: 60 } })], shading: { type: 'solid', color: rowIndex % 2 === 0 ? 'F6FFF6' : 'FFFFFF' }, margins: { top: 100, bottom: 100, left: 100, right: 100 } })) }));

  return new Table({ rows: [new TableRow({ children: headerCells }), ...rowCells], width: { size: 100, type: 'pct' }, borders: { top: { style: 'single', size: 1, color: 'C6EAD6' }, bottom: { style: 'single', size: 1, color: 'C6EAD6' }, left: { style: 'single', size: 1, color: 'C6EAD6' }, right: { style: 'single', size: 1, color: 'C6EAD6' }, insideHorizontal: { style: 'single', size: 1, color: 'DCEFE0' }, insideVertical: { style: 'single', size: 1, color: 'DCEFE0' } } });
}

async function exportDocx(masuk: SuratMasuk[], keluar: SuratKeluar[], agenda: AgendaPimpinan[], scope: ExportScope, stampStr: string) {
  const title = 'Disposisi Surat - Kanwil Kementerian Agama Provinsi Gorontalo';
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 30, color: '2F855A' })], alignment: 'center', spacing: { after: 120 } }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Diekspor: ${new Date().toLocaleString('id-ID')}`, italics: true, color: '4B5563', size: 20 })], alignment: 'center', spacing: { after: 240 } }));

  if (masuk.length > 0 || scope === 'all' || scope === 'masuk') {
    const rows = masukRows(masuk);
    children.push(new Paragraph({ children: [new TextRun({ text: 'Surat Masuk', bold: true, color: '1F2937', size: 24 })], spacing: { before: 240, after: 120 } }));
    if (rows.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Tidak ada data.', italics: true, color: '9CA3AF', size: 20 })], spacing: { after: 240 } }));
    } else {
      children.push(createTable(Object.keys(rows[0]), rows.map((r) => Object.values(r))));
    }
  }
  if (keluar.length > 0 || scope === 'all' || scope === 'keluar') {
    const rows = keluarRows(keluar);
    children.push(new Paragraph({ children: [new TextRun({ text: 'Surat Keluar', bold: true, color: '1F2937', size: 24 })], spacing: { before: 240, after: 120 } }));
    if (rows.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Tidak ada data.', italics: true, color: '9CA3AF', size: 20 })], spacing: { after: 240 } }));
    } else {
      children.push(createTable(Object.keys(rows[0]), rows.map((r) => Object.values(r))));
    }
  }
  if (agenda.length > 0 || scope === 'all' || scope === 'agenda') {
    const rows = agendaRows(agenda);
    children.push(new Paragraph({ children: [new TextRun({ text: 'Agenda Pimpinan', bold: true, color: '1F2937', size: 24 })], spacing: { before: 240, after: 120 } }));
    if (rows.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Tidak ada data.', italics: true, color: '9CA3AF', size: 20 })], spacing: { after: 240 } }));
    } else {
      children.push(createTable(Object.keys(rows[0]), rows.map((r) => Object.values(r))));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const scopeLabel = scope === 'all' ? 'Semua' : scope === 'masuk' ? 'SuratMasuk' : scope === 'keluar' ? 'SuratKeluar' : scope === 'agenda' ? 'AgendaPimpinan' : 'Rentang';
  saveAs(blob, `Disposisi_${scopeLabel}_${stampStr}.docx`);
}

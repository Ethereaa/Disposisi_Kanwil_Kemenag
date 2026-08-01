// Lightweight, client-side OCR for reading "Nomor Surat" and "Tanggal" off
// a scanned letter, to auto-prefill SuratMasukForm/SuratKeluarForm. Uses
// tesseract.js (WASM, runs fully in the browser — no server round trip).
//
// This is deliberately NOT run automatically on every upload: OCR is heavy
// on the client (several seconds even for one page), so it's only
// triggered by an explicit "Baca Otomatis dari Foto" button — see
// handleAutoFillFromScan() in the two form components.

let workerSrcConfigured = false;

async function ensurePdfWorker() {
  if (workerSrcConfigured) return;
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  workerSrcConfigured = true;
}

// PDF attachments are the common case (photosToPdf always converts photos
// to PDF before upload), so OCR needs to rasterize page 1 to a canvas first
// — pdf-lib (already a dependency here) can't rasterize, only read/write
// PDF structure, so this uses pdf.js for that one step.
async function renderFirstPdfPageToImageFile(file: File): Promise<File> {
  await ensurePdfWorker();
  const pdfjsLib = await import('pdfjs-dist');
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Gagal menyiapkan kanvas untuk membaca PDF.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal merender halaman PDF.'))), 'image/png');
  });
  return new File([blob], 'halaman-1.png', { type: 'image/png' });
}

async function ocrImageFile(file: File): Promise<string> {
  const Tesseract = await import('tesseract.js');
  // 'ind+eng' — most letters here are Indonesian, but headers/letterhead
  // sometimes mix in English/Latin abbreviations (Jl., No., etc.).
  const { data } = await Tesseract.recognize(file, 'ind+eng');
  return data.text;
}

/** Runs OCR on an attachment file (PDF or image), returning the raw text of page/photo 1. */
export async function extractTextFromAttachmentFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    const imageFile = await renderFirstPdfPageToImageFile(file);
    return ocrImageFile(imageFile);
  }
  if (file.type.startsWith('image/')) return ocrImageFile(file);
  throw new Error('Format lampiran tidak didukung untuk baca otomatis.');
}

export interface ParsedSuratFields {
  nomorSurat?: string;
  /** ISO yyyy-mm-dd, ready to drop straight into the date <Input>. */
  tanggalISO?: string;
}

const BULAN_ID: Record<string, string> = {
  januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
  juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
};

// Regex-based parsing of common Indonesian official-letter patterns. This is
// intentionally approximate — OCR text from a phone photo is noisy, so the
// goal is "close enough to prefill, still editable by hand", not perfect
// extraction.
export function parseSuratFields(text: string): ParsedSuratFields {
  const result: ParsedSuratFields = {};
  const flat = text.replace(/\r/g, '');

  // "Nomor : 123/Kk.28.7/OT.01.1/07/2026" style — look for a line
  // containing "nomor" (not "lampiran") followed by a slash-delimited code.
  const nomorLineMatch = flat.match(/nomor\s*[:.]?\s*([A-Za-z0-9./\-]{4,80})/i);
  if (nomorLineMatch) {
    const candidate = nomorLineMatch[1].trim().replace(/[.,;]+$/, '');
    if (/\d/.test(candidate)) result.nomorSurat = candidate;
  }

  // Long-form Indonesian date: "1 Agustus 2026" / "01 agustus 2026".
  const longDateMatch = flat.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (longDateMatch) {
    const bulan = BULAN_ID[longDateMatch[2].toLowerCase()];
    if (bulan) {
      result.tanggalISO = `${longDateMatch[3]}-${bulan}-${longDateMatch[1].padStart(2, '0')}`;
    }
  }
  // Numeric date fallback: dd/mm/yyyy or dd-mm-yyyy.
  if (!result.tanggalISO) {
    const numericMatch = flat.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
    if (numericMatch) {
      result.tanggalISO = `${numericMatch[3]}-${numericMatch[2].padStart(2, '0')}-${numericMatch[1].padStart(2, '0')}`;
    }
  }

  return result;
}

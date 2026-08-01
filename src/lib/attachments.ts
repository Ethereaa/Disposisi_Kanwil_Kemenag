import { supabase } from './supabase';
import type { Attachment } from '@/types';

const BUCKET = 'lampiran-surat';

// Defensive: `lampiran` comes back from Postgres as jsonb, so on old rows
// (created before this column existed, or if it's ever null) normalize to
// an empty array instead of letting `undefined`/`null` leak into the UI.
export function normalizeLampiran(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Attachment =>
      !!v && typeof v === 'object' && typeof (v as Attachment).path === 'string',
  );
}

function extOf(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

// Uploads one file into the given folder ("surat-masuk" / "surat-keluar" /
// "agenda-pimpinan") under a random, collision-proof name and returns the
// metadata to store in the record's `lampiran` column. `thumbnail`, if
// given, is stored inline in that same jsonb metadata (not as a separate
// Storage object) so lists/tables can show a preview without an extra
// signed-URL round-trip.
export async function uploadAttachment(file: File, folder: string, thumbnail?: string): Promise<Attachment> {
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extOf(file.name)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return {
    path,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    ...(thumbnail ? { thumbnail } : {}),
  };
}

export async function deleteAttachment(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

// The bucket is private, so viewing an attachment requires a short-lived
// signed URL generated on demand (valid 1 hour) rather than a permanent
// public link.
export async function getAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca gambar.'));
    img.src = dataUrl;
  });
}

/** Scan look applied to a captured photo before it's placed into the PDF. */
export type ScanMode = 'original' | 'bright' | 'bw';

// Cheap "local blur" via canvas downscale→upscale: drawing a small canvas
// back onto a full-size one lets the browser's own image smoothing act as
// a box blur. Used both as a local-background estimate (for the adaptive
// b/w threshold) and as the blur pass of a poor-man's unsharp mask — no
// nested pixel loops, no extra dependency.
function blurredCopy(source: HTMLCanvasElement, downscaleTo: number): Uint8ClampedArray {
  const w = source.width;
  const h = source.height;
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round((w / Math.max(w, h)) * downscaleTo));
  small.height = Math.max(1, Math.round((h / Math.max(w, h)) * downscaleTo));
  const smallCtx = small.getContext('2d');
  if (!smallCtx) return new Uint8ClampedArray(w * h * 4);
  smallCtx.drawImage(source, 0, 0, small.width, small.height);

  const big = document.createElement('canvas');
  big.width = w;
  big.height = h;
  const bigCtx = big.getContext('2d');
  if (!bigCtx) return new Uint8ClampedArray(w * h * 4);
  bigCtx.imageSmoothingEnabled = true;
  bigCtx.drawImage(small, 0, 0, w, h);
  return bigCtx.getImageData(0, 0, w, h).data;
}

// "CamScanner-style" enhance, done entirely with canvas pixel math — no
// OpenCV/ML dependency, per the request to try a pure-canvas approach
// first. Two modes:
//  - 'bright' ("Scan Terang"): contrast + brightness lift plus a light
//    unsharp-mask sharpen, so text reads darker/crisper and the paper
//    background lifts toward white — approximates CamScanner's default
//    filter without true per-pixel white-balancing.
//  - 'bw' ("Hitam Putih"): grayscale + an *adaptive* threshold (pixel vs.
//    its local neighborhood average, via blurredCopy) rather than one
//    global cutoff, so it holds up reasonably under uneven desk lighting.
// 'original' is a no-op so existing callers/behavior are unaffected.
export async function enhanceScanImage(dataUrl: string, mode: ScanMode): Promise<string> {
  if (mode === 'original') return dataUrl;
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  if (mode === 'bw') {
    const localBg = blurredCopy(canvas, 32); // background estimate, sampled coarsely
    const bias = 14; // how much darker than the local background counts as "ink"
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const bg = 0.299 * localBg[i] + 0.587 * localBg[i + 1] + 0.114 * localBg[i + 2];
      const v = lum < bg - bias ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  } else {
    const contrast = 1.35;
    const brightness = 18;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = (data[i + c] - 128) * contrast + 128 + brightness;
        data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    ctx.putImageData(imageData, 0, 0); // blur pass reads back from the canvas
    const blur = blurredCopy(canvas, Math.max(1, Math.round(Math.max(w, h) / 4)));
    const amount = 0.5;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] + (data[i + c] - blur[i + c]) * amount;
        data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Downscales a captured photo before it goes into the PDF — phone camera
// photos are often 3000-4000px wide (several MB each), which makes for a
// huge, slow-to-upload PDF over mobile data. 1600px on the long edge is
// still plenty sharp for a scanned letter.
async function resizedJpeg(file: File, maxDim = 1600, quality = 0.75): Promise<{ dataUrl: string; w: number; h: number }> {
  const original = await fileToDataUrl(file);
  const img = await loadImage(original);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: original, w: img.naturalWidth, h: img.naturalHeight };
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), w, h };
}

// Small preview thumbnail generated directly from an already-decoded data
// URL (as opposed to resizedJpeg, which starts from a File) — used so the
// thumbnail can reflect a scan filter that's already been applied.
async function thumbnailFromDataUrl(dataUrl: string, maxDim = 160, quality = 0.5): Promise<string> {
  const img = await loadImage(dataUrl);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// Merges one or more photos (each page of a letter) into a single PDF file,
// so "foto pakai HP" always ends up as one PDF attachment automatically —
// no separate scanning app needed for multi-page letters.
//
// `onProgress(current, total)` fires after each photo is processed, so the
// caller can show "Memproses foto 2/3..." instead of a generic spinner —
// useful since this can take a while on low-end phones. The returned
// `thumbnail` is a small preview (from the first photo) for use in
// list/table previews, generated here since we already have the image
// decoded in memory.
export async function photosToPdf(
  files: File[],
  fileName: string,
  onProgress?: (current: number, total: number) => void,
  scanMode: ScanMode = 'original',
): Promise<{ file: File; thumbnail: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let thumbnail = '';

  for (let i = 0; i < files.length; i++) {
    const resized = await resizedJpeg(files[i]);
    const { w, h } = resized;
    const dataUrl = scanMode === 'original' ? resized.dataUrl : await enhanceScanImage(resized.dataUrl, scanMode);
    if (i === 0) {
      // Thumbnail reflects the chosen filter too, so the list preview
      // matches what's actually inside the PDF.
      thumbnail = await thumbnailFromDataUrl(dataUrl);
    }
    const scale = Math.min(pageW / w, pageH / h);
    const drawW = w * scale;
    const drawH = h * scale;
    if (i > 0) doc.addPage();
    doc.addImage(dataUrl, 'JPEG', (pageW - drawW) / 2, (pageH - drawH) / 2, drawW, drawH);
    onProgress?.(i + 1, files.length);
  }

  const blob = doc.output('blob');
  const safeName = fileName.replace(/\.pdf$/i, '') || 'scan';
  const file = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
  return { file, thumbnail };
}

// Returns the page count of an already-uploaded PDF attachment, for the
// small page-count badge shown next to PDF items in the attachment list.
// Downloads the file from Storage (same bucket as the merge step) and
// reads only the page count via pdf-lib — the caller is expected to cache
// the result (keyed by path) so this isn't refetched on every render.
export async function getPdfPageCount(path: string): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error(`Gagal mengambil dokumen.`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

// Combines several already-uploaded attachments into ONE in-memory PDF —
// used for "Preview Semua": when a batch of separate lampiran documents
// (e.g. several letters scanned back-to-back) needs to be reviewed in a
// single click instead of opening each one individually. Nothing is
// re-uploaded or changed in Storage; this only builds a throwaway blob
// for the preview modal (see AttachmentField's handleViewMerged).
//
// Almost every attachment is already a PDF (photosToPdf converts photos
// before upload), but a raw image is handled too so the merge never
// silently skips a document.
export async function mergeAttachmentsToPdf(
  attachments: Attachment[],
  onProgress?: (current: number, total: number) => void,
): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    const { data, error } = await supabase.storage.from(BUCKET).download(a.path);
    if (error || !data) throw error ?? new Error(`Gagal mengambil ${a.name}.`);
    const bytes = new Uint8Array(await data.arrayBuffer());

    if (a.type === 'application/pdf') {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } else {
      const image = a.type === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
      const page = merged.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    onProgress?.(i + 1, attachments.length);
  }

  const mergedBytes = await merged.save();
  return new Blob([mergedBytes.slice()], { type: 'application/pdf' });
}
